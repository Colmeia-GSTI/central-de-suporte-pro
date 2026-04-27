import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-secret",
};

/**
 * Webhook para receber notificações de status do Banco Inter
 * O Banco Inter envia atualizações de boletos/PIX quando há mudança de status
 * 
 * IMPORTANT: O Banco Inter envia o payload como ARRAY de objetos, não objeto simples.
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
  dataHoraSituacao?: string;
  valorTotalRecebimento?: number;
  valorTotalRecebido?: string;
  valorNominal?: number;
  origemRecebimento?: string;
  codigoBarras?: string;
  linhaDigitavel?: string;
  // PIX fields
  txid?: string;
  pixCopiaECola?: string;
  status?: string;
  valor?: { original?: string };
  // Common
  tipo?: string;
  urlPdf?: string;
}

// G3: Notify client when payment is confirmed (email)
// deno-lint-ignore no-explicit-any
async function notifyClientPaymentConfirmed(
  supabase: any,
  invoiceId: string,
  clientId: string,
  amount: number,
  paymentDate: string,
  method: string
) {
  try {
    const { data: client } = await supabase
      .from("clients")
      .select("name, email")
      .eq("id", clientId)
      .maybeSingle();
    if (!client?.email) {
      console.log("[WEBHOOK-BANCO-INTER] Cliente sem e-mail, pulando notificação");
      return;
    }
    const formattedAmount = Number(amount)?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0,00";
    let formattedDate = paymentDate;
    try { formattedDate = new Date(paymentDate).toLocaleDateString("pt-BR"); } catch { /* ignore */ }
    const html = `
      <h2 style="color: #16a34a;">✅ Pagamento Confirmado</h2>
      <p>Olá <strong>${client.name}</strong>,</p>
      <p>Confirmamos o recebimento do seu pagamento. Obrigado!</p>
      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin: 15px 0;">
        <p style="margin: 4px 0;"><strong>Valor:</strong> R$ ${formattedAmount}</p>
        <p style="margin: 4px 0;"><strong>Data:</strong> ${formattedDate}</p>
        <p style="margin: 4px 0;"><strong>Forma:</strong> ${method}</p>
      </div>
      <p>Em caso de dúvidas, entre em contato com nossa equipe.</p>
    `;
    await supabase.functions.invoke("send-email-resend", {
      body: {
        to: client.email,
        subject: "Pagamento confirmado",
        html,
        related_type: "invoice",
        related_id: invoiceId,
      },
    });
  } catch (err) {
    console.error("[WEBHOOK-BANCO-INTER] Erro ao notificar cliente:", err);
  }
}
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET_BANCO_INTER");
  
  if (!webhookSecret) {
    console.error("[WEBHOOK-BANCO-INTER] CRITICAL: No webhook secret configured - denying request for security");
    return false;
  }

  const secretHeader = req.headers.get("X-Webhook-Secret");
  if (secretHeader === webhookSecret) {
    return true;
  }

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

async function processPayload(
  supabase: any,
  payload: InterWebhookPayload,
  clientIP: string
) {
  // Idempotency check
  const eventId = payload.codigoSolicitacao || payload.txid || payload.nossoNumero || `unknown-${Date.now()}`;
  const idempotencyKey = `${payload.situacao || payload.status || "event"}-${eventId}`;

  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("webhook_source", "banco_inter")
    .eq("event_id", idempotencyKey)
    .maybeSingle();

  if (existingEvent) {
    console.log(`[WEBHOOK-BANCO-INTER] Evento já processado (idempotency): ${idempotencyKey}`);
    return { skipped: true, reason: "already_processed" };
  }

  // Record event before processing
  await supabase.from("webhook_events").insert({
    webhook_source: "banco_inter",
    event_id: idempotencyKey,
    event_type: payload.situacao || payload.status || "unknown",
    payload: payload as unknown as Record<string, unknown>,
  });

  // Determine if it's boleto or PIX
  const isBoleto = !!payload.codigoSolicitacao || !!payload.nossoNumero;
  const isPix = !!payload.txid && !isBoleto;

  if (isBoleto && payload.seuNumero) {
    const invoiceNumber = parseInt(payload.seuNumero, 10);
    console.log("[WEBHOOK-BANCO-INTER] Atualizando boleto para fatura:", invoiceNumber);

    const updateData: Record<string, unknown> = {};

    if (payload.codigoBarras) {
      updateData.boleto_barcode = payload.linhaDigitavel || payload.codigoBarras;
    }

    if (payload.urlPdf) {
      updateData.boleto_url = payload.urlPdf;
    }

    // Check if paid
    if (
      payload.situacao === "PAGO" ||
      payload.situacao === "RECEBIDO" ||
      payload.situacao === "LIQUIDADO"
    ) {
      updateData.status = "paid";
      updateData.paid_date = payload.dataHoraSituacao || payload.dataSituacao || new Date().toISOString();
      updateData.payment_method = "boleto";
      updateData.paid_amount = payload.valorTotalRecebimento || payload.valorNominal || null;
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

      // Criar entrada financeira e audit log para pagamentos confirmados
      if (updateData.status === "paid") {
        const { data: updatedInvoice } = await supabase
          .from("invoices")
          .select("id, invoice_number, client_id, amount")
          .eq("invoice_number", invoiceNumber)
          .single();

        if (updatedInvoice) {
          const paidAmount = updateData.paid_amount || updatedInvoice.amount;

          const { error: feError } = await supabase.from("financial_entries").insert({
            client_id: updatedInvoice.client_id,
            invoice_id: updatedInvoice.id,
            type: "receita",
            amount: paidAmount,
            description: `Pagamento automático (boleto) - Fatura #${invoiceNumber}`,
            date: updateData.paid_date as string,
            category: "pagamento_automatico",
          });

          if (feError) {
            console.error("[WEBHOOK-BANCO-INTER] Erro ao criar financial_entry:", feError);
          } else {
            console.log("[WEBHOOK-BANCO-INTER] financial_entry criada com sucesso");
          }

          const { error: auditError } = await supabase.from("audit_logs").insert({
            table_name: "invoices",
            record_id: updatedInvoice.id,
            action: "WEBHOOK_PAYMENT_CONFIRMED",
            new_data: {
              paid_amount: paidAmount,
              paid_date: updateData.paid_date,
              payment_method: "boleto",
              source: "webhook_banco_inter",
              origem_recebimento: payload.origemRecebimento,
            } as unknown as Record<string, unknown>,
          });

          if (auditError) {
            console.error("[WEBHOOK-BANCO-INTER] Erro ao criar audit_log:", auditError);
          }
        }
      }
    }
  } else if (isPix && payload.txid) {
    console.log("[WEBHOOK-BANCO-INTER] Atualizando PIX:", payload.txid);

    if (payload.status === "CONCLUIDA" || payload.status === "PAGO" || payload.situacao === "RECEBIDO") {
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
            paid_date: payload.dataHoraSituacao || new Date().toISOString(),
            payment_method: "pix",
          })
          .eq("id", invoices[0].id);

        if (updateError) {
          console.error("[WEBHOOK-BANCO-INTER] Erro ao atualizar PIX:", updateError);
          throw updateError;
        }
        console.log("[WEBHOOK-BANCO-INTER] PIX atualizado com sucesso");

        // Criar entrada financeira para PIX
        const pixInvoice = invoices[0];
        const { data: fullInvoice } = await supabase
          .from("invoices")
          .select("id, invoice_number, client_id, amount")
          .eq("id", pixInvoice.id)
          .single();

        if (fullInvoice) {
          const pixAmount = payload.valor?.original
            ? parseFloat(payload.valor.original)
            : fullInvoice.amount;

          const { error: feError } = await supabase.from("financial_entries").insert({
            client_id: fullInvoice.client_id,
            invoice_id: fullInvoice.id,
            type: "receita",
            amount: pixAmount,
            description: `Pagamento automático (PIX) - Fatura #${fullInvoice.invoice_number}`,
            date: payload.dataHoraSituacao || new Date().toISOString(),
            category: "pagamento_automatico",
          });

          if (feError) {
            console.error("[WEBHOOK-BANCO-INTER] Erro ao criar financial_entry PIX:", feError);
          }

          await supabase.from("audit_logs").insert({
            table_name: "invoices",
            record_id: fullInvoice.id,
            action: "WEBHOOK_PAYMENT_CONFIRMED",
            new_data: {
              paid_amount: pixAmount,
              payment_method: "pix",
              source: "webhook_banco_inter",
            } as unknown as Record<string, unknown>,
          });
        }
      }
    }
  }

  return { processed: true };
}

Deno.serve(async (req) => {
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

    // Parse payload - Banco Inter sends as ARRAY, not single object
    const parsed = JSON.parse(rawPayload);
    const payloads: InterWebhookPayload[] = Array.isArray(parsed) ? parsed : [parsed];
    
    console.log(`[WEBHOOK-BANCO-INTER] Recebido ${payloads.length} evento(s) de ${clientIP}`);

    const results = [];
    for (const payload of payloads) {
      console.log(`[WEBHOOK-BANCO-INTER] Processando:`, JSON.stringify(payload).slice(0, 300));
      const result = await processPayload(supabase, payload, clientIP);
      results.push(result);
    }

    // Log the webhook call for audit
    await supabase.from("audit_logs").insert({
      table_name: "invoices",
      action: "WEBHOOK_BANCO_INTER",
      new_data: { payloads_count: payloads.length, source_ip: clientIP } as unknown as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[WEBHOOK-BANCO-INTER] Error from ${clientIP}:`, errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
