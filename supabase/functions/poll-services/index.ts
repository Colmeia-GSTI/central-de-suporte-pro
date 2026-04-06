import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * CONSOLIDATED POLLING SERVICE
 * Replaces: poll-boleto-status, poll-asaas-nfse-status, poll-nfse-status
 * 
 * Runs as FALLBACK ONLY - webhooks handle real-time updates
 * Only processes records older than 2 HOURS to catch missed webhooks
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PollRequest {
  services?: ("boleto" | "asaas_nfse" | "boleto_payments")[];
  invoice_id?: string; // Optional: check a specific invoice
}

interface InterSettings {
  client_id: string;
  client_secret: string;
  certificate_crt?: string;
  certificate_key?: string;
  environment: "sandbox" | "production";
}

interface AsaasSettings {
  api_key: string;
  wallet_id?: string;
  environment: "sandbox" | "production";
}

const ASAAS_URLS = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://api.asaas.com/v3",
};

const ASAAS_STATUS_MAP: Record<string, string> = {
  SCHEDULED: "processando",
  SYNCHRONIZED: "processando",
  AUTHORIZATION_PENDING: "processando",
  AUTHORIZED: "autorizada",
  CANCELED: "cancelada",
  CANCELLATION_PENDING: "processando",
  CANCELLATION_DENIED: "erro",
  ERROR: "erro",
};

// ============ HELPER FUNCTIONS ============

async function downloadAndStoreFile(
  supabase: SupabaseClient,
  url: string,
  nfseId: string,
  fileType: "xml" | "pdf"
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const content = await response.arrayBuffer();
    const filePath = `nfse/${nfseId}.${fileType}`;

    const { error } = await supabase.storage
      .from("nfse-files")
      .upload(filePath, content, {
        contentType: fileType === "xml" ? "application/xml" : "application/pdf",
        upsert: true,
      });

    return error ? null : filePath;
  } catch {
    return null;
  }
}

async function notifyAdmins(
  supabase: SupabaseClient,
  title: string,
  message: string,
  type: string,
  relatedType?: string,
  relatedId?: string
) {
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "financial"]);

  if (!admins?.length) return;

  await supabase.from("notifications").insert(
    admins.map((a) => ({
      user_id: a.user_id,
      title,
      message,
      type,
      related_type: relatedType,
      related_id: relatedId,
    }))
  );
}

function createMtlsClient(certBase64: string, keyBase64: string): Deno.HttpClient {
  const cert = atob(certBase64);
  const key = atob(keyBase64);
  return Deno.createHttpClient({ caCerts: [], cert, key });
}

// ============ BOLETO POLLING ============

async function pollBoletos(supabase: SupabaseClient): Promise<{ processed: number; updated: number }> {
  console.log("[POLL-SERVICES] Verificando boletos...");

  const { data: settingsData } = await supabase
    .from("integration_settings")
    .select("settings, is_active")
    .eq("integration_type", "banco_inter")
    .maybeSingle();

  if (!settingsData?.is_active) {
    console.log("[POLL-SERVICES] Banco Inter não configurado");
    return { processed: 0, updated: 0 };
  }

  const settings = settingsData.settings as InterSettings;
  if (!settings.certificate_crt || !settings.certificate_key) {
    return { processed: 0, updated: 0 };
  }

  const httpClient = createMtlsClient(settings.certificate_crt, settings.certificate_key);
  const baseUrl = settings.environment === "production"
    ? "https://cdpj.partners.bancointer.com.br"
    : "https://cdpj-sandbox.partners.bancointer.com.br";

  const mtlsFetch = (url: string, options: RequestInit) =>
    fetch(url, { ...options, client: httpClient } as RequestInit);

  const tokenResponse = await mtlsFetch(`${baseUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.client_id,
      client_secret: settings.client_secret,
      grant_type: "client_credentials",
      scope: "boleto-cobranca.read",
    }),
  });

  if (!tokenResponse.ok) {
    console.error("[POLL-SERVICES] Erro auth Banco Inter");
    return { processed: 0, updated: 0 };
  }

  const { access_token } = await tokenResponse.json();
  let processed = 0, updated = 0;

  // === PASSO 1: boletos sem barcode ===
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: pendingInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, notes, amount, client_id")
    .eq("payment_method", "boleto")
    .is("boleto_barcode", null)
    .in("status", ["pending", "overdue"])
    .lt("created_at", twoHoursAgo)
    .limit(10);

  for (const invoice of (pendingInvoices || [])) {
    const match = invoice.notes?.match(/codigoSolicitacao:([a-f0-9-]+)/i);
    if (!match) continue;

    processed++;
    try {
      const statusResponse = await mtlsFetch(
        `${baseUrl}/cobranca/v3/cobrancas/${match[1]}`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      if (!statusResponse.ok) continue;

      const data = await statusResponse.json();
      const cobranca = data.cobranca || data;
      const boleto = data.boleto || {};
      const codigoBarras = cobranca.linhaDigitavel || boleto.linhaDigitavel;

      if (codigoBarras) {
        const updatePayload: Record<string, unknown> = {
          boleto_barcode: codigoBarras,
          notes: invoice.notes?.replace(/\s*codigoSolicitacao:[a-f0-9-]+/gi, "").trim() || null,
        };

        // Download PDF via endpoint dedicado /pdf (retorna base64)
        try {
          const pdfResponse = await mtlsFetch(
            `${baseUrl}/cobranca/v3/cobrancas/${match[1]}/pdf`,
            { headers: { Authorization: `Bearer ${access_token}` } }
          );
          if (pdfResponse.ok) {
            const pdfData = await pdfResponse.json();
            if (pdfData.pdf) {
              const pdfBytes = Uint8Array.from(atob(pdfData.pdf), (c: string) => c.charCodeAt(0));
              const boletoPath = `boletos/${invoice.id}/boleto.pdf`;
              const { error: uploadError } = await supabase.storage
                .from("invoice-documents")
                .upload(boletoPath, pdfBytes, {
                  contentType: "application/pdf",
                  upsert: true,
                });

              if (!uploadError) {
                updatePayload.boleto_url = `invoice-documents/${boletoPath}`;
                updatePayload.boleto_status = "enviado";

                // Registrar na tabela invoice_documents
                await supabase.from("invoice_documents").insert({
                  invoice_id: invoice.id,
                  document_type: "boleto_pdf",
                  file_path: boletoPath,
                  file_name: `boleto_${invoice.invoice_number}.pdf`,
                  mime_type: "application/pdf",
                  bucket_name: "invoice-documents",
                  storage_provider: "supabase",
                  metadata: { source: "poll_services_fallback", codigoSolicitacao: match[1] },
                });

                console.log(`[POLL-SERVICES] PDF do boleto ${invoice.invoice_number} salvo no Storage`);
              } else {
                console.warn(`[POLL-SERVICES] Erro upload PDF ${invoice.id}:`, uploadError);
                updatePayload.boleto_url = boleto.urlPdf || null;
              }
            } else {
              updatePayload.boleto_url = boleto.urlPdf || null;
            }
          } else {
            console.warn(`[POLL-SERVICES] Erro ao obter PDF ${invoice.id}:`, await pdfResponse.text());
            updatePayload.boleto_url = boleto.urlPdf || null;
          }
        } catch (pdfErr) {
          console.warn(`[POLL-SERVICES] Erro download PDF ${invoice.id}:`, pdfErr);
          updatePayload.boleto_url = boleto.urlPdf || null;
        }

        await supabase.from("invoices").update(updatePayload).eq("id", invoice.id);
        updated++;
      }
    } catch (e) {
      console.error(`[POLL-SERVICES] Erro boleto ${invoice.id}:`, e);
    }
  }

  // === SEGUNDO PASSO: recuperar PDF de boletos que já têm barcode mas sem PDF no Storage ===
  const { data: missingPdfInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, notes, boleto_url")
    .eq("payment_method", "boleto")
    .not("boleto_barcode", "is", null)
    .in("status", ["pending", "overdue", "paid"])
    .or("boleto_url.is.null,boleto_url.not.like.invoice-documents/%")
    .limit(20);

  if (missingPdfInvoices?.length) {
    console.log(`[POLL-SERVICES] ${missingPdfInvoices.length} boletos com barcode mas sem PDF no Storage`);

    // Garantir que temos httpClient e token (podem já existir do passo anterior)
    let pdfHttpClient = httpClient;
    let pdfAccessToken = access_token;
    let pdfBaseUrl = baseUrl;
    let pdfMtlsFetch = mtlsFetch;

    if (!pdfHttpClient) {
      // Se o primeiro passo não rodou (nenhum boleto sem barcode), precisamos inicializar
      const interSettings = await getInterSettings(supabase);
      if (interSettings) {
        pdfHttpClient = createMtlsClient(interSettings.certificate_crt, interSettings.certificate_key);
        pdfBaseUrl = interSettings.environment === "production"
          ? "https://cdpj.partners.bancointer.com.br"
          : "https://cdpj-sandbox.partners.bancointer.com.br";
        pdfMtlsFetch = (url: string, options: RequestInit) =>
          fetch(url, { ...options, client: pdfHttpClient } as RequestInit);

        const tokenRes = await pdfMtlsFetch(`${pdfBaseUrl}/oauth/v2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: interSettings.client_id,
            client_secret: interSettings.client_secret,
            grant_type: "client_credentials",
            scope: "boleto-cobranca.read",
          }),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          pdfAccessToken = tokenData.access_token;
        } else {
          console.error("[POLL-SERVICES] Erro auth Inter para PDF recovery");
          pdfAccessToken = null;
        }
      }
    }

    if (pdfAccessToken) {
      for (const inv of missingPdfInvoices) {
        const solMatch = inv.notes?.match(/codigoSolicitacao:([a-f0-9-]+)/i);
        if (!solMatch) {
          console.warn(`[POLL-SERVICES] Fatura ${inv.invoice_number} sem codigoSolicitacao no notes`);
          continue;
        }

        processed++;
        try {
          const pdfResponse = await pdfMtlsFetch(
            `${pdfBaseUrl}/cobranca/v3/cobrancas/${solMatch[1]}/pdf`,
            { headers: { Authorization: `Bearer ${pdfAccessToken}` } }
          );

          if (!pdfResponse.ok) {
            console.warn(`[POLL-SERVICES] PDF recovery ${inv.invoice_number}: HTTP ${pdfResponse.status}`);
            continue;
          }

          const pdfData = await pdfResponse.json();
          if (!pdfData.pdf) {
            console.warn(`[POLL-SERVICES] PDF recovery ${inv.invoice_number}: campo pdf vazio`);
            continue;
          }

          const pdfBytes = Uint8Array.from(atob(pdfData.pdf), (c: string) => c.charCodeAt(0));
          const boletoPath = `boletos/${inv.id}/boleto.pdf`;

          const { error: uploadError } = await supabase.storage
            .from("invoice-documents")
            .upload(boletoPath, pdfBytes, {
              contentType: "application/pdf",
              upsert: true,
            });

          if (uploadError) {
            console.warn(`[POLL-SERVICES] Upload PDF ${inv.invoice_number}:`, uploadError);
            continue;
          }

          await supabase.from("invoices").update({
            boleto_url: `invoice-documents/${boletoPath}`,
            boleto_status: "enviado",
          }).eq("id", inv.id);

          await supabase.from("invoice_documents").insert({
            invoice_id: inv.id,
            document_type: "boleto_pdf",
            file_path: boletoPath,
            file_name: `boleto_${inv.invoice_number}.pdf`,
            mime_type: "application/pdf",
            bucket_name: "invoice-documents",
            storage_provider: "supabase",
            metadata: { source: "poll_services_pdf_recovery", codigoSolicitacao: solMatch[1] },
          });

          updated++;
          console.log(`[POLL-SERVICES] PDF recuperado para boleto ${inv.invoice_number}`);
        } catch (e) {
          console.error(`[POLL-SERVICES] Erro PDF recovery ${inv.invoice_number}:`, e);
        }
      }
    }
  }

  console.log(`[POLL-SERVICES] Boletos: ${processed} verificados, ${updated} atualizados`);
  return { processed, updated };
}

// ============ BOLETO PAYMENT STATUS POLLING ============

async function pollBoletoPayments(
  supabase: SupabaseClient,
  specificInvoiceId?: string
): Promise<{ processed: number; updated: number }> {
  console.log("[POLL-SERVICES] Verificando pagamentos de boletos...");

  const { data: settingsData } = await supabase
    .from("integration_settings")
    .select("settings, is_active")
    .eq("integration_type", "banco_inter")
    .maybeSingle();

  if (!settingsData?.is_active) {
    console.log("[POLL-SERVICES] Banco Inter não configurado");
    return { processed: 0, updated: 0 };
  }

  const settings = settingsData.settings as InterSettings;
  if (!settings.certificate_crt || !settings.certificate_key) {
    return { processed: 0, updated: 0 };
  }

  // Build query for invoices with boleto that are still unpaid
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, notes, amount, client_id, boleto_barcode")
    .not("boleto_barcode", "is", null)
    .in("status", ["pending", "overdue"]);

  if (specificInvoiceId) {
    query = query.eq("id", specificInvoiceId);
  } else {
    // Only check invoices older than 2 hours (fallback mode)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    query = query.lt("created_at", twoHoursAgo);
  }

  const { data: pendingInvoices } = await query.limit(20);

  if (!pendingInvoices?.length) {
    console.log("[POLL-SERVICES] Nenhum boleto pendente de verificação de pagamento");
    return { processed: 0, updated: 0 };
  }

  const httpClient = createMtlsClient(settings.certificate_crt, settings.certificate_key);
  const baseUrl = settings.environment === "production"
    ? "https://cdpj.partners.bancointer.com.br"
    : "https://cdpj-sandbox.partners.bancointer.com.br";

  const mtlsFetch = (url: string, options: RequestInit) =>
    fetch(url, { ...options, client: httpClient } as RequestInit);

  // Get OAuth token with read scope
  const tokenResponse = await mtlsFetch(`${baseUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.client_id,
      client_secret: settings.client_secret,
      grant_type: "client_credentials",
      scope: "boleto-cobranca.read",
    }),
  });

  if (!tokenResponse.ok) {
    console.error("[POLL-SERVICES] Erro auth Banco Inter para verificação de pagamentos");
    return { processed: 0, updated: 0 };
  }

  const { access_token } = await tokenResponse.json();
  let processed = 0, updated = 0;

  for (const invoice of pendingInvoices) {
    processed++;
    try {
      // Try to find codigoSolicitacao from notes
      const match = invoice.notes?.match(/codigoSolicitacao:([a-f0-9-]+)/i);
      
      let data;
      if (match) {
        const statusResponse = await mtlsFetch(
          `${baseUrl}/cobranca/v3/cobrancas/${match[1]}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!statusResponse.ok) continue;
        data = await statusResponse.json();
      } else {
        // Fallback: search by seuNumero (invoice_number)
        const searchResponse = await mtlsFetch(
          `${baseUrl}/cobranca/v3/cobrancas?filtrarPor=NOSSONUMERO&valorFiltro=${invoice.invoice_number}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!searchResponse.ok) continue;
        const searchData = await searchResponse.json();
        const items = searchData.cobrancas || searchData.content || [];
        if (!items.length) continue;
        data = items[0];
      }

      const cobranca = data.cobranca || data;
      const situacao = cobranca.situacao || data.situacao;

      // Check if paid
      if (situacao === "PAGO" || situacao === "RECEBIDO" || situacao === "LIQUIDADO") {
        const paidAmount = cobranca.valorTotalRecebimento || cobranca.valorNominal || invoice.amount;
        const paidDate = cobranca.dataSituacao || new Date().toISOString().split("T")[0];

        console.log(`[POLL-SERVICES] Fatura #${invoice.invoice_number} PAGA! Valor: R$ ${paidAmount}`);

        // Update invoice status
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_date: paidDate,
            paid_amount: paidAmount,
            payment_method: "boleto",
          })
          .eq("id", invoice.id);

        if (updateError) {
          console.error(`[POLL-SERVICES] Erro ao atualizar fatura ${invoice.id}:`, updateError);
          continue;
        }

        // Create financial entry with correct columns
        const { error: feError } = await supabase.from("financial_entries").insert({
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          type: "receita",
          amount: paidAmount,
          description: `Pagamento automático (boleto) - Fatura #${invoice.invoice_number}`,
          date: paidDate,
          category: "pagamento_automatico",
        });

        if (feError) {
          console.error(`[POLL-SERVICES] Erro financial_entry ${invoice.id}:`, feError);
        }

        // Audit log
        await supabase.from("audit_logs").insert({
          table_name: "invoices",
          record_id: invoice.id,
          action: "POLLING_PAYMENT_CONFIRMED",
          new_data: {
            paid_amount: paidAmount,
            paid_date: paidDate,
            payment_method: "boleto",
            source: "poll_services",
            situacao,
          },
        });

        // Notify admins
        await notifyAdmins(
          supabase,
          "Pagamento Confirmado",
          `Fatura #${invoice.invoice_number} paga via boleto (R$ ${paidAmount})`,
          "success",
          "invoice",
          invoice.id
        );

        updated++;
      }
    } catch (e) {
      console.error(`[POLL-SERVICES] Erro verificação pagamento ${invoice.id}:`, e);
    }
  }

  console.log(`[POLL-SERVICES] Pagamentos: ${processed} verificados, ${updated} confirmados`);
  return { processed, updated };
}

// ============ ASAAS NFS-E POLLING ============

async function pollAsaasNfse(supabase: SupabaseClient): Promise<{ processed: number; updated: number }> {
  console.log("[POLL-SERVICES] Verificando NFS-e Asaas...");

  const { data: integrationData } = await supabase
    .from("integration_settings")
    .select("settings, is_active")
    .eq("integration_type", "asaas")
    .maybeSingle();

  if (!integrationData?.is_active) {
    console.log("[POLL-SERVICES] Asaas não configurado");
    return { processed: 0, updated: 0 };
  }

  const settings = integrationData.settings as AsaasSettings;
  const baseUrl = ASAAS_URLS[settings.environment];
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: pendingRecords } = await supabase
    .from("nfse_history")
    .select("id, asaas_invoice_id, status, valor_servico")
    .eq("provider", "asaas")
    .eq("status", "processando")
    .not("asaas_invoice_id", "is", null)
    .lt("updated_at", twoHoursAgo)
    .limit(10);

  if (!pendingRecords?.length) {
    console.log("[POLL-SERVICES] Nenhuma NFS-e Asaas pendente");
    return { processed: 0, updated: 0 };
  }

  let processed = 0, updated = 0;

  for (const record of pendingRecords) {
    processed++;
    try {
      const response = await fetch(`${baseUrl}/invoices/${record.asaas_invoice_id}`, {
        headers: { "Content-Type": "application/json", "access_token": settings.api_key },
      });

      if (!response.ok) continue;

      const invoice = await response.json();
      const newStatus = ASAAS_STATUS_MAP[invoice.status] || "processando";
      if (newStatus === record.status) continue;

      const updateData: Record<string, unknown> = {
        status: newStatus,
        asaas_status: invoice.status,
        updated_at: new Date().toISOString(),
      };

      if (invoice.status === "AUTHORIZED") {
        updateData.numero_nfse = invoice.number?.toString();
        updateData.codigo_verificacao = invoice.validationCode;
        updateData.data_autorizacao = new Date().toISOString();

        if (invoice.pdfUrl) {
          const pdfPath = await downloadAndStoreFile(supabase, invoice.pdfUrl, record.id, "pdf");
          if (pdfPath) updateData.pdf_url = pdfPath;
        }
        if (invoice.xmlUrl) {
          const xmlPath = await downloadAndStoreFile(supabase, invoice.xmlUrl, record.id, "xml");
          if (xmlPath) updateData.xml_url = xmlPath;
        }

        await notifyAdmins(supabase, "NFS-e Autorizada", `NFS-e #${invoice.number} autorizada`, "success");
      }

      if (invoice.status === "ERROR") {
        updateData.mensagem_erro = invoice.statusDescription;
        await notifyAdmins(supabase, "Erro NFS-e", invoice.statusDescription || "Erro no processamento", "error");
      }

      await supabase.from("nfse_history").update(updateData).eq("id", record.id);
      updated++;
    } catch (e) {
      console.error(`[POLL-SERVICES] Erro NFS-e Asaas ${record.id}:`, e);
    }
  }

  console.log(`[POLL-SERVICES] NFS-e Asaas: ${processed} verificados, ${updated} atualizados`);
  return { processed, updated };
}

// ============ MAIN HANDLER ============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    let body: PollRequest = {};
    try {
      body = await req.json();
    } catch {
      // Default to all services
    }

    const services = body.services || ["boleto", "asaas_nfse", "boleto_payments"];
    const specificInvoiceId = body.invoice_id;
    console.log(`[POLL-SERVICES] Iniciando polling: ${services.join(", ")}${specificInvoiceId ? ` (invoice: ${specificInvoiceId})` : ""}`);

    const results: Record<string, { processed: number; updated: number }> = {};

    // Run all services in parallel
    const [boletoResult, asaasResult, paymentResult] = await Promise.all([
      services.includes("boleto") ? pollBoletos(supabase) : Promise.resolve({ processed: 0, updated: 0 }),
      services.includes("asaas_nfse") ? pollAsaasNfse(supabase) : Promise.resolve({ processed: 0, updated: 0 }),
      services.includes("boleto_payments") ? pollBoletoPayments(supabase, specificInvoiceId) : Promise.resolve({ processed: 0, updated: 0 }),
    ]);

    results.boleto = boletoResult;
    results.asaas_nfse = asaasResult;
    results.boleto_payments = paymentResult;

    const totalProcessed = Object.values(results).reduce((a, b) => a + b.processed, 0);
    const totalUpdated = Object.values(results).reduce((a, b) => a + b.updated, 0);

    console.log(`[POLL-SERVICES] Concluído: ${totalProcessed} verificados, ${totalUpdated} atualizados`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: "fallback",
        total: { processed: totalProcessed, updated: totalUpdated },
        details: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[POLL-SERVICES] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
