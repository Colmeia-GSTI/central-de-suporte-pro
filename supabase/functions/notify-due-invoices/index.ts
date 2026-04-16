import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getEmailSettings,
  wrapInEmailLayout,
  replaceVariables,
  applyNotificationMessage,
  applyNotificationMessageText,
  formatCurrencyBRL,
  formatDateBR,
  getEmailTemplate,
} from "../_shared/email-helpers.ts";

interface Invoice {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  client_id: string;
  contract_id: string | null;
  boleto_url: string | null;
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

    // Fetch settings, template, invoices, and integrations in parallel
    const [emailSettings, emailTemplate, invoicesRes, evolutionRes] = await Promise.all([
      getEmailSettings(supabase),
      getEmailTemplate(supabase, "invoice_reminder"),
      supabase.from("invoices").select(`
        id, invoice_number, amount, due_date, status, client_id, contract_id, boleto_url,
        clients (id, name, email, financial_email, whatsapp)
      `).eq("status", "pending").gte("due_date", today).lte("due_date", targetDateStr),
      supabase.from("integration_settings").select("settings, is_active").eq("integration_type", "evolution_api").single(),
    ]);

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

      // Dedup check
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

      // Check NFS-e XML availability
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
      const dueDateFormatted = formatDateBR(invoice.due_date);
      const amountFormatted = formatCurrencyBRL(invoice.amount);

      const result = { invoice_id: invoice.id, client: client.name, email: false, whatsapp: false, notification: false };

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
              <h2 style="color: ${emailSettings.primaryColor};">⚠️ Lembrete de Vencimento</h2>
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

          // Apply contract notification_message
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

          // Build boleto attachment
          const attachments: { filename: string; path: string }[] = [];
          if (invoice.boleto_url) {
            // Resolve signed URL for boleto
            const resolveStoragePath = (p: string) => {
              if (p.startsWith("http")) return null;
              if (p.startsWith("invoice-documents/")) return { bucket: "invoice-documents", path: p.replace("invoice-documents/", "") };
              return null;
            };
            const resolved = resolveStoragePath(invoice.boleto_url);
            if (resolved) {
              const { data: signedData } = await supabase.storage.from(resolved.bucket).createSignedUrl(resolved.path, 604800);
              if (signedData?.signedUrl) {
                attachments.push({ filename: `Boleto_${invoice.invoice_number}.pdf`, path: signedData.signedUrl });
              }
            } else if (invoice.boleto_url.startsWith("http")) {
              attachments.push({ filename: `Boleto_${invoice.invoice_number}.pdf`, path: invoice.boleto_url });
            }
          }

          const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: {
              to: clientEmail,
              subject: emailSubject,
              html: emailHtml,
              ...(attachments.length > 0 ? { attachments } : {}),
            },
          });

          if (!emailError) {
            result.email = true;
            console.log(`Email sent to ${clientEmail} for invoice #${invoice.invoice_number}`);

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
          let whatsappMessage = `⚠️ *Lembrete de Vencimento*

Olá *${client.name}*,

Sua fatura está próxima do vencimento:

📄 *Fatura:* #${invoice.invoice_number}
💰 *Valor:* ${amountFormatted}
📅 *Vencimento:* ${dueDateFormatted}
⏳ *Dias restantes:* ${daysUntilDue} dia(s)

Para evitar juros e multas, efetue o pagamento até a data de vencimento.`;

          // Apply contract custom message
          if (invoice.contract_id) {
            const { data: contractForWa } = await supabase
              .from("contracts")
              .select("notification_message, name")
              .eq("id", invoice.contract_id)
              .single();
            whatsappMessage = applyNotificationMessageText(whatsappMessage, contractForWa?.notification_message || null, {
              cliente: client.name,
              valor: amountFormatted,
              vencimento: dueDateFormatted,
              fatura: String(invoice.invoice_number),
              contrato: contractForWa?.name || "",
            });
          }

          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: {
              to: client.whatsapp,
              message: whatsappMessage,
              userId: client.id,
              relatedType: "invoice",
              relatedId: invoice.id,
            },
          });

          if (!whatsappError) {
            result.whatsapp = true;
            console.log(`WhatsApp sent to ${client.whatsapp} for invoice #${invoice.invoice_number}`);

            await supabase.from("message_logs").insert({
              channel: "whatsapp",
              recipient: client.whatsapp,
              message: whatsappMessage.slice(0, 500),
              status: "sent",
              sent_at: new Date().toISOString(),
              related_type: "invoice",
              related_id: invoice.id,
              user_id: client.id,
            });
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

      // Log notification to prevent duplicates
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
