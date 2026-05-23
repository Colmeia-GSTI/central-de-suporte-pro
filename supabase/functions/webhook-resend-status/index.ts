import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

/**
 * Webhook para receber eventos de status do Resend (entrega, abertura, bounce, etc).
 *
 * SECURITY: o Resend assina via Svix. Validamos a assinatura manualmente:
 *   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   esperado     = base64( HMAC-SHA256( secretBytes, signedContent ) )
 *   o header svix-signature traz uma lista "v1,<base64> v1,<base64>..." — basta
 *   um match. O secret vem como "whsec_<base64>"; usamos os bytes decodificados.
 *
 * Idempotência: cada entrega tem um svix-id único. Resend é at-least-once
 * (pode reenviar), então registramos o svix-id em webhook_events e ignoramos
 * duplicatas. A ordem de eventos NÃO é garantida — por isso só avançamos o
 * status para frente (não regredimos delivered -> sent, por exemplo).
 */

// base64 (string) -> Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ArrayBuffer -> base64
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function verifySvixSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[RESEND Webhook] CRITICAL: RESEND_WEBHOOK_SECRET não configurado - negando (fail closed)");
    return false;
  }
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn("[RESEND Webhook] Headers svix ausentes");
    return false;
  }

  // O secret tem o prefixo "whsec_"; a parte após o prefixo é base64.
  const secretB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = b64ToBytes(secretB64);
  } catch {
    console.error("[RESEND Webhook] Secret em formato inválido");
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = bufToB64(sigBuf);

  // svix-signature: lista separada por espaço, cada item "v1,<base64>"
  const parts = svixSignature.split(" ");
  for (const part of parts) {
    const [, sig] = part.split(",");
    if (sig && sig === expected) return true;
  }
  return false;
}

// Mapeia o event type do Resend -> status interno em message_logs.
// Retorna null para eventos que não alteram status (ex.: sent, delivery_delayed).
function mapEventToStatus(eventType: string): string | null {
  switch (eventType) {
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "read";
    case "email.bounced":
      return "failed";
    case "email.complained":
      return "failed";
    // email.sent, email.delivery_delayed, email.clicked não mudam o status base
    default:
      return null;
  }
}

// Ordem de "avanço" do status — só atualizamos para frente, nunca regredimos
// (eventos podem chegar fora de ordem segundo a doc do Resend).
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4, // failed é terminal; tratamos à parte
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

  try {
    const rawBody = await req.text();

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    const ok = await verifySvixSignature(rawBody, svixId, svixTimestamp, svixSignature);
    if (!ok) {
      console.warn(`[RESEND Webhook] Assinatura inválida de IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload?.type ?? "";
    const emailId: string | undefined = payload?.data?.email_id;
    const createdAt: string | undefined = payload?.created_at;
    // Resend pode mandar múltiplos destinatários; o primeiro "to" é o de referência
    const recipient: string | undefined = Array.isArray(payload?.data?.to)
      ? payload.data.to[0]
      : payload?.data?.to;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotência via svix-id (at-least-once delivery do Resend)
    if (svixId) {
      const { data: seen } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("webhook_source", "resend")
        .eq("event_id", svixId)
        .maybeSingle();
      if (seen) {
        console.log(`[RESEND Webhook] Evento duplicado ignorado: ${svixId}`);
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const mappedStatus = mapEventToStatus(eventType);

    if (emailId && mappedStatus) {
      // Buscar o log atual para não regredir status (ordem não garantida)
      const { data: current } = await supabase
        .from("message_logs")
        .select("status")
        .eq("external_message_id", emailId)
        .maybeSingle();

      const currentRank = current ? (STATUS_RANK[current.status] ?? -1) : -1;
      const newRank = STATUS_RANK[mappedStatus] ?? -1;

      // failed (bounce/complaint) sempre aplica; demais só avançam
      const shouldUpdate = mappedStatus === "failed" || newRank > currentRank;

      if (shouldUpdate) {
        const updateData: Record<string, unknown> = { status: mappedStatus };
        if (mappedStatus === "delivered") {
          updateData.delivered_at = createdAt ?? new Date().toISOString();
        }
        if (mappedStatus === "read") {
          updateData.read_at = createdAt ?? new Date().toISOString();
        }
        if (mappedStatus === "failed") {
          updateData.error_message =
            eventType === "email.complained" ? "Marcado como spam pelo destinatário" : "Bounce (destinatário rejeitou)";
        }

        const { error: updErr } = await supabase
          .from("message_logs")
          .update(updateData)
          .eq("external_message_id", emailId);
        if (updErr) console.error("[RESEND Webhook] Erro ao atualizar message_logs:", updErr);
        else console.log(`[RESEND Webhook] ${emailId} -> ${mappedStatus}`);
      } else {
        console.log(`[RESEND Webhook] Ignorando regressão de status para ${emailId} (${eventType})`);
      }
    }

    // Lacuna 3: alimentar suppressed_emails em bounce/complaint
    if (recipient && (eventType === "email.bounced" || eventType === "email.complained")) {
      const reason = eventType === "email.bounced" ? "bounced" : "complained";
      const { error: supErr } = await supabase
        .from("suppressed_emails")
        .upsert(
          {
            email: recipient.toLowerCase(),
            reason,
            source: "resend_webhook",
            detail: payload?.data?.bounce?.message ?? null,
          },
          { onConflict: "email" },
        );
      if (supErr) console.error("[RESEND Webhook] Erro ao suprimir email:", supErr);
      else console.log(`[RESEND Webhook] Email suprimido (${reason}): ${recipient}`);
    }

    // Registrar svix-id para idempotência + auditoria
    if (svixId) {
      await supabase.from("webhook_events").insert({
        event_id: svixId,
        webhook_source: "resend",
        event_type: eventType,
        payload: payload as unknown as Record<string, unknown>,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[RESEND Webhook] Erro de ${clientIP}:`, error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
