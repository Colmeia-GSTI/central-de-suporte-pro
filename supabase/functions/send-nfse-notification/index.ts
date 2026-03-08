import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NfseNotificationRequest {
  nfse_history_id: string;
  channels: ("email" | "whatsapp")[];
}

interface EmailSettings {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
}

interface EmailTemplate {
  subject_template: string;
  html_template: string;
  is_active: boolean;
}

async function readInvokeError(err: unknown): Promise<string> {
  const fallback = err instanceof Error ? err.message : "Erro desconhecido";
  const anyErr = err as { context?: Response };

  if (!anyErr?.context) return fallback;

  try {
    const contentType = anyErr.context.headers.get("content-type") || "";
    const text = await anyErr.context.text();

    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(text) as { error?: string; details?: string };
        return parsed.error || parsed.details || fallback;
      } catch {
        return fallback;
      }
    }

    return text.replace(/\s+/g, " ").slice(0, 300).trim() || fallback;
  } catch {
    return fallback;
  }
}

function replaceVariables(template: string, data: Record<string, string>): string {
  let result = template;
  
  // Replace simple variables {{variable}}
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  });
  
  // Handle conditional blocks {{#variable}}...{{/variable}}
  Object.entries(data).forEach(([key, value]) => {
    const conditionalRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, "g");
    if (value) {
      result = result.replace(conditionalRegex, "$1");
    } else {
      result = result.replace(conditionalRegex, "");
    }
  });
  
  return result;
}

function wrapInEmailLayout(content: string, settings: EmailSettings): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; }
    .email-container { max-width: 600px; margin: 0 auto; background: #fff; }
    .email-header { background: ${settings.primary_color}; padding: 24px; text-align: center; }
    .email-header img { max-height: 50px; max-width: 200px; }
    .email-content { padding: 32px 24px; color: #1f2937; line-height: 1.6; }
    .email-content h2 { margin-top: 0; color: #111827; }
    .email-content a { color: ${settings.primary_color}; }
    .email-content blockquote { border-left: 3px solid ${settings.primary_color}; padding-left: 15px; margin: 15px 0; background: #f9fafb; padding: 12px 15px; }
    .email-content code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .email-footer { background: ${settings.secondary_color}; color: #9ca3af; padding: 20px 24px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      ${settings.logo_url ? `<img src="${settings.logo_url}" alt="Logo" />` : `<span style="color: #fff; font-size: 18px; font-weight: 600;">Colmeia</span>`}
    </div>
    <div class="email-content">
      ${content}
    </div>
    <div class="email-footer">
      ${settings.footer_text}
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NfseNotificationRequest = await req.json();
    const { nfse_history_id, channels } = body;

    if (!nfse_history_id || !channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ error: "nfse_history_id e channels são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch email settings and template in parallel
    const [settingsRes, templateRes, nfseRes] = await Promise.all([
      supabase.from("email_settings").select("*").limit(1).single(),
      supabase.from("email_templates").select("*").eq("template_type", "nfse").single(),
      supabase.from("nfse_history").select(`
        id, numero_nfse, pdf_url, xml_url, valor_servico, competencia, client_id,
        clients (name, email, whatsapp, financial_email)
      `).eq("id", nfse_history_id).maybeSingle(),
    ]);

    const emailSettings: EmailSettings = settingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Este é um email automático. Em caso de dúvidas, entre em contato.",
    };

    const emailTemplate: EmailTemplate | null = templateRes.data?.is_active ? templateRes.data : null;

    const nfse = nfseRes.data;
    if (nfseRes.error || !nfse) {
      console.error("[send-nfse-notification] Error fetching NFS-e:", nfseRes.error);
      return new Response(
        JSON.stringify({ error: "NFS-e não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!nfse.pdf_url) {
      await supabase.from("nfse_event_logs").insert({
        nfse_history_id,
        event_type: "envio_bloqueado",
        event_level: "warn",
        message: "Envio bloqueado: PDF não disponível",
        source: "send-nfse-notification",
        details: { motivo: "pdf_ausente", checked_at: new Date().toISOString() },
      });
      return new Response(
        JSON.stringify({ error: "NFS-e não possui PDF disponível", blocked: true, blocked_reason: "pdf_ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!nfse.xml_url) {
      await supabase.from("nfse_event_logs").insert({
        nfse_history_id,
        event_type: "envio_bloqueado",
        event_level: "warn",
        message: "Envio bloqueado: XML não disponível",
        source: "send-nfse-notification",
        details: { motivo: "xml_ausente", checked_at: new Date().toISOString() },
      });
      await supabase.from("application_logs").insert({
        module: "billing_notification",
        level: "warn",
        message: "Envio de NFS-e bloqueado: XML não disponível",
        context: { nfse_history_id, blocked_artifacts: ["xml"] },
      });
      return new Response(
        JSON.stringify({ error: "NFS-e não possui XML disponível. Aguarde o processamento completo.", blocked: true, blocked_reason: "xml_ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company info
    const { data: company } = await supabase
      .from("company_settings")
      .select("razao_social, nome_fantasia, telefone, email")
      .limit(1)
      .maybeSingle();

    const companyName = company?.nome_fantasia || company?.razao_social || "Empresa";

    // Generate signed URL for PDF
    let pdfSignedUrl = nfse.pdf_url;
    if (nfse.pdf_url.startsWith("nfse-files/")) {
      const path = nfse.pdf_url.replace("nfse-files/", "");
      const { data: signedData, error: signError } = await supabase.storage
        .from("nfse-files")
        .createSignedUrl(path, 86400);

      if (signError) {
        console.error("[send-nfse-notification] Error creating signed URL:", signError);
        return new Response(
          JSON.stringify({ error: "Erro ao gerar link do PDF" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      pdfSignedUrl = signedData.signedUrl;
    }

    const clientData = nfse.clients;
    const client = (Array.isArray(clientData) ? clientData[0] : clientData) as { name: string; email: string | null; whatsapp: string | null; financial_email: string | null } | null | undefined;
    const clientName = client?.name || "Cliente";
    const nfseNumber = nfse.numero_nfse || "N/A";
    const valorFormatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(nfse.valor_servico || 0);

    // Format competencia
    let competenciaFormatted = "";
    if (nfse.competencia) {
      const [year, month] = nfse.competencia.toString().slice(0, 7).split("-");
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      competenciaFormatted = `${months[parseInt(month, 10) - 1]}/${year}`;
    }

    // Template variables
    const templateVars: Record<string, string> = {
      client_name: clientName,
      nfse_number: String(nfseNumber),
      valor: valorFormatted,
      competencia: competenciaFormatted,
      pdf_url: pdfSignedUrl,
      company_name: companyName,
    };

    const results: { channel: string; success: boolean; error?: string }[] = [];

    // Send via Email
    if (channels.includes("email")) {
      const emailTo = client?.financial_email || client?.email;
      
      if (!emailTo) {
        results.push({ channel: "email", success: false, error: "Cliente não possui email cadastrado" });
      } else {
        let emailSubject: string;
        let emailHtml: string;

        if (emailTemplate) {
          // Use custom template
          emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
          const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
          emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
        } else {
          // Default template
          emailSubject = `NFS-e #${nfseNumber} - ${clientName} - ${valorFormatted}`;
          emailHtml = wrapInEmailLayout(`
            <h2>Nota Fiscal de Serviço Eletrônica</h2>
            <p>Prezado(a) <strong>${clientName}</strong>,</p>
            <p>Segue a Nota Fiscal de Serviço Eletrônica referente aos serviços prestados.</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Dados da NFS-e</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Número:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${nfseNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Competência:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${competenciaFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Valor:</td>
                  <td style="padding: 8px 0; font-weight: bold; color: #2563eb;">${valorFormatted}</td>
                </tr>
              </table>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${pdfSignedUrl}" style="background: ${emailSettings.primary_color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                📄 Baixar PDF da NFS-e
              </a>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Este link expira em 24 horas. Caso precise do documento após esse período, entre em contato conosco.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666;">
              Atenciosamente,<br>
              <strong>${companyName}</strong>
            </p>
          `, emailSettings);
        }

        try {
          const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: { to: emailTo, subject: emailSubject, html: emailHtml },
          });

          if (emailError) {
            console.error("[send-nfse-notification] Email error:", emailError);
            const detailed = await readInvokeError(emailError);
            results.push({ channel: "email", success: false, error: detailed || "Erro ao enviar email" });
          } else {
            results.push({ channel: "email", success: true });
            await supabase.from("nfse_event_logs").insert({
              nfse_history_id,
              event_type: "compartilhamento",
              event_level: "info",
              message: `NFS-e #${nfseNumber} enviada por email para ${emailTo}`,
              source: "send-nfse-notification",
              details: { channel: "email", recipient: emailTo, sent_at: new Date().toISOString() },
            });
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : "Erro desconhecido";
          console.error("[send-nfse-notification] Email exception:", errMsg);
          results.push({ channel: "email", success: false, error: errMsg });
        }
      }
    }

    // Send via WhatsApp
    if (channels.includes("whatsapp")) {
      const whatsappTo = client?.whatsapp;

      if (!whatsappTo) {
        results.push({ channel: "whatsapp", success: false, error: "Cliente não possui WhatsApp cadastrado" });
      } else {
        const whatsappMessage = `Olá, ${clientName}!

Segue a NFS-e #${nfseNumber} referente aos serviços prestados em ${competenciaFormatted.toLowerCase()}.

💰 *Valor: ${valorFormatted}*

📄 Baixar PDF:
${pdfSignedUrl}

Atenciosamente,
*${companyName}*`;

        try {
          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: { to: whatsappTo, message: whatsappMessage, relatedType: "nfse", relatedId: nfse_history_id },
          });

          if (whatsappError) {
            console.error("[send-nfse-notification] WhatsApp error:", whatsappError);
            results.push({ channel: "whatsapp", success: false, error: whatsappError.message || "Erro ao enviar WhatsApp" });
          } else {
            results.push({ channel: "whatsapp", success: true });
            await supabase.from("nfse_event_logs").insert({
              nfse_history_id,
              event_type: "compartilhamento",
              event_level: "info",
              message: `NFS-e #${nfseNumber} enviada por WhatsApp para ${whatsappTo}`,
              source: "send-nfse-notification",
              details: { channel: "whatsapp", recipient: whatsappTo, sent_at: new Date().toISOString() },
            });
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : "Erro desconhecido";
          console.error("[send-nfse-notification] WhatsApp exception:", errMsg);
          results.push({ channel: "whatsapp", success: false, error: errMsg });
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    return new Response(
      JSON.stringify({ success: allSuccess, partial: !allSuccess && anySuccess, results }),
      { status: allSuccess ? 200 : 207, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[send-nfse-notification] Error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
