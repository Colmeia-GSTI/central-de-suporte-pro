import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * OPTIMIZED: Polling now serves as FALLBACK ONLY
 * Primary updates come from webhook-banco-inter
 * This function only runs for records older than 1 HOUR (was 0 minutes)
 * to catch any webhooks that might have been missed
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InterSettings {
  client_id: string;
  client_secret: string;
  certificate_crt?: string;
  certificate_key?: string;
  environment: "sandbox" | "production";
}

// Create HTTP client with mTLS certificates
function createMtlsClient(certBase64: string, keyBase64: string): Deno.HttpClient {
  const cert = atob(certBase64);
  const key = atob(keyBase64);
  
  return Deno.createHttpClient({
    caCerts: [],
    cert: cert,
    key: key,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    console.log("[POLL-BOLETO-FALLBACK] Iniciando fallback (apenas registros > 1 hora)...");

    // Get Banco Inter settings
    const { data: settingsData, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "banco_inter")
      .maybeSingle();

    if (settingsError || !settingsData?.is_active) {
      return new Response(
        JSON.stringify({ message: "Integração não configurada", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = settingsData.settings as InterSettings;

    if (!settings.certificate_crt || !settings.certificate_key) {
      return new Response(
        JSON.stringify({ message: "Certificados não configurados", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // OPTIMIZATION: Only poll records older than 1 HOUR (webhooks should handle fresh ones)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: pendingInvoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, invoice_number, notes, boleto_barcode, amount, client_id, created_at, clients(name, email, whatsapp, financial_email)")
      .eq("payment_method", "boleto")
      .is("boleto_barcode", null)
      .eq("status", "pending")
      .lt("created_at", oneHourAgo) // Only old records
      .limit(20); // Reduced limit since this is fallback only

    if (invoicesError) throw invoicesError;

    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log("[POLL-BOLETO-FALLBACK] Nenhum boleto antigo pendente");
      return new Response(
        JSON.stringify({ message: "Nenhum boleto pendente (fallback)", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[POLL-BOLETO-FALLBACK] ${pendingInvoices.length} faturas antigas para verificar`);

    // Create mTLS client
    const httpClient = createMtlsClient(settings.certificate_crt, settings.certificate_key);

    const baseUrl = settings.environment === "production"
      ? "https://cdpj.partners.bancointer.com.br"
      : "https://cdpj-sandbox.partners.bancointer.com.br";

    const mtlsFetch = async (url: string, options: RequestInit) => {
      return await fetch(url, { ...options, client: httpClient } as RequestInit);
    };

    // Get OAuth token once
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
      const errBody = await tokenResponse.text();
      throw new Error(`Erro ao autenticar (HTTP ${tokenResponse.status}): ${errBody || "(empty body)"}`);
    }

    const { access_token } = await tokenResponse.json();

    let processedCount = 0;
    let updatedCount = 0;
    const formatCurrency = (v: number) => 
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    // Process in parallel batches of 5 for efficiency
    const batches = [];
    for (let i = 0; i < pendingInvoices.length; i += 5) {
      batches.push(pendingInvoices.slice(i, i + 5));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (invoice) => {
          const match = invoice.notes?.match(/codigoSolicitacao:([a-f0-9-]+)/i);
          if (!match) return null;

          const codigoSolicitacao = match[1];
          const statusResponse = await mtlsFetch(
            `${baseUrl}/cobranca/v3/cobrancas/${codigoSolicitacao}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!statusResponse.ok) return null;

          const boletoData = await statusResponse.json();
          const cobranca = boletoData.cobranca || boletoData;
          const boleto = boletoData.boleto || {};
          const codigoBarras = cobranca.linhaDigitavel || cobranca.codigoBarras || boleto.linhaDigitavel || boleto.codigoBarras;
          const situacao = cobranca.situacao || boletoData.situacao;

          return { invoice, codigoBarras, situacao, pdfUrl: boleto.urlPdf || boleto.pdfUrl };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          processedCount++;
          const { invoice, codigoBarras, situacao, pdfUrl } = result.value;

          if (codigoBarras) {
            const updateData: Record<string, unknown> = { boleto_barcode: codigoBarras };
            if (pdfUrl) updateData.boleto_url = pdfUrl;
            if (invoice.notes) {
              updateData.notes = invoice.notes.replace(/\s*codigoSolicitacao:[a-f0-9-]+/gi, "").trim() || null;
            }

            await supabase.from("invoices").update(updateData).eq("id", invoice.id);
            updatedCount++;

            // Extract client data from the joined relation
            const clientsData = invoice.clients as unknown;
            let clientName = "Cliente";
            let clientEmail: string | undefined;
            let clientWhatsapp: string | undefined;
            
            if (Array.isArray(clientsData) && clientsData.length > 0) {
              const c = clientsData[0] as { name?: string; email?: string; whatsapp?: string; financial_email?: string };
              clientName = c.name || clientName;
              clientEmail = c.financial_email || c.email;
              clientWhatsapp = c.whatsapp;
            } else if (clientsData && typeof clientsData === "object") {
              const c = clientsData as { name?: string; email?: string; whatsapp?: string; financial_email?: string };
              clientName = c.name || clientName;
              clientEmail = c.financial_email || c.email;
              clientWhatsapp = c.whatsapp;
            }

            // Send notifications inline
            const { data: adminUsers } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("role", ["admin", "financial"]);

            if (adminUsers && adminUsers.length > 0) {
              for (const admin of adminUsers) {
                await supabase.from("notifications").insert({
                  user_id: (admin as { user_id: string }).user_id,
                  title: "Boleto Pronto (Fallback)",
                  message: `Boleto #${invoice.invoice_number} (${clientName}) - ${formatCurrency(invoice.amount)}`,
                  type: "info",
                  related_type: "invoice",
                  related_id: invoice.id,
                });
              }
            }

            // Send email/whatsapp
            if (clientEmail) {
              try {
                await supabase.functions.invoke("send-email-smtp", {
                  body: {
                    to: clientEmail,
                    subject: `Boleto Fatura #${invoice.invoice_number} Disponível`,
                    html: `<h2>Boleto Disponível</h2><p>Fatura #${invoice.invoice_number} - ${formatCurrency(invoice.amount)}</p>${pdfUrl ? `<a href="${pdfUrl}">Ver Boleto</a>` : ""}`,
                  },
                });
              } catch (e) {
                console.error("[POLL-BOLETO-FALLBACK] Email falhou:", e);
              }
            }

            if (clientWhatsapp) {
              try {
                await supabase.functions.invoke("send-whatsapp", {
                  body: {
                    to: clientWhatsapp,
                    message: `🐝 Boleto #${invoice.invoice_number} - ${formatCurrency(invoice.amount)} está pronto.`,
                    relatedType: "invoice",
                    relatedId: invoice.id,
                  },
                });
              } catch (e) {
                console.error("[POLL-BOLETO-FALLBACK] WhatsApp falhou:", e);
              }
            }
          } else if (situacao === "CANCELADO" || situacao === "EXPIRADO") {
            const notes = invoice.notes?.replace(/\s*codigoSolicitacao:[a-f0-9-]+/gi, "").trim() || "";
            await supabase.from("invoices").update({
              payment_method: null,
              notes: `${notes} [Boleto ${situacao}]`.trim(),
            }).eq("id", invoice.id);
          }
        }
      }
    }

    console.log(`[POLL-BOLETO-FALLBACK] Concluído: ${processedCount} verificados, ${updatedCount} atualizados`);

    return new Response(
      JSON.stringify({ success: true, processed: processedCount, updated: updatedCount, mode: "fallback" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[POLL-BOLETO-FALLBACK] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
