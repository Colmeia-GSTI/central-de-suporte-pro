import { createClient } from "npm:@supabase/supabase-js@2";
import { applyNotificationMessage } from "../_shared/notification-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function replaceVariables(template: string, data: Record<string, string>): string {
  let result = template;
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  });
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

/**
 * Resolve a stored file path into bucket + object path for signed URL generation.
 */
function resolveStoragePathBackend(storedPath: string): { bucket: string; path: string } | null {
  if (!storedPath) return null;
  if (storedPath.startsWith("http://") || storedPath.startsWith("https://")) return null;
  if (storedPath.startsWith("invoice-documents/")) {
    return { bucket: "invoice-documents", path: storedPath.replace("invoice-documents/", "") };
  }
  if (storedPath.startsWith("nfse-files/")) {
    return { bucket: "nfse-files", path: storedPath.replace("nfse-files/", "") };
  }
  if (storedPath.startsWith("nfse/")) {
    return { bucket: "nfse-files", path: storedPath };
  }
  return { bucket: "nfse-files", path: storedPath };
}

// deno-lint-ignore no-explicit-any
async function resolveToSignedUrl(supabase: any, storedPath: string, expiresIn = 604800): Promise<string> {
  if (!storedPath) return "";
  const resolved = resolveStoragePathBackend(storedPath);
  if (!resolved) return storedPath; // Already an external URL
  const { data, error } = await supabase.storage.from(resolved.bucket).createSignedUrl(resolved.path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error(`[RESEND] Erro ao gerar signed URL para ${storedPath}:`, error);
    return "";
  }
  return data.signedUrl;
}

interface ResendRequest {
  invoice_id: string;
  channels: ("email" | "whatsapp")[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { invoice_id, channels }: ResendRequest = await req.json();

    if (!invoice_id || !channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ error: "invoice_id e channels são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch settings, template, and invoice in parallel
    const [settingsRes, templateRes, invoiceRes] = await Promise.all([
      supabase.from("email_settings").select("*").limit(1).single(),
      supabase.from("email_templates").select("*").eq("template_type", "invoice_payment").maybeSingle(),
      supabase.from("invoices").select(`
        id, invoice_number, amount, due_date, boleto_barcode, boleto_url, pix_code, payment_method, boleto_status,
        clients(id, name, email, whatsapp, financial_email)
      `).eq("id", invoice_id).single(),
    ]);

    const emailSettings: EmailSettings = settingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Este email foi enviado automaticamente. Em caso de dúvidas, entre em contato conosco.",
    };

    const emailTemplate: EmailTemplate | null = templateRes.data?.is_active ? templateRes.data : null;

    if (invoiceRes.error || !invoiceRes.data) {
      return new Response(
        JSON.stringify({ error: "Fatura não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const invoice = invoiceRes.data;
    const clientData = invoice.clients as unknown as { id: string; name: string; email?: string; whatsapp?: string; financial_email?: string } | null;
    
    if (!clientData) {
      return new Response(
        JSON.stringify({ error: "Cliente não encontrado para esta fatura" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = clientData;
    const hasBoleto = !!invoice.boleto_barcode || !!invoice.boleto_url;
    const hasPix = !!invoice.pix_code;
    const boletoEmProcessamento = invoice.boleto_status === "pendente" || invoice.boleto_status === "processando";

    // === BLOQUEIO DE ARTEFATOS ===
    const blockedReasons: string[] = [];

    // Verificar NFS-e vinculada
    const { data: linkedNfse } = await supabase
      .from("nfse_history")
      .select("id, status, pdf_url, xml_url")
      .eq("invoice_id", invoice_id)
      .eq("status", "autorizada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (linkedNfse) {
      if (!linkedNfse.pdf_url || !linkedNfse.xml_url) {
        const missing = [];
        if (!linkedNfse.pdf_url) missing.push("pdf");
        if (!linkedNfse.xml_url) missing.push("xml");
        blockedReasons.push(`NFS-e incompleta - ${missing.join(" e ")} ausente(s)`);
      }
    }

    // Verificar boleto
    if (boletoEmProcessamento && !hasBoleto) {
      blockedReasons.push("Boleto em processamento - aguarde a geração");
    }

    if (blockedReasons.length > 0) {
      // Log de bloqueio
      await supabase.from("application_logs").insert({
        module: "billing_notification",
        level: "warn",
        message: `Envio bloqueado: ${blockedReasons.join("; ")}`,
        context: { invoice_id, blocked_artifacts: blockedReasons },
      });

      return new Response(
        JSON.stringify({
          error: "Envio bloqueado: artefatos incompletos",
          blocked: true,
          blocked_reasons: blockedReasons,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hasBoleto && !hasPix && !boletoEmProcessamento) {
      return new Response(
        JSON.stringify({ 
          error: "Esta fatura não tem boleto ou PIX gerado e não está em processamento",
          details: { has_boleto: hasBoleto, has_pix: hasPix, boleto_status: invoice.boleto_status }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

    // Generate signed URLs for storage paths
    const boletoSignedUrl = invoice.boleto_url ? await resolveToSignedUrl(supabase, invoice.boleto_url) : "";
    
    // Also resolve NFS-e PDF if available
    let nfsePdfSignedUrl = "";
    if (linkedNfse?.pdf_url) {
      nfsePdfSignedUrl = await resolveToSignedUrl(supabase, linkedNfse.pdf_url);
    }

    // Template variables
    const templateVars: Record<string, string> = {
      client_name: client.name,
      invoice_number: String(invoice.invoice_number),
      amount: formatCurrency(invoice.amount),
      due_date: formatDate(invoice.due_date),
      boleto_url: boletoSignedUrl,
      boleto_barcode: invoice.boleto_barcode || "",
      pix_code: invoice.pix_code || "",
      nfse_pdf_url: nfsePdfSignedUrl,
    };

    const results: { channel: string; success: boolean; error?: string; errorCode?: string }[] = [];

    // Send Email
    if (channels.includes("email")) {
      const emailTo = client.financial_email || client.email;
      if (!emailTo) {
        results.push({ channel: "email", success: false, error: "Cliente sem email cadastrado" });
      } else {
        let emailSubject: string;
        let emailHtml: string;

        if (emailTemplate) {
          emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
          const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
          emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
        } else {
          emailSubject = `Cobrança - Fatura #${invoice.invoice_number} - ${formatCurrency(invoice.amount)}`;
          const defaultContent = `
            <h2>Cobrança - Fatura #${invoice.invoice_number}</h2>
            <p>Olá <strong>${client.name}</strong>,</p>
            <p>Segue abaixo os dados para pagamento da fatura:</p>
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Fatura:</td>
                  <td style="padding: 8px 0; font-weight: bold; text-align: right;">#${invoice.invoice_number}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Valor:</td>
                  <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #059669;">${formatCurrency(invoice.amount)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Vencimento:</td>
                  <td style="padding: 8px 0; font-weight: bold; text-align: right;">${formatDate(invoice.due_date)}</td>
                </tr>
              </table>
            </div>
            ${hasBoleto ? `
              <div style="margin: 20px 0;">
                <h3>📋 Boleto Bancário</h3>
                ${boletoSignedUrl ? `<p><a href="${boletoSignedUrl}" style="display: inline-block; padding: 12px 24px; background: ${emailSettings.primary_color}; color: white; text-decoration: none; border-radius: 6px;">📄 Visualizar Boleto PDF</a></p>` : ""}
                <p style="margin-top: 15px;"><strong>Linha Digitável:</strong></p>
                <code style="display: block; background: #f3f4f6; padding: 12px; font-family: monospace; font-size: 12px; word-break: break-all; border-radius: 4px;">${invoice.boleto_barcode}</code>
              </div>
            ` : ""}
            ${hasPix ? `
              <div style="margin: 20px 0;">
                <h3>📱 PIX Copia e Cola</h3>
                <code style="display: block; background: #f3f4f6; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-all; border-radius: 4px;">${invoice.pix_code}</code>
                <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">Copie o código acima e cole no app do seu banco na opção "PIX Copia e Cola".</p>
              </div>
            ` : ""}
            ${nfsePdfSignedUrl ? `
              <div style="margin: 20px 0;">
                <h3>📄 Nota Fiscal de Serviço (NFS-e)</h3>
                <p><a href="${nfsePdfSignedUrl}" style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 6px;">📄 Visualizar Nota Fiscal</a></p>
              </div>
            ` : ""}
          `;
          emailHtml = wrapInEmailLayout(defaultContent, emailSettings);
        }

        try {
          const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: { to: emailTo, subject: emailSubject, html: emailHtml },
          });

          if (emailError) throw emailError;

          await supabase.from("message_logs").insert({
            channel: "email",
            recipient: emailTo,
            message: `Reenvio de cobrança - Fatura #${invoice.invoice_number}`,
            status: "sent",
            sent_at: new Date().toISOString(),
            related_type: "invoice",
            related_id: invoice_id,
            user_id: client.id,
          });

          results.push({ channel: "email", success: true });
          console.log(`[RESEND] Email enviado para ${emailTo}`);

          // Atualizar status do email na fatura
          await supabase.from("invoices").update({
            email_status: "enviado",
            email_sent_at: new Date().toISOString(),
            email_error_msg: null,
          }).eq("id", invoice_id);
        } catch (emailError: unknown) {
          console.error("[RESEND] Erro ao enviar email:", emailError);
          const errMsg = emailError instanceof Error ? emailError.message : "Erro desconhecido";
          results.push({ channel: "email", success: false, error: errMsg });

          // Registrar erro no status do email
          await supabase.from("invoices").update({
            email_status: "erro",
            email_error_msg: errMsg,
          }).eq("id", invoice_id);
        }
      }
    }

    // Send WhatsApp
    if (channels.includes("whatsapp")) {
      const { data: evolutionSettings } = await supabase
        .from("integration_settings")
        .select("is_active, settings")
        .eq("integration_type", "evolution_api")
        .single();

      const isWhatsAppActive = evolutionSettings?.is_active;
      const evolutionConfig = evolutionSettings?.settings as { api_url?: string; api_key?: string; instance_name?: string } | null;
      const isWhatsAppConfigured = evolutionConfig?.api_url && evolutionConfig?.api_key && evolutionConfig?.instance_name;

      if (!evolutionSettings || !isWhatsAppActive) {
        results.push({ channel: "whatsapp", success: false, error: "Integração WhatsApp desativada", errorCode: "WHATSAPP_INTEGRATION_DISABLED" });
      } else if (!isWhatsAppConfigured) {
        results.push({ channel: "whatsapp", success: false, error: "Integração WhatsApp não configurada completamente", errorCode: "WHATSAPP_NOT_CONFIGURED" });
      } else if (!client.whatsapp) {
        results.push({ channel: "whatsapp", success: false, error: `Cliente "${client.name}" não possui WhatsApp cadastrado`, errorCode: "CLIENT_NO_WHATSAPP" });
      } else {
        let whatsappMessage = `🐝 *Colmeia TI - Cobrança*\n\n`;
        whatsappMessage += `Olá *${client.name}*!\n\n`;
        whatsappMessage += `📋 *Fatura #${invoice.invoice_number}*\n`;
        whatsappMessage += `💰 Valor: *${formatCurrency(invoice.amount)}*\n`;
        whatsappMessage += `📅 Vencimento: *${formatDate(invoice.due_date)}*\n\n`;

        if (hasBoleto) {
          whatsappMessage += `━━━━━━━━━━━━━━━━━━━━\n*📋 BOLETO*\n`;
          if (invoice.boleto_url) whatsappMessage += `🔗 Link: ${invoice.boleto_url}\n\n`;
          whatsappMessage += `*Linha Digitável:*\n\`\`\`${invoice.boleto_barcode}\`\`\`\n\n`;
        }

        if (hasPix) {
          whatsappMessage += `━━━━━━━━━━━━━━━━━━━━\n*📱 PIX COPIA E COLA*\n\n`;
          whatsappMessage += `\`\`\`${invoice.pix_code}\`\`\`\n\n`;
          whatsappMessage += `_Copie o código acima e cole no app do seu banco._\n`;
        }

        try {
          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: { to: client.whatsapp, message: whatsappMessage, relatedType: "invoice", relatedId: invoice_id },
          });

          if (whatsappError) throw whatsappError;
          results.push({ channel: "whatsapp", success: true });
          console.log(`[RESEND] WhatsApp enviado para ${client.whatsapp.slice(0, 4)}****`);
        } catch (whatsappError: unknown) {
          console.error("[RESEND] Erro ao enviar WhatsApp:", whatsappError);
          const errMsg = whatsappError instanceof Error ? whatsappError.message : "Erro desconhecido";
          results.push({ channel: "whatsapp", success: false, error: errMsg, errorCode: "WHATSAPP_SEND_ERROR" });
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    return new Response(
      JSON.stringify({
        success: anySuccess,
        results,
        message: allSuccess ? "Notificações enviadas com sucesso" : anySuccess ? "Algumas notificações falharam" : "Falha ao enviar notificações",
      }),
      { status: anySuccess ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[RESEND] Erro:", error);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
