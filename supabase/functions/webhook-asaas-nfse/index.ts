import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

// ============ EVENT LOGGING ============
async function logNfseEvent(
  supabase: SupabaseClient,
  nfseHistoryId: string,
  eventType: string,
  eventLevel: "info" | "warn" | "error",
  message: string,
  correlationId: string,
  details?: Record<string, unknown>
) {
  try {
    await supabase.from("nfse_event_logs").insert({
      nfse_history_id: nfseHistoryId,
      event_type: eventType,
      event_level: eventLevel,
      message,
      details: details || null,
      correlation_id: correlationId,
      source: "webhook-asaas-nfse",
    });
  } catch (e) {
    console.warn("[WEBHOOK-ASAAS] Failed to log event:", e);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse error code from prefeitura status description
function parseStatusDescription(statusDescription: string | null): {
  codigo: string | null;
  descricao: string;
} {
  if (!statusDescription) {
    return { codigo: null, descricao: "Erro desconhecido" };
  }
  const codigoMatch = statusDescription.match(/C[oó]digo:\s*(\w+)/i);
  const descMatch = statusDescription.match(/Descri[cç][aã]o:\s*(.+?)(?:\r?\n|$)/i);
  return {
    codigo: codigoMatch?.[1] || null,
    descricao: descMatch?.[1]?.trim() || statusDescription,
  };
}

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "processando",
  SYNCHRONIZED: "processando",
  AUTHORIZATION_PENDING: "processando",
  AUTHORIZED: "autorizada",
  CANCELED: "cancelada",
  CANCELLATION_PENDING: "processando",
  CANCELLATION_DENIED: "erro",
  ERROR: "erro",
};

// Payment status for payment webhooks
const PAYMENT_STATUS_MAP: Record<string, string> = {
  PENDING: "pendente",
  RECEIVED: "pago",
  CONFIRMED: "pago",
  RECEIVED_IN_CASH: "pago",
  OVERDUE: "vencida",
  REFUNDED: "estornada",
  DELETED: "cancelada",
};

async function verifyWebhookAuth(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET_ASAAS");

  // Check token in query params first (fastest check)
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("token");
  
  if (webhookSecret && tokenParam === webhookSecret) {
    return true;
  }

  // Check X-Webhook-Secret header
  const headerToken = req.headers.get("X-Webhook-Secret");
  if (webhookSecret && headerToken === webhookSecret) {
    return true;
  }

  // Check against stored webhook_token in integration_settings
  const { data: settings } = await supabase
    .from("integration_settings")
    .select("settings")
    .eq("integration_type", "asaas")
    .maybeSingle();

  if (settings?.settings) {
    const asaasSettings = settings.settings as { webhook_token?: string };
    if (asaasSettings.webhook_token && tokenParam === asaasSettings.webhook_token) {
      return true;
    }
  }

  // If no secret configured and no valid token, fail closed
  if (!webhookSecret) {
    console.error("[WEBHOOK-ASAAS] CRITICAL: No WEBHOOK_SECRET_ASAAS configured - denying request");
  }

  return false;
}

async function downloadAndStoreFile(
  supabase: SupabaseClient,
  url: string,
  nfseId: string,
  fileType: "xml" | "pdf"
): Promise<string | null> {
  try {
    console.log(`[WEBHOOK-ASAAS] Baixando ${fileType} de ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[WEBHOOK-ASAAS] Falha ao baixar ${fileType}: ${response.status}`);
      return null;
    }

    const content = await response.arrayBuffer();
    const fileName = `${nfseId}.${fileType}`;
    const filePath = `nfse/${fileName}`;

    const { error } = await supabase.storage
      .from("nfse-files")
      .upload(filePath, content, {
        contentType: fileType === "xml" ? "application/xml" : "application/pdf",
        upsert: true,
      });

    if (error) {
      console.error(`[WEBHOOK-ASAAS] Erro ao salvar ${fileType}:`, error);
      return null;
    }

    console.log(`[WEBHOOK-ASAAS] ${fileType.toUpperCase()} salvo em ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`[WEBHOOK-ASAAS] Erro ao processar ${fileType}:`, error);
    return null;
  }
}

async function createNotification(
  supabase: SupabaseClient,
  title: string,
  message: string,
  type: "info" | "success" | "warning" | "error"
) {
  try {
    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "financial"]);

    if (!adminUsers || adminUsers.length === 0) return;

    const notifications = adminUsers.map((user) => ({
      user_id: user.user_id,
      title,
      message,
      type,
      read: false,
    }));

    await supabase.from("notifications").insert(notifications);
    console.log(`[WEBHOOK-ASAAS] Notificações criadas para ${adminUsers.length} usuários`);
  } catch (error) {
    console.error("[WEBHOOK-ASAAS] Erro ao criar notificações:", error);
  }
}

// Background processing for invoice (NFS-e) webhooks
async function processInvoiceWebhook(
  supabase: SupabaseClient,
  event: string,
  invoice: Record<string, unknown>
) {
  const correlationId = `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[WEBHOOK-ASAAS] Processando invoice webhook: ${event}`);

  if (!invoice?.id) {
    console.log("[WEBHOOK-ASAAS] Payload sem invoice.id, ignorando");
    return;
  }

  const { data: nfseRecord, error: findError } = await supabase
    .from("nfse_history")
    .select("id, status, valor_servico, client_id, invoice_id, numero_nfse")
    .eq("asaas_invoice_id", invoice.id)
    .maybeSingle();

  if (findError) {
    console.error("[WEBHOOK-ASAAS] Erro ao buscar NFS-e:", findError);
    return;
  }

  if (!nfseRecord) {
    console.log(`[WEBHOOK-ASAAS] NFS-e não encontrada para asaas_invoice_id: ${invoice.id}`);
    return;
  }

  const invoiceStatus = invoice.status as string;
  const newStatus = STATUS_MAP[invoiceStatus] || "processando";
  const oldStatus = nfseRecord.status;

  console.log(`[WEBHOOK-ASAAS] ${invoice.id}: ${oldStatus} -> ${newStatus}`);
  
  // Log webhook received
  await logNfseEvent(supabase, nfseRecord.id, "webhook", "info",
    `Webhook recebido: ${event}. Status Asaas: ${invoiceStatus}`,
    correlationId, { event, asaas_status: invoiceStatus, asaas_invoice_id: invoice.id });

  const updateData: Record<string, unknown> = {
    status: newStatus,
    asaas_status: invoiceStatus,
    updated_at: new Date().toISOString(),
  };

  if (invoiceStatus === "AUTHORIZED") {
    updateData.numero_nfse = String(invoice.number || "");
    updateData.codigo_verificacao = invoice.validationCode;
    updateData.data_autorizacao = new Date().toISOString();

    if (invoice.pdfUrl) {
      const pdfPath = await downloadAndStoreFile(supabase, invoice.pdfUrl as string, nfseRecord.id, "pdf");
      if (pdfPath) {
        updateData.pdf_url = pdfPath;
        await logNfseEvent(supabase, nfseRecord.id, "file_download", "info",
          "PDF da NFS-e salvo com sucesso", correlationId, { file_type: "pdf", path: pdfPath });
      }
    }

    if (invoice.xmlUrl) {
      const xmlPath = await downloadAndStoreFile(supabase, invoice.xmlUrl as string, nfseRecord.id, "xml");
      if (xmlPath) {
        updateData.xml_url = xmlPath;
        await logNfseEvent(supabase, nfseRecord.id, "file_download", "info",
          "XML da NFS-e salvo com sucesso", correlationId, { file_type: "xml", path: xmlPath });
      }
    }

    // Log status change to authorized
    await logNfseEvent(supabase, nfseRecord.id, "status_change", "info",
      `NFS-e autorizada! Número: ${invoice.number}. Valor: R$ ${nfseRecord.valor_servico?.toFixed(2)}`,
      correlationId, { old_status: oldStatus, new_status: "autorizada", numero_nfse: invoice.number });

    await createNotification(
      supabase,
      "NFS-e Autorizada via Asaas",
      `NFS-e #${invoice.number} foi autorizada. Valor: R$ ${nfseRecord.valor_servico?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      "success"
    );
  }

  if (invoiceStatus === "ERROR" || invoiceStatus === "CANCELLATION_DENIED") {
    const errorDescription = (invoice.statusDescription as string) || "Erro no processamento da NFS-e";
    const parsed = parseStatusDescription(errorDescription);
    
    updateData.mensagem_retorno = errorDescription;
    updateData.codigo_retorno = parsed.codigo || "ERROR";

    // Log error event with parsed details
    await logNfseEvent(supabase, nfseRecord.id, "error", "error",
      `Erro na NFS-e: ${parsed.descricao}`,
      correlationId, { 
        asaas_status: invoiceStatus, 
        error_description: errorDescription,
        codigo_prefeitura: parsed.codigo,
      });
    
    // Special handling for E0014 (DPS duplicada)
    if (parsed.codigo === "E0014") {
      await logNfseEvent(supabase, nfseRecord.id, "dps_duplicada", "warn",
        "DPS duplicada detectada - nota possivelmente já emitida no Portal Nacional",
        correlationId, {
          asaas_invoice_id: invoice.id,
          sugestao: "Verifique no Portal Nacional se existe nota autorizada para este cliente/valor",
        });
    }

    await createNotification(
      supabase,
      "Erro na NFS-e via Asaas",
      `Erro ao processar NFS-e: ${parsed.descricao.slice(0, 100)}`,
      "error"
    );
  }

  if (invoiceStatus === "CANCELED") {
    // Log cancellation
    await logNfseEvent(supabase, nfseRecord.id, "cancelled", "info",
      `NFS-e cancelada. Número: ${invoice.number || nfseRecord.numero_nfse}`,
      correlationId, { numero_nfse: invoice.number || nfseRecord.numero_nfse });

    await createNotification(
      supabase,
      "NFS-e Cancelada",
      `NFS-e #${invoice.number || nfseRecord.numero_nfse} foi cancelada`,
      "warning"
    );
  }

  const { error: updateError } = await supabase
    .from("nfse_history")
    .update(updateData)
    .eq("id", nfseRecord.id);

  if (updateError) {
    console.error("[WEBHOOK-ASAAS] Erro ao atualizar NFS-e:", updateError);
    return;
  }

  console.log(`[WEBHOOK-ASAAS] NFS-e ${nfseRecord.id} atualizada com sucesso`);
}

// Background processing for payment webhooks
async function processPaymentWebhook(
  supabase: SupabaseClient,
  event: string,
  payment: Record<string, unknown>
) {
  console.log(`[WEBHOOK-ASAAS] Processando payment webhook: ${event}, payment_id: ${payment.id}`);
  
  const paymentStatus = payment.status as string;
  const externalReference = payment.externalReference as string | null;
  
  console.log(`[WEBHOOK-ASAAS] Payment status: ${paymentStatus}, value: ${payment.value}, externalRef: ${externalReference}`);
  
  // Update invoice status based on payment event
  if (externalReference) {
    // externalReference should be the invoice_id
    const newStatus = PAYMENT_STATUS_MAP[paymentStatus];
    
    if (newStatus === "pago") {
      console.log(`[WEBHOOK-ASAAS] Marcando fatura ${externalReference} como paga`);
      
      const paymentDate = (payment.paymentDate as string) || new Date().toISOString().split("T")[0];
      
      const { data: updatedInvoice, error } = await supabase
        .from("invoices")
        .update({ 
          status: "paid", 
          paid_date: paymentDate,
          payment_method: payment.billingType as string || null,
        })
        .eq("id", externalReference)
        .in("status", ["pending", "overdue"])
        .select("id, contract_id, client_id, amount, auto_nfse_emitted")
        .maybeSingle();
      
      if (error) {
        console.error(`[WEBHOOK-ASAAS] Erro ao atualizar fatura:`, error);
      } else if (updatedInvoice) {
        console.log(`[WEBHOOK-ASAAS] Fatura ${externalReference} marcada como paga`);
        
        // Auto-emit NFS-e if invoice has a contract and hasn't been emitted yet
        if (updatedInvoice.contract_id && !updatedInvoice.auto_nfse_emitted) {
          try {
            console.log(`[WEBHOOK-ASAAS] Auto-emitindo NFS-e para fatura ${externalReference}`);
            
            const { data: contract } = await supabase
              .from("contracts")
              .select("name, description, nfse_descricao_customizada, nfse_service_code")
              .eq("id", updatedInvoice.contract_id)
              .single();
            
            if (contract?.nfse_service_code) {
              await supabase.functions.invoke("asaas-nfse", {
                body: {
                  action: "emit",
                  client_id: updatedInvoice.client_id,
                  invoice_id: updatedInvoice.id,
                  contract_id: updatedInvoice.contract_id,
                  value: updatedInvoice.amount,
                  service_description: contract.nfse_descricao_customizada || contract.description || `Prestação de serviços - ${contract.name}`,
                  municipal_service_code: contract.nfse_service_code || undefined,
                },
              });
              
              await supabase
                .from("invoices")
                .update({ auto_nfse_emitted: true })
                .eq("id", updatedInvoice.id);
              
              console.log(`[WEBHOOK-ASAAS] NFS-e emitida automaticamente para fatura ${externalReference}`);
            } else {
              console.log(`[WEBHOOK-ASAAS] Contrato sem nfse_service_code, NFS-e não emitida automaticamente`);
            }
          } catch (nfseError) {
            console.error(`[WEBHOOK-ASAAS] Erro ao auto-emitir NFS-e:`, nfseError);
          }
        }
        
        // Create notification for staff
        await createNotification(
          supabase,
          "Pagamento Confirmado via Asaas",
          `Fatura recebeu confirmação de pagamento. Valor: R$ ${(payment.value as number)?.toFixed(2)}`,
          "success"
        );
      }
    } else if (newStatus === "vencida") {
      console.log(`[WEBHOOK-ASAAS] Fatura ${externalReference} marcada como vencida`);
      
      await supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", externalReference)
        .in("status", ["pending"]);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Verify webhook authentication FIRST
    const isValid = await verifyWebhookAuth(req, supabase);
    if (!isValid) {
      console.error("[WEBHOOK-ASAAS] Autenticação inválida");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const event = payload.event as string;
    console.log("[WEBHOOK-ASAAS] Evento recebido:", event);

    // Generate idempotency key from event data
    const eventId = payload.payment?.id || payload.invoice?.id || `${event}-${Date.now()}`;
    const idempotencyKey = `${event}-${eventId}`;

    // Check idempotency - skip if already processed
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("webhook_source", "asaas")
      .eq("event_id", idempotencyKey)
      .maybeSingle();

    if (existing) {
      console.log(`[WEBHOOK-ASAAS] Evento já processado (idempotency): ${idempotencyKey}`);
      return new Response(
        JSON.stringify({ success: true, event, skipped: true, reason: "already_processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the event BEFORE processing to prevent race conditions
    await supabase.from("webhook_events").insert({
      webhook_source: "asaas",
      event_id: idempotencyKey,
      event_type: event,
      payload: payload,
    });

    // Determine event type and process in background
    const isInvoiceEvent = event?.startsWith("INVOICE_") || payload.invoice;
    const isPaymentEvent = event?.startsWith("PAYMENT_") || payload.payment;

    if (isInvoiceEvent && payload.invoice) {
      EdgeRuntime.waitUntil(processInvoiceWebhook(supabase, event, payload.invoice));
    } else if (isPaymentEvent && payload.payment) {
      EdgeRuntime.waitUntil(processPaymentWebhook(supabase, event, payload.payment));
    } else {
      console.log(`[WEBHOOK-ASAAS] Evento não processado: ${event}`);
    }

    return new Response(
      JSON.stringify({ success: true, event, received_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[WEBHOOK-ASAAS] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Handle shutdown for background tasks
addEventListener("beforeunload", (ev) => {
  console.log("[WEBHOOK-ASAAS] Função encerrando:", (ev as CustomEvent).detail?.reason);
});
