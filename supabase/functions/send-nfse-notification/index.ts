import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getEmailSettings,
  wrapInEmailLayout,
  replaceVariables,
  formatCurrencyBRL,
  getEmailTemplate,
} from "../_shared/email-helpers.ts";

interface NfseNotificationRequest {
  nfse_history_id: string;
  channels: ("email" | "whatsapp")[];
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

    // Fetch settings, template, and NFS-e in parallel
    const [emailSettings, emailTemplate, nfseRes] = await Promise.all([
      getEmailSettings(supabase),
      getEmailTemplate(supabase, "nfse"),
      supabase.from("nfse_history").select(`
        id, numero_nfse, pdf_url, xml_url, valor_servico, competencia, client_id, invoice_id,
        clients (name, email, whatsapp, financial_email)
      `).eq("id", nfse_history_id).maybeSingle(),
    ]);

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

    const companyName = emailSettings.companyName;

    // Generate signed URLs (7 days)
    const SIGNED_URL_EXPIRY = 604800;

    let pdfSignedUrl = nfse.pdf_url;
    if (nfse.pdf_url.startsWith("nfse-files/")) {
      const path = nfse.pdf_url.replace("nfse-files/", "");
      const { data: signedData, error: signError } = await supabase.storage
        .from("nfse-files")
        .createSignedUrl(path, SIGNED_URL_EXPIRY);
      if (signError) {
        console.error("[send-nfse-notification] Error creating PDF signed URL:", signError);
        return new Response(
          JSON.stringify({ error: "Erro ao gerar link do PDF" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      pdfSignedUrl = signedData.signedUrl;
    }

    let xmlSignedUrl = "";
    if (nfse.xml_url) {
      if (nfse.xml_url.startsWith("nfse-files/")) {
        const xmlPath = nfse.xml_url.replace("nfse-files/", "");
        const { data: xmlSigned } = await supabase.storage
          .from("nfse-files")
          .createSignedUrl(xmlPath, SIGNED_URL_EXPIRY);
        xmlSignedUrl = xmlSigned?.signedUrl || "";
      } else {
        xmlSignedUrl = nfse.xml_url;
      }
    }

    const clientData = nfse.clients;
    const client = (Array.isArray(clientData) ? clientData[0] : clientData) as { name: string; email: string | null; whatsapp: string | null; financial_email: string | null } | null | undefined;
    const clientName = client?.name || "Cliente";
    const nfseNumber = nfse.numero_nfse || "N/A";
    const valorFormatted = formatCurrencyBRL(nfse.valor_servico || 0);

    // Format competencia
    let competenciaFormatted = "";
    if (nfse.competencia) {
      const [year, month] = nfse.competencia.toString().slice(0, 7).split("-");
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      competenciaFormatted = `${months[parseInt(month, 10) - 1]}/${year}`;
    }

    const templateVars: Record<string, string> = {
      client_name: clientName,
      nfse_number: String(nfseNumber),
      valor: valorFormatted,
      competencia: competenciaFormatted,
      pdf_url: pdfSignedUrl,
      xml_url: xmlSignedUrl,
      company_name: companyName,
    };

    const results: { channel: string; success: boolean; error?: string }[] = [];

    // Send via Email
    if (channels.includes("email")) {
      const emailTo = client?.email || client?.financial_email;

      if (!emailTo) {
        results.push({ channel: "email", success: false, error: "Cliente não possui email cadastrado" });
      } else {
        let emailSubject: string;
        let emailHtml: string;

        if (emailTemplate) {
          emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
          const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
          emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
        } else {
          emailSubject = `NFS-e #${nfseNumber} - ${clientName} - ${valorFormatted}`;
          emailHtml = wrapInEmailLayout(`
            <h2>Nota Fiscal de Serviço Eletrônica</h2>
            <p>Prezado(a) <strong>${clientName}</strong>,</p>
            <p>Segue a Nota Fiscal de Serviço Eletrônica referente aos serviços prestados.</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Dados da NFS-e</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #666;">Número:</td><td style="padding: 8px 0; font-weight: bold;">${nfseNumber}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Competência:</td><td style="padding: 8px 0; font-weight: bold;">${competenciaFormatted}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Valor:</td><td style="padding: 8px 0; font-weight: bold; color: #2563eb;">${valorFormatted}</td></tr>
              </table>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${pdfSignedUrl}" style="background: ${emailSettings.primaryColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                📄 Baixar PDF da NFS-e
              </a>
            </div>
            ${xmlSignedUrl ? `
            <p style="text-align: center; margin-top: 10px;">
              <a href="${xmlSignedUrl}" style="color: #6b7280; font-size: 13px;">📋 Baixar XML da NFS-e</a>
            </p>
            ` : ""}
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Sua Nota Fiscal de Serviços referente ao mês de ${competenciaFormatted} está disponível. Os links expiram em 7 dias.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666;">
              Atenciosamente,<br>
              <strong>${companyName}</strong>
            </p>
          `, emailSettings);
        }

        // Build attachments
        const attachments: { filename: string; path: string }[] = [];
        if (pdfSignedUrl) {
          attachments.push({ filename: `NFSe_${nfseNumber}.pdf`, path: pdfSignedUrl });
        }
        if (xmlSignedUrl) {
          attachments.push({ filename: `NFSe_${nfseNumber}.xml`, path: xmlSignedUrl });
        }

        try {
          const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: {
              to: emailTo,
              subject: emailSubject,
              html: emailHtml,
              ...(attachments.length > 0 ? { attachments } : {}),
            },
          });

          if (emailError) {
            console.error("[send-nfse-notification] Email error:", emailError);
            const detailed = await readInvokeError(emailError);
            results.push({ channel: "email", success: false, error: detailed || "Erro ao enviar email" });
            if (nfse.invoice_id) {
              await supabase.from("invoice_notification_logs").insert({
                invoice_id: nfse.invoice_id,
                notification_type: "nfse",
                channel: "email",
                success: false,
                error_message: detailed || "Erro ao enviar email",
              }).then(() => {});
            }
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
            if (nfse.invoice_id) {
              await supabase.from("invoice_notification_logs").insert({
                invoice_id: nfse.invoice_id,
                notification_type: "nfse",
                channel: "email",
                success: true,
                recipient: emailTo,
              }).then(() => {});
            }
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
