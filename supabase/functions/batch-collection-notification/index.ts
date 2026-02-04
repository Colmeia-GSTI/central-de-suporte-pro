import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const MESSAGE_TEMPLATES = {
  reminder: {
    subject: "Lembrete de Fatura Pendente",
    body: (clientName: string, invoiceNumber: number, amount: string, dueDate: string) =>
      `Olá ${clientName}!\n\nIdentificamos que a fatura #${invoiceNumber} no valor de ${amount} com vencimento em ${dueDate} encontra-se pendente.\n\nPor favor, regularize o pagamento para evitar interrupções nos serviços.\n\nEm caso de dúvidas, entre em contato conosco.\n\nAtenciosamente,\nEquipe Financeiro`,
  },
  urgent: {
    subject: "URGENTE: Fatura Vencida - Regularize seu Pagamento",
    body: (clientName: string, invoiceNumber: number, amount: string, dueDate: string) =>
      `Prezado(a) ${clientName},\n\nSua fatura #${invoiceNumber} no valor de ${amount} venceu em ${dueDate} e ainda não foi paga.\n\nSolicitamos a regularização imediata para evitar a suspensão dos serviços.\n\nCaso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.\n\nAtenciosamente,\nEquipe Financeiro`,
  },
  final: {
    subject: "AVISO FINAL: Fatura em Atraso - Medidas Serão Tomadas",
    body: (clientName: string, invoiceNumber: number, amount: string, dueDate: string) =>
      `Prezado(a) ${clientName},\n\nEste é o último aviso referente à fatura #${invoiceNumber} no valor de ${amount} vencida em ${dueDate}.\n\nCaso o pagamento não seja regularizado em até 48 horas, seremos obrigados a tomar medidas administrativas.\n\nEntre em contato conosco para negociar.\n\nAtenciosamente,\nEquipe Financeiro`,
  },
};

serve(async (req) => {
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

    // Fetch invoices with client data
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, amount, due_date,
        clients(name, email, financial_email, whatsapp)
      `)
      .in("id", invoice_ids);

    if (invoicesError) throw invoicesError;

    // Fetch integration settings
    const { data: smtpSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "resend")
      .single();

    const { data: whatsappSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .single();

    const results = {
      total: invoices?.length || 0,
      email: { sent: 0, failed: 0, errors: [] as string[] },
      whatsapp: { sent: 0, failed: 0, errors: [] as string[] },
    };

    const template = MESSAGE_TEMPLATES[message_template];

    for (const invoice of (invoices as unknown as Invoice[]) || []) {
      const client = invoice.clients;
      if (!client) continue;

      const formattedAmount = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(invoice.amount);

      const formattedDate = new Date(invoice.due_date).toLocaleDateString("pt-BR");
      const messageBody = template.body(
        client.name,
        invoice.invoice_number,
        formattedAmount,
        formattedDate
      );

      // Send Email
      if (channels.includes("email") && smtpSettings?.is_active) {
        const email = client.financial_email || client.email;
        if (email) {
          try {
            const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
              body: {
                to: email,
                subject: template.subject,
                html: `<div style="font-family: Arial, sans-serif; white-space: pre-line;">${messageBody}</div>`,
              },
            });

            if (emailError) {
              results.email.failed++;
              results.email.errors.push(`${client.name}: ${emailError.message}`);
            } else {
              results.email.sent++;
            }

            // Log notification
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
      if (channels.includes("whatsapp") && whatsappSettings?.is_active) {
        const phone = client.whatsapp;
        if (phone) {
          try {
            const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
              body: {
                phone,
                message: messageBody,
              },
            });

            if (whatsappError) {
              results.whatsapp.failed++;
              results.whatsapp.errors.push(`${client.name}: ${whatsappError.message}`);
            } else {
              results.whatsapp.sent++;
            }

            // Log notification
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
