import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * OPTIMIZED: Polling now serves as FALLBACK ONLY
 * Primary updates come from webhook-asaas-nfse
 * This function only runs for records older than 1 HOUR (was 15 min)
 * to catch any webhooks that might have been missed
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AsaasSettings {
  api_key: string;
  wallet_id?: string;
  environment: "sandbox" | "production";
}

interface NfseRecord {
  id: string;
  asaas_invoice_id: string;
  status: string;
  valor_servico: number;
  client_id: string;
}

const ASAAS_URLS = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://api.asaas.com/v3",
};

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

// Batch notification creation
async function createBatchNotifications(
  supabase: SupabaseClient,
  notifications: Array<{ title: string; message: string; type: string }>
) {
  if (notifications.length === 0) return;

  const { data: adminUsers } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "financial"]);

  if (!adminUsers || adminUsers.length === 0) return;

  const allNotifications = notifications.flatMap((n) =>
    adminUsers.map((user) => ({
      user_id: user.user_id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: false,
    }))
  );

  await supabase.from("notifications").insert(allNotifications);
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
    console.log("[POLL-ASAAS-FALLBACK] Iniciando fallback (apenas registros > 1 hora)...");

    // Get Asaas configuration - explicit columns
    const { data: integrationData } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "asaas")
      .eq("is_active", true)
      .maybeSingle();

    if (!integrationData) {
      return new Response(
        JSON.stringify({ success: true, message: "Integração Asaas inativa", stats: { found: 0 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = integrationData.settings as unknown as AsaasSettings;
    const baseUrl = ASAAS_URLS[settings.environment];

    // OPTIMIZATION: Only poll records older than 1 HOUR (was 15 min)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: pendingRecords, error: queryError } = await supabase
      .from("nfse_history")
      .select("id, asaas_invoice_id, status, valor_servico, client_id")
      .eq("provider", "asaas")
      .eq("status", "processando")
      .not("asaas_invoice_id", "is", null)
      .lt("updated_at", oneHourAgo) // Only old records
      .order("updated_at", { ascending: true })
      .limit(20); // Reduced limit

    if (queryError) throw queryError;

    const records = (pendingRecords || []) as NfseRecord[];
    console.log(`[POLL-ASAAS-FALLBACK] ${records.length} NFS-e antigas para verificar`);

    let updatedCount = 0;
    const pendingNotifications: Array<{ title: string; message: string; type: string }> = [];

    // ========== ORPHAN DETECTION: Records without asaas_invoice_id ==========
    // These records failed during API call and never got an Asaas ID
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: orphanRecords, error: orphanError } = await supabase
      .from("nfse_history")
      .select("id, status, valor_servico, client_id, created_at")
      .eq("provider", "asaas")
      .eq("status", "processando")
      .is("asaas_invoice_id", null)
      .lt("created_at", thirtyMinutesAgo)
      .limit(50);

    let orphansFixed = 0;
    if (!orphanError && orphanRecords && orphanRecords.length > 0) {
      console.log(`[POLL-ASAAS-FALLBACK] ${orphanRecords.length} registros órfãos detectados (sem asaas_invoice_id)`);
      
      // Mark orphan records as error
      for (const orphan of orphanRecords) {
        await supabase
          .from("nfse_history")
          .update({
            status: "erro",
            mensagem_retorno: "NFS-e não foi criada no Asaas. Verifique os dados fiscais e tente novamente.",
            codigo_retorno: "ORPHAN_RECORD",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orphan.id);
        
        orphansFixed++;
        console.log(`[POLL-ASAAS-FALLBACK] Registro órfão ${orphan.id} marcado como erro`);
      }

      // Create notification for orphan records
      pendingNotifications.push({
        title: "NFS-e com Problema Detectada",
        message: `${orphanRecords.length} NFS-e(s) foram marcadas como erro por não terem sido criadas no Asaas. Verifique os dados fiscais.`,
        type: "warning",
      });
    }

    if (records.length === 0 && orphansFixed === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma NFS-e pendente", stats: { found: 0, orphans_fixed: 0 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process in parallel batches of 5
    const batches = [];
    for (let i = 0; i < records.length; i += 5) {
      batches.push(records.slice(i, i + 5));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (record) => {
          const response = await fetch(`${baseUrl}/invoices/${record.asaas_invoice_id}`, {
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Colmeia-Helpdesk/1.0",
              "access_token": settings.api_key,
            },
          });

          if (!response.ok) return null;
          return { record, invoice: await response.json() };
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;

        const { record, invoice } = result.value;
        const newStatus = STATUS_MAP[invoice.status] || "processando";

        if (newStatus === record.status && invoice.status !== "AUTHORIZED") continue;

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

          pendingNotifications.push({
            title: "NFS-e Autorizada (Fallback)",
            message: `NFS-e #${invoice.number} autorizada. R$ ${record.valor_servico?.toFixed(2)}`,
            type: "success",
          });
        }

        if (invoice.status === "ERROR" || invoice.status === "CANCELLATION_DENIED") {
          updateData.mensagem_erro = invoice.statusDescription || "Erro no processamento";
          pendingNotifications.push({
            title: "Erro na NFS-e (Fallback)",
            message: `Erro: ${invoice.statusDescription || "Verifique os dados"}`,
            type: "error",
          });
        }

        await supabase.from("nfse_history").update(updateData).eq("id", record.id);
        updatedCount++;
      }
    }

    // Batch send all notifications at once
    await createBatchNotifications(supabase, pendingNotifications);

    console.log(`[POLL-ASAAS-FALLBACK] Concluído: ${records.length} verificados, ${updatedCount} atualizados, ${orphansFixed} órfãos corrigidos`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Polling Asaas fallback concluído",
        stats: { found: records.length, updated: updatedCount, orphans_fixed: orphansFixed },
        mode: "fallback",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[POLL-ASAAS-FALLBACK] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
