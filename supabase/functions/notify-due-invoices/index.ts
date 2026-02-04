import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get days before due date from request or default to 3
    const body = await req.json().catch(() => ({}));
    const daysBeforeDue = body.days_before || 3;

    console.log(`Checking for invoices due in ${daysBeforeDue} days...`);

    // Calculate the target date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeDue);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Get today's date for comparison
    const today = new Date().toISOString().split('T')[0];

    // Find pending invoices that are due on or before the target date
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        amount,
        due_date,
        status,
        client_id,
        clients (
          id,
          name,
          email,
          financial_email,
          whatsapp
        )
      `)
      .eq("status", "pending")
      .gte("due_date", today)
      .lte("due_date", targetDateStr);

    if (invoicesError) {
      console.error("Error fetching invoices:", invoicesError);
      throw invoicesError;
    }

    if (!invoices || invoices.length === 0) {
      console.log("No invoices approaching due date found");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura próxima do vencimento", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${invoices.length} invoices approaching due date`);

    // Get integration settings
    const { data: smtpSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "smtp")
      .single();

    const { data: evolutionSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .single();

    const smtpActive = smtpSettings?.is_active;
    const whatsappActive = evolutionSettings?.is_active;

    const results: Array<{ invoice_id: string; client: string; email: boolean; whatsapp: boolean; notification: boolean }> = [];

for (const invoice of invoices) {
      const client = invoice.clients as unknown as Invoice['clients'];
      if (!client) continue;

      const dueDate = new Date(invoice.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      const dueDateFormatted = dueDate.toLocaleDateString('pt-BR');
      const amountFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.amount);

      const result = {
        invoice_id: invoice.id,
        client: client.name,
        email: false,
        whatsapp: false,
        notification: false
      };

      // Send email notification
      const clientEmail = client.financial_email || client.email;
      if (smtpActive && clientEmail) {
        try {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">⚠️ Lembrete de Vencimento</h2>
              <p>Olá <strong>${client.name}</strong>,</p>
              <p>Este é um lembrete de que sua fatura está próxima do vencimento:</p>
              <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Fatura:</strong> #${invoice.invoice_number}</p>
                <p style="margin: 5px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
                <p style="margin: 5px 0;"><strong>Vencimento:</strong> ${dueDateFormatted}</p>
                <p style="margin: 5px 0;"><strong>Dias restantes:</strong> ${daysUntilDue} dia(s)</p>
              </div>
              <p>Para evitar juros e multas, por favor efetue o pagamento até a data de vencimento.</p>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                Esta é uma mensagem automática. Em caso de dúvidas, entre em contato conosco.
              </p>
            </div>
          `;

          const { error: emailError } = await supabase.functions.invoke("send-email-smtp", {
            body: {
              to: clientEmail,
              subject: `⚠️ Lembrete: Fatura #${invoice.invoice_number} vence em ${daysUntilDue} dia(s)`,
              html: emailHtml,
            },
          });

          if (!emailError) {
            result.email = true;
            console.log(`Email sent to ${clientEmail} for invoice #${invoice.invoice_number}`);
          }
        } catch (error) {
          console.error("Error sending email:", error);
        }
      }

      // Send WhatsApp notification
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
            body: {
              to: client.whatsapp,
              message: whatsappMessage,
            },
          });

          if (!whatsappError) {
            result.whatsapp = true;
            console.log(`WhatsApp sent to ${client.whatsapp} for invoice #${invoice.invoice_number}`);
          }
        } catch (error) {
          console.error("Error sending WhatsApp:", error);
        }
      }

      // Create in-app notification for staff
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
      JSON.stringify({ 
        success: true, 
        message: `Notificações enviadas para ${results.length} fatura(s)`,
        summary,
        details: results
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in notify-due-invoices:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
