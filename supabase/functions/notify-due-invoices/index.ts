import { createClient } from "npm:@supabase/supabase-js@2";
import { applyNotificationMessage } from "../_shared/notification-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

interface Invoice {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  client_id: string;
  clients: {
    id: string;
    name: string;
    email: string | null;
    financial_email: string | null;
    whatsapp: string | null;
  };
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

    const body = await req.json().catch(() => ({}));
    const daysBeforeDue = body.days_before || 3;

    console.log(`Checking for invoices due in ${daysBeforeDue} days...`);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeDue);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // Fetch settings, template, and invoices in parallel
    const [settingsRes, templateRes, invoicesRes, evolutionRes] = await Promise.all([
      supabase.from("email_settings").select("*").limit(1).single(),
      supabase.from("email_templates").select("*").eq("template_type", "invoice_reminder").maybeSingle(),
      supabase.from("invoices").select(`
        id, invoice_number, amount, due_date, status, client_id, contract_id,
        clients (id, name, email, financial_email, whatsapp)
      `).eq("status", "pending").gte("due_date", today).lte("due_date", targetDateStr),
      supabase.from("integration_settings").select("settings, is_active").eq("integration_type", "evolution_api").single(),
    ]);

    const emailSettings: EmailSettings = settingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Esta é uma mensagem automática. Em caso de dúvidas, entre em contato conosco.",
    };

    const emailTemplate: EmailTemplate | null = templateRes.data?.is_active ? templateRes.data : null;
    const invoices = invoicesRes.data;
    const whatsappActive = evolutionRes.data?.is_active;

    if (invoicesRes.error) {
      console.error("Error fetching invoices:", invoicesRes.error);
      throw invoicesRes.error;
    }

    if (!invoices || invoices.length === 0) {
      console.log("No invoices approaching due date found");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura próxima do vencimento", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${invoices.length} invoices approaching due date`);

    const results: Array<{ invoice_id: string; client: string; email: boolean; whatsapp: boolean; notification: boolean }> = [];

    for (const invoice of invoices) {
      const client = invoice.clients as unknown as Invoice['clients'];
      if (!client) continue;

      // Check if notification already sent for this invoice (dedup)
      const { data: existingNotif } = await supabase
        .from("invoice_notification_logs")
        .select("id")
        .eq("invoice_id", invoice.id)
        .eq("notification_type", "payment_reminder")
        .limit(1);

      if (existingNotif && existingNotif.length > 0) {
        console.log(`[NOTIFY-DUE] Skipping invoice #${invoice.invoice_number} - already notified`);
        continue;
      }

      // Verificar NFS-e vinculada - se existe mas XML não disponível, pular
      const { data: linkedNfse } = await supabase
        .from("nfse_history")
        .select("id, status, pdf_url, xml_url")
        .eq("invoice_id", invoice.id)
        .eq("status", "autorizada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (linkedNfse && !linkedNfse.xml_url) {
        console.log(`[NOTIFY-DUE] Skipping invoice #${invoice.invoice_number} - NFS-e XML not available yet`);
        await supabase.from("application_logs").insert({
          module: "billing_notification",
          level: "warn",
          message: `Lembrete bloqueado: NFS-e sem XML para fatura #${invoice.invoice_number}`,
          context: { invoice_id: invoice.id, nfse_id: linkedNfse.id, blocked_artifacts: ["xml"] },
        });
        continue;
      }

      const dueDate = new Date(invoice.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const dueDateFormatted = dueDate.toLocaleDateString('pt-BR');
      const amountFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.amount);

      const result = { invoice_id: invoice.id, client: client.name, email: false, whatsapp: false, notification: false };

      // Template variables
      const templateVars: Record<string, string> = {
        client_name: client.name,
        invoice_number: String(invoice.invoice_number),
        amount: amountFormatted,
        due_date: dueDateFormatted,
        days_until_due: String(daysUntilDue),
      };

      // Send email
      const clientEmail = client.financial_email || client.email;
      if (clientEmail) {
        try {
          let emailSubject: string;
          let emailHtml: string;

          if (emailTemplate) {
            emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
            const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
            emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
          } else {
            emailSubject = `⚠️ Lembrete: Fatura #${invoice.invoice_number} vence em ${daysUntilDue} dia(s)`;
            const defaultContent = `
              <h2 style="color: ${emailSettings.primary_color};">⚠️ Lembrete de Vencimento</h2>
              <p>Olá <strong>${client.name}</strong>,</p>
              <p>Este é um lembrete de que sua fatura está próxima do vencimento:</p>
              <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Fatura:</strong> #${invoice.invoice_number}</p>
                <p style="margin: 5px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
                <p style="margin: 5px 0;"><strong>Vencimento:</strong> ${dueDateFormatted}</p>
                <p style="margin: 5px 0;"><strong>Dias restantes:</strong> ${daysUntilDue} dia(s)</p>
              </div>
              <p>Para evitar juros e multas, por favor efetue o pagamento até a data de vencimento.</p>
            `;
            emailHtml = wrapInEmailLayout(defaultContent, emailSettings);
          }

          // Apply contract notification_message if available
          if (invoice.contract_id) {
            const { data: contractData } = await supabase
              .from("contracts")
              .select("notification_message, name")
              .eq("id", invoice.contract_id)
              .single();
            emailHtml = applyNotificationMessage(emailHtml, contractData?.notification_message || null, {
              cliente: client.name,
              valor: amountFormatted,
              vencimento: dueDateFormatted,
              fatura: String(invoice.invoice_number),
              contrato: contractData?.name || "",
            });
          }

          const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: { to: clientEmail, subject: emailSubject, html: emailHtml },
          });

          if (!emailError) {
            result.email = true;
            console.log(`Email sent to ${clientEmail} for invoice #${invoice.invoice_number}`);

            // Atualizar status do email na fatura
            await supabase.from("invoices").update({
              email_status: "enviado",
              email_sent_at: new Date().toISOString(),
              email_error_msg: null,
            }).eq("id", invoice.id);
          }
        } catch (error) {
          console.error("Error sending email:", error);
        }
      }

      // Send WhatsApp
      if (whatsappActive && client.whatsapp) {
        try {
          const whatsappMessage = `⚠️ *Lembrete de Vencimento*

Olá *${client.name}*,

Sua fatura está próxima do vencimento:

📄 *Fatura:* #${invoice.invoice_number}
💰 *Valor:* ${amountFormatted}
📅 *Vencimento:* ${dueDateFormatted}
⏳ *Dias restantes:* ${daysUntilDue} dia(s)

Para evitar juros e multas, efetue o pagamento até a data de vencimento.`;

          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: { to: client.whatsapp, message: whatsappMessage },
          });

          if (!whatsappError) {
            result.whatsapp = true;
            console.log(`WhatsApp sent to ${client.whatsapp} for invoice #${invoice.invoice_number}`);
          }
        } catch (error) {
          console.error("Error sending WhatsApp:", error);
        }
      }

      // Create staff notifications
      try {
        const { data: staffUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "financial", "manager"]);

        if (staffUsers && staffUsers.length > 0) {
          const notifications = staffUsers.map(user => ({
            user_id: user.user_id,
            title: `Fatura #${invoice.invoice_number} próxima do vencimento`,
            message: `A fatura de ${client.name} no valor de ${amountFormatted} vence em ${daysUntilDue} dia(s) (${dueDateFormatted})`,
            type: "warning",
            related_type: "invoice",
            related_id: invoice.id,
          }));

          await supabase.from("notifications").insert(notifications);
          result.notification = true;
        }
      } catch (error) {
        console.error("Error creating notifications:", error);
      }

      // Log notification to prevent duplicates on re-run
      if (result.email || result.whatsapp) {
        const logs = [];
        if (result.email) {
          logs.push({ invoice_id: invoice.id, notification_type: "payment_reminder", channel: "email", recipient: client.financial_email || client.email });
        }
        if (result.whatsapp) {
          logs.push({ invoice_id: invoice.id, notification_type: "payment_reminder", channel: "whatsapp", recipient: client.whatsapp });
        }
        await supabase.from("invoice_notification_logs").upsert(logs, { onConflict: "invoice_id,notification_type,channel" });
      }

      results.push(result);
    }

    const summary = {
      total: results.length,
      emails_sent: results.filter(r => r.email).length,
      whatsapp_sent: results.filter(r => r.whatsapp).length,
      notifications_created: results.filter(r => r.notification).length,
    };

    console.log("Due invoice notifications completed:", summary);

    return new Response(
      JSON.stringify({ success: true, message: `Notificações enviadas para ${results.length} fatura(s)`, summary, details: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-due-invoices:", error);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
