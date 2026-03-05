import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Map template type
    const templateTypeMap: Record<string, string> = {
      reminder: "invoice_collection_reminder",
      urgent: "invoice_collection_urgent",
      final: "invoice_collection_final",
    };
    const templateType = templateTypeMap[message_template];

    // Fetch settings, template, invoices, and integrations in parallel
    const [settingsRes, templateRes, invoicesRes, whatsappRes] = await Promise.all([
      supabase.from("email_settings").select("*").limit(1).single(),
      supabase.from("email_templates").select("*").eq("template_type", templateType).maybeSingle(),
      supabase.from("invoices").select(`id, invoice_number, amount, due_date, clients(name, email, financial_email, whatsapp)`).in("id", invoice_ids),
      supabase.from("integration_settings").select("settings, is_active").eq("integration_type", "evolution_api").single(),
    ]);

    const emailSettings: EmailSettings = settingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Atenciosamente, Equipe Financeira",
    };

    const emailTemplate: EmailTemplate | null = templateRes.data?.is_active ? templateRes.data : null;
    const invoices = invoicesRes.data;

    if (invoicesRes.error) throw invoicesRes.error;

    const results = {
      total: invoices?.length || 0,
      email: { sent: 0, failed: 0, errors: [] as string[] },
      whatsapp: { sent: 0, failed: 0, errors: [] as string[] },
    };

    // Default messages for when no template
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

      const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(invoice.amount);
      const formattedDate = new Date(invoice.due_date).toLocaleDateString("pt-BR");

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
