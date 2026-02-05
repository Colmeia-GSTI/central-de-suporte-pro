import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-secret",
};

/**
 * Webhook para receber notificações de status do Banco Inter
 * O Banco Inter envia atualizações de boletos/PIX quando há mudança de status
 * 
 * SECURITY: This webhook requires authentication via:
 * - X-Webhook-Secret header matching WEBHOOK_SECRET_BANCO_INTER
 * - OR X-Webhook-Signature header with HMAC-SHA256 signature
 */

interface InterWebhookPayload {
  codigoSolicitacao?: string;
  nossoNumero?: string;
  seuNumero?: string;
  situacao?: string;
  dataSituacao?: string;
  valorTotalRecebimento?: number;
  valorNominal?: number;
  codigoBarras?: string;
  linhaDigitavel?: string;
  // PIX fields
  txid?: string;
  status?: string;
  valor?: { original?: string };
  // Common
  tipo?: string;
}

async function verifyWebhookAuth(req: Request, payload: string): Promise<boolean> {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET_BANCO_INTER");
  
  if (!webhookSecret) {
    console.error("[WEBHOOK-BANCO-INTER] CRITICAL: No webhook secret configured - denying request for security");
    return false; // Fail closed: deny access if secret not configured
  }

  // Check for secret header (simple token auth)
  const secretHeader = req.headers.get("X-Webhook-Secret");
  if (secretHeader === webhookSecret) {
    return true;
  }

  // Check for signature header (HMAC-SHA256)
  const signatureHeader = req.headers.get("X-Webhook-Signature");
  if (signatureHeader) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expectedSig = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (signatureHeader === expectedSig || signatureHeader === `sha256=${expectedSig}`) {
      return true;
    }
  }

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  
  try {
    const rawPayload = await req.text();
    
    // Verify webhook authentication
    const isAuthenticated = await verifyWebhookAuth(req, rawPayload);
    if (!isAuthenticated) {
      console.warn(`[WEBHOOK-BANCO-INTER] Unauthorized request from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload: InterWebhookPayload = JSON.parse(rawPayload);
    console.log(`[WEBHOOK-BANCO-INTER] Payload recebido from ${clientIP}:`, JSON.stringify(payload));

    // Determine if it's boleto or PIX
    const isBoleto = !!payload.codigoSolicitacao || !!payload.nossoNumero;
    const isPix = !!payload.txid;

    if (isBoleto && payload.seuNumero) {
      // seuNumero contains our invoice_number
      const invoiceNumber = parseInt(payload.seuNumero, 10);
      
      console.log("[WEBHOOK-BANCO-INTER] Atualizando boleto para fatura:", invoiceNumber);

      // Update invoice with boleto details
      const updateData: Record<string, unknown> = {};

      if (payload.codigoBarras) {
        updateData.boleto_barcode = payload.codigoBarras;
      }

      if (payload.linhaDigitavel) {
        // The linha digitavel can be used to generate payment URL
        updateData.boleto_url = `https://inter.co/boleto/${payload.codigoBarras}`;
      }

      // Check if paid
      if (
        payload.situacao === "PAGO" ||
        payload.situacao === "RECEBIDO" ||
        payload.situacao === "LIQUIDADO"
      ) {
        updateData.status = "paid";
        updateData.paid_date = payload.dataSituacao || new Date().toISOString();
        updateData.payment_method = "boleto";
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from("invoices")
          .update(updateData)
          .eq("invoice_number", invoiceNumber);

        if (error) {
          console.error("[WEBHOOK-BANCO-INTER] Erro ao atualizar fatura:", error);
          throw error;
        }

        console.log("[WEBHOOK-BANCO-INTER] Fatura atualizada com sucesso");
      }
    } else if (isPix && payload.txid) {
      console.log("[WEBHOOK-BANCO-INTER] Atualizando PIX:", payload.txid);

      // PIX status update - txid might contain our reference
      // The txid format depends on how we created the PIX
      // Usually we'd store the txid when creating the PIX
      
      if (payload.status === "CONCLUIDA" || payload.status === "PAGO") {
        // Find invoice by pix_code containing txid or by stored txid
        const { data: invoices, error: searchError } = await supabase
          .from("invoices")
          .select("id")
          .ilike("pix_code", `%${payload.txid}%`)
          .limit(1);

        if (!searchError && invoices && invoices.length > 0) {
          const { error: updateError } = await supabase
            .from("invoices")
            .update({
              status: "paid",
              paid_date: new Date().toISOString(),
              payment_method: "pix",
            })
            .eq("id", invoices[0].id);

          if (updateError) {
            console.error("[WEBHOOK-BANCO-INTER] Erro ao atualizar PIX:", updateError);
            throw updateError;
          }

          console.log("[WEBHOOK-BANCO-INTER] PIX atualizado com sucesso");
        }
      }
    }

    // Log the webhook call for audit
    await supabase.from("audit_logs").insert({
      table_name: "invoices",
      action: "WEBHOOK_BANCO_INTER",
      new_data: { ...payload, source_ip: clientIP } as unknown as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[WEBHOOK-BANCO-INTER] Error from ${clientIP}:`, errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
