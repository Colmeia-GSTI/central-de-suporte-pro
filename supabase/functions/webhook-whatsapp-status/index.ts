import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-secret",
};

/**
 * Webhook para receber atualizações de status do Evolution API
 * 
 * SECURITY: This webhook requires authentication via:
 * - X-Webhook-Secret header matching WEBHOOK_SECRET_WHATSAPP
 * - OR X-Webhook-Signature header with HMAC-SHA256 signature
 */

async function verifyWebhookAuth(req: Request, payload: string): Promise<boolean> {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET_WHATSAPP");
  
  if (!webhookSecret) {
    console.error("[WHATSAPP Webhook] CRITICAL: No webhook secret configured - denying request for security");
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
      console.warn(`[WHATSAPP Webhook] Unauthorized request from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.parse(rawPayload);
    console.log(`[WHATSAPP Webhook] Evolution webhook received from ${clientIP}:`, JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Evolution API envia eventos como MESSAGE_UPDATE, MESSAGES_UPSERT, etc.
    const messageId = payload?.key?.id || payload?.message?.key?.id;
    const status = payload?.status || payload?.update?.status;

    if (messageId && status) {
      const statusMap: Record<string, string> = {
        PENDING: "pending",
        SERVER_ACK: "sent",
        DELIVERY_ACK: "delivered",
        READ: "read",
        PLAYED: "read",
      };

      const mappedStatus = statusMap[status] || status.toLowerCase();

      const updateData: Record<string, unknown> = { status: mappedStatus };
      if (mappedStatus === "delivered") updateData.delivered_at = new Date().toISOString();
      if (mappedStatus === "read") updateData.read_at = new Date().toISOString();

      const { error } = await supabase
        .from("message_logs")
        .update(updateData)
        .eq("external_message_id", messageId);

      if (error) console.error("Error updating message status:", error);
      else console.log(`Updated message ${messageId} to status ${mappedStatus}`);
    }

    // Log for audit
    await supabase.from("audit_logs").insert({
      table_name: "message_logs",
      action: "WEBHOOK_WHATSAPP_STATUS",
      new_data: { message_id: messageId, status, source_ip: clientIP } as unknown as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[WHATSAPP Webhook] Error from ${clientIP}:`, error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
