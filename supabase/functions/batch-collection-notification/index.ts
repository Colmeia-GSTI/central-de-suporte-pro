import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getEmailSettings,
  wrapInEmailLayout,
  replaceVariables,
  applyNotificationMessage,
  formatCurrencyBRL,
  formatDateBR,
  getEmailTemplate,
} from "../_shared/email-helpers.ts";

interface BatchRequest {
  invoice_ids: string[];
  channels: ("email" | "whatsapp")[];
  message_template?: "reminder" | "urgent" | "final";
}

interface ClientInfo {
  name: string;
  email: string | null;
  financial_email: string | null;
  whatsapp: string | null;
}

interface Invoice {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  contract_id: string | null;
  clients: ClientInfo | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { invoice_ids, channels, message_template = "reminder" }: BatchRequest = await req.json();

    if (!invoice_ids || invoice_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "invoice_ids é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const templateTypeMap: Record<string, string> = {
      reminder: "invoice_collection_reminder",
      urgent: "invoice_collection_urgent",
      final: "invoice_collection_final",
    };
    const templateType = templateTypeMap[message_template];

    const [emailSettings, emailTemplate, invoicesRes, whatsappRes] = await Promise.all([
      getEmailSettings(supabase),
      getEmailTemplate(supabase, templateType),
      supabase.from("invoices").select(`id, invoice_number, amount, due_date, contract_id, clients(name, email, financial_email, whatsapp)`).in("id", invoice_ids),
      supabase.from("integration_settings").select("settings, is_active").eq("integration_type", "evolution_api").single(),
    ]);

    const invoices = invoicesRes.data;
    if (invoicesRes.error) throw invoicesRes.error;

    const results = {
      total: invoices?.length || 0,
      email: { sent: 0, failed: 0, errors: [] as string[] },
      whatsapp: { sent: 0, failed: 0, errors: [] as string[] },
    };

    const defaultMessages = {
      reminder: {
        subject: "Lembrete de Fatura Pendente",
        body: (name: string, num: number, amount: string, date: string) =>
          `<h2>Lembrete de Fatura Pendente</h2><p>Olá <strong>${name}</strong>,</p><p>Identificamos que a fatura #${num} no valor de ${amount} com vencimento em ${date} encontra-se pendente.</p><p>Por favor, regularize o pagamento para evitar interrupções nos serviços.</p><p>Em caso de dúvidas, entre em contato conosco.</p>`,
      },
      urgent: {
        subject: "URGENTE: Fatura Vencida - Regularize seu Pagamento",
        body: (name: string, num: number, amount: string, date: string) =>
          `<h2 style="color: #dc2626;">⚠️ Fatura Vencida</h2><p>Prezado(a) <strong>${name}</strong>,</p><p>Sua fatura #${num} no valor de ${amount} venceu em ${date} e ainda não foi paga.</p><p><strong>Solicitamos a regularização imediata para evitar a suspensão dos serviços.</strong></p><p>Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.</p>`,
      },
      final: {
        subject: "AVISO FINAL: Fatura em Atraso - Medidas Serão Tomadas",
        body: (name: string, num: number, amount: string, date: string) =>
          `<h2 style="color: #dc2626;">🚨 Aviso Final</h2><p>Prezado(a) <strong>${name}</strong>,</p><p>Este é o <strong>último aviso</strong> referente à fatura #${num} no valor de ${amount} vencida em ${date}.</p><p><strong style="color: #dc2626;">Caso o pagamento não seja regularizado em até 48 horas, seremos obrigados a tomar medidas administrativas.</strong></p><p>Entre em contato conosco para negociar.</p>`,
      },
    };

    const whatsappMessages = {
      reminder: (name: string, num: number, amount: string, date: string) =>
        `Olá ${name}!\n\nIdentificamos que a fatura #${num} no valor de ${amount} com vencimento em ${date} encontra-se pendente.\n\nPor favor, regularize o pagamento para evitar interrupções nos serviços.\n\nAtenciosamente,\nEquipe Financeiro`,
      urgent: (name: string, num: number, amount: string, date: string) =>
        `Prezado(a) ${name},\n\nSua fatura #${num} no valor de ${amount} venceu em ${date} e ainda não foi paga.\n\nSolicitamos a regularização imediata para evitar a suspensão dos serviços.\n\nCaso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.\n\nAtenciosamente,\nEquipe Financeiro`,
      final: (name: string, num: number, amount: string, date: string) =>
        `Prezado(a) ${name},\n\nEste é o último aviso referente à fatura #${num} no valor de ${amount} vencida em ${date}.\n\nCaso o pagamento não seja regularizado em até 48 horas, seremos obrigados a tomar medidas administrativas.\n\nEntre em contato conosco para negociar.\n\nAtenciosamente,\nEquipe Financeiro`,
    };

    for (const invoice of (invoices as unknown as Invoice[]) || []) {
      const client = invoice.clients;
      if (!client) continue;

      const formattedAmount = formatCurrencyBRL(invoice.amount);
      const formattedDate = formatDateBR(invoice.due_date);

      const templateVars: Record<string, string> = {
        client_name: client.name,
        invoice_number: String(invoice.invoice_number),
        amount: formattedAmount,
        due_date: formattedDate,
      };

      // Send Email
      if (channels.includes("email")) {
        const email = client.financial_email || client.email;
        if (email) {
          try {
            let emailSubject: string;
            let emailHtml: string;

            if (emailTemplate) {
              emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
              const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
              emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
            } else {
              const defaultTemplate = defaultMessages[message_template];
              emailSubject = defaultTemplate.subject;
              const contentHtml = defaultTemplate.body(client.name, invoice.invoice_number, formattedAmount, formattedDate);
              emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
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
                valor: formattedAmount,
                vencimento: formattedDate,
                fatura: String(invoice.invoice_number),
                contrato: contractData?.name || "",
              });
            }

            const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
              body: { to: email, subject: emailSubject, html: emailHtml },
            });

            if (emailError) {
              results.email.failed++;
              results.email.errors.push(`${client.name}: ${emailError.message}`);
            } else {
              results.email.sent++;
            }

            await supabase.from("invoice_notification_logs").insert({
              invoice_id: invoice.id,
              notification_type: "batch_collection",
              channel: "email",
              success: !emailError,
              error_message: emailError?.message,
            });
          } catch (err: unknown) {
            results.email.failed++;
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            results.email.errors.push(`${client.name}: ${errorMessage}`);
          }
        }
      }

      // Send WhatsApp
      if (channels.includes("whatsapp") && whatsappRes.data?.is_active) {
        const phone = client.whatsapp;
        if (phone) {
          try {
            const whatsappMessage = whatsappMessages[message_template](client.name, invoice.invoice_number, formattedAmount, formattedDate);

            const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
              body: { phone, message: whatsappMessage },
            });

            if (whatsappError) {
              results.whatsapp.failed++;
              results.whatsapp.errors.push(`${client.name}: ${whatsappError.message}`);
            } else {
              results.whatsapp.sent++;
            }

            await supabase.from("invoice_notification_logs").insert({
              invoice_id: invoice.id,
              notification_type: "batch_collection",
              channel: "whatsapp",
              success: !whatsappError,
              error_message: whatsappError?.message,
            });
          } catch (err: unknown) {
            results.whatsapp.failed++;
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            results.whatsapp.errors.push(`${client.name}: ${errorMessage}`);
          }
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in batch-collection-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
