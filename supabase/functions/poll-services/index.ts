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

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: pendingInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, notes, amount, client_id")
    .eq("payment_method", "boleto")
    .is("boleto_barcode", null)
    .in("status", ["pending", "overdue"])
    .lt("created_at", twoHoursAgo)
    .limit(10);

  if (!pendingInvoices?.length) {
    console.log("[POLL-SERVICES] Nenhum boleto pendente");
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

  for (const invoice of pendingInvoices) {
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
        await supabase.from("invoices").update({
          boleto_barcode: codigoBarras,
          boleto_url: boleto.urlPdf || null,
          notes: invoice.notes?.replace(/\s*codigoSolicitacao:[a-f0-9-]+/gi, "").trim() || null,
        }).eq("id", invoice.id);
        updated++;
      }
    } catch (e) {
      console.error(`[POLL-SERVICES] Erro boleto ${invoice.id}:`, e);
    }
  }

  console.log(`[POLL-SERVICES] Boletos: ${processed} verificados, ${updated} atualizados`);
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

    const services = body.services || ["boleto", "asaas_nfse"];
    console.log(`[POLL-SERVICES] Iniciando polling: ${services.join(", ")}`);

    const results: Record<string, { processed: number; updated: number }> = {};

    // Run all services in parallel
    const [boletoResult, asaasResult] = await Promise.all([
      services.includes("boleto") ? pollBoletos(supabase) : Promise.resolve({ processed: 0, updated: 0 }),
      services.includes("asaas_nfse") ? pollAsaasNfse(supabase) : Promise.resolve({ processed: 0, updated: 0 }),
    ]);

    results.boleto = boletoResult;
    results.asaas_nfse = asaasResult;

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
