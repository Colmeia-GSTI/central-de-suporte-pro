import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendRequest {
  invoice_id: string;
  channels: ("email" | "whatsapp")[];
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

    const { invoice_id, channels }: ResendRequest = await req.json();

    if (!invoice_id || !channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ error: "invoice_id e channels são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoice with client info
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        amount,
        due_date,
        boleto_barcode,
        boleto_url,
        pix_code,
        payment_method,
        clients(id, name, email, whatsapp, financial_email)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Fatura não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientData = invoice.clients as unknown as { id: string; name: string; email?: string; whatsapp?: string; financial_email?: string } | null;
    if (!clientData) {
      return new Response(
        JSON.stringify({ error: "Cliente não encontrado para esta fatura" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const client = clientData;

    const formatCurrency = (v: number) => 
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const formatDate = (d: string) => {
      const date = new Date(d);
      return date.toLocaleDateString("pt-BR");
    };

    const results: { channel: string; success: boolean; error?: string; errorCode?: string }[] = [];

    // Prepare payment info
    const hasBoleto = !!invoice.boleto_barcode;
    const hasPix = !!invoice.pix_code;

    if (!hasBoleto && !hasPix) {
      return new Response(
        JSON.stringify({ error: "Esta fatura não tem boleto ou PIX gerado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send Email
    if (channels.includes("email")) {
      const emailTo = client.financial_email || client.email;
      if (!emailTo) {
        results.push({ channel: "email", success: false, error: "Cliente sem email cadastrado" });
      } else {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0;">🐝 Colmeia TI</h1>
            </div>
            
            <div style="padding: 30px; background: #ffffff; border: 1px solid #e5e7eb;">
              <h2 style="color: #374151; margin-top: 0;">Cobrança - Fatura #${invoice.invoice_number}</h2>
              
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
                  <h3 style="color: #374151;">📋 Boleto Bancário</h3>
                  ${invoice.boleto_url ? `
                    <p><a href="${invoice.boleto_url}" style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">📄 Visualizar Boleto PDF</a></p>
                  ` : ""}
                  <p style="margin-top: 15px;"><strong>Linha Digitável:</strong></p>
                  <code style="display: block; background: #f3f4f6; padding: 12px; font-family: monospace; font-size: 12px; word-break: break-all; border-radius: 4px; border: 1px solid #e5e7eb;">${invoice.boleto_barcode}</code>
                </div>
              ` : ""}
              
              ${hasPix ? `
                <div style="margin: 20px 0;">
                  <h3 style="color: #374151;">📱 PIX Copia e Cola</h3>
                  <code style="display: block; background: #f3f4f6; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-all; border-radius: 4px; border: 1px solid #e5e7eb;">${invoice.pix_code}</code>
                  <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">Copie o código acima e cole no app do seu banco na opção "PIX Copia e Cola".</p>
                </div>
              ` : ""}
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="font-size: 12px; color: #9ca3af; text-align: center;">
                Este email foi enviado automaticamente pelo sistema Colmeia TI.<br>
                Em caso de dúvidas, entre em contato conosco.
              </p>
            </div>
          </div>
        `;

        try {
          const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: {
              to: emailTo,
              subject: `Cobrança - Fatura #${invoice.invoice_number} - ${formatCurrency(invoice.amount)}`,
              html: emailHtml,
            },
          });

          if (emailError) throw emailError;

          // Log the message
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
        } catch (emailError: any) {
          console.error("[RESEND] Erro ao enviar email:", emailError);
          results.push({ channel: "email", success: false, error: emailError.message });
        }
      }
    }

    // Send WhatsApp
    if (channels.includes("whatsapp")) {
      // First, check if WhatsApp integration is active
      const { data: evolutionSettings } = await supabase
        .from("integration_settings")
        .select("is_active, settings")
        .eq("integration_type", "evolution_api")
        .single();

      const isWhatsAppIntegrationActive = evolutionSettings?.is_active;
      const evolutionConfig = evolutionSettings?.settings as { api_url?: string; api_key?: string; instance_name?: string } | null;
      const isWhatsAppConfigured = evolutionConfig?.api_url && evolutionConfig?.api_key && evolutionConfig?.instance_name;

      if (!evolutionSettings || !isWhatsAppIntegrationActive) {
        results.push({ 
          channel: "whatsapp", 
          success: false, 
          error: "Integração WhatsApp desativada",
          errorCode: "WHATSAPP_INTEGRATION_DISABLED"
        });
      } else if (!isWhatsAppConfigured) {
        results.push({ 
          channel: "whatsapp", 
          success: false, 
          error: "Integração WhatsApp não configurada completamente",
          errorCode: "WHATSAPP_NOT_CONFIGURED"
        });
      } else if (!client.whatsapp) {
        results.push({ 
          channel: "whatsapp", 
          success: false, 
          error: `Cliente "${client.name}" não possui WhatsApp cadastrado`,
          errorCode: "CLIENT_NO_WHATSAPP"
        });
      } else {
        let whatsappMessage = `🐝 *Colmeia TI - Cobrança*\n\n`;
        whatsappMessage += `Olá *${client.name}*!\n\n`;
        whatsappMessage += `📋 *Fatura #${invoice.invoice_number}*\n`;
        whatsappMessage += `💰 Valor: *${formatCurrency(invoice.amount)}*\n`;
        whatsappMessage += `📅 Vencimento: *${formatDate(invoice.due_date)}*\n\n`;

        if (hasBoleto) {
          whatsappMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
          whatsappMessage += `*📋 BOLETO*\n`;
          if (invoice.boleto_url) {
            whatsappMessage += `🔗 Link: ${invoice.boleto_url}\n\n`;
          }
          whatsappMessage += `*Linha Digitável:*\n\`\`\`${invoice.boleto_barcode}\`\`\`\n\n`;
        }

        if (hasPix) {
          whatsappMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
          whatsappMessage += `*📱 PIX COPIA E COLA*\n\n`;
          whatsappMessage += `\`\`\`${invoice.pix_code}\`\`\`\n\n`;
          whatsappMessage += `_Copie o código acima e cole no app do seu banco._\n`;
        }

        try {
          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: {
              to: client.whatsapp,
              message: whatsappMessage,
              relatedType: "invoice",
              relatedId: invoice_id,
            },
          });

          if (whatsappError) throw whatsappError;

          results.push({ channel: "whatsapp", success: true });
          console.log(`[RESEND] WhatsApp enviado para ${client.whatsapp.slice(0, 4)}****`);
        } catch (whatsappError: any) {
          console.error("[RESEND] Erro ao enviar WhatsApp:", whatsappError);
          const errorMsg = whatsappError.message?.includes("timeout") 
            ? "Timeout na conexão com WhatsApp - verifique se a integração está conectada"
            : whatsappError.message;
          results.push({ 
            channel: "whatsapp", 
            success: false, 
            error: errorMsg,
            errorCode: "WHATSAPP_SEND_ERROR"
          });
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    return new Response(
      JSON.stringify({
        success: anySuccess,
        results,
        message: allSuccess
          ? "Notificações enviadas com sucesso"
          : anySuccess
          ? "Algumas notificações falharam"
          : "Falha ao enviar notificações",
      }),
      {
        status: anySuccess ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[RESEND] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
