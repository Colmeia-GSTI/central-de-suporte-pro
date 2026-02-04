import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TicketNotificationRequest {
  ticket_id: string;
  event_type: "created" | "updated" | "commented" | "resolved";
  comment?: string;
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

    const { ticket_id, event_type, comment }: TicketNotificationRequest = await req.json();

    console.log(`[send-ticket-notification] Processing ${event_type} for ticket ${ticket_id}`);

    // Fetch ticket with client info and requester contact
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        client:clients(id, name, email, phone, whatsapp),
        requester_contact:client_contacts!tickets_requester_contact_id_fkey(
          id, name, email, phone, whatsapp, notify_whatsapp, user_id
        )
      `)
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketError);
      throw new Error("Ticket not found");
    }

    console.log(`[send-ticket-notification] Ticket #${ticket.ticket_number} - ${ticket.title}`);
    console.log(`[send-ticket-notification] Requester contact:`, ticket.requester_contact);

    // Get portal URL from environment or use default
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://colmeiahdpro.lovable.app/portal";

    const eventMessages = {
      created: `Seu chamado #${ticket.ticket_number} foi aberto com sucesso.`,
      updated: `Seu chamado #${ticket.ticket_number} foi atualizado.`,
      commented: `Novo comentário no chamado #${ticket.ticket_number}.`,
      resolved: `Seu chamado #${ticket.ticket_number} foi resolvido! Por favor, acesse o portal para avaliar o atendimento e encerrar o chamado.`,
    };

    const statusLabels: Record<string, string> = {
      open: "Aberto",
      in_progress: "Em Andamento",
      waiting: "Aguardando",
      paused: "Pausado",
      waiting_third_party: "Aguardando Terceiro",
      no_contact: "Sem Contato",
      resolved: "Resolvido",
      closed: "Fechado",
    };

    const results: { email?: any; whatsapp?: any; telegram?: any; clientWhatsapp?: any } = {};

    // Get client notification rules
    const { data: notificationRules } = await supabase
      .from("client_notification_rules")
      .select("*, profiles:user_id(id, user_id, full_name, email, whatsapp_number, telegram_chat_id, notify_email, notify_whatsapp, notify_telegram)")
      .eq("client_id", ticket.client?.id);

    // Send Email notification if client has email
    if (ticket.client?.email) {
      try {
        const { data: resendSettings } = await supabase
          .from("integration_settings")
          .select("settings, is_active")
          .eq("integration_type", "resend")
          .eq("is_active", true)
          .maybeSingle();

        if (resendSettings?.is_active) {
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
                .footer { background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
                .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; }
                .ticket-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .comment-box { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0;">Central de Helpdesk</h1>
                </div>
                <div class="content">
                  <p>Olá <strong>${ticket.client.name}</strong>,</p>
                  <p>${eventMessages[event_type]}</p>
                  
                  <div class="ticket-info">
                    <p><strong>Chamado:</strong> #${ticket.ticket_number}</p>
                    <p><strong>Título:</strong> ${ticket.title}</p>
                    <p><strong>Status:</strong> <span class="status" style="background: #dbeafe; color: #1e40af;">${statusLabels[ticket.status] || ticket.status}</span></p>
                    <p><strong>Prioridade:</strong> ${ticket.priority}</p>
                  </div>
                  
                  ${comment ? `
                    <div class="comment-box">
                      <p><strong>Comentário:</strong></p>
                      <p>${comment}</p>
                    </div>
                  ` : ''}
                  
                  ${event_type === 'resolved' ? `
                    <div style="background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center;">
                      <p style="color: #166534; font-weight: 600; margin-bottom: 10px;">⭐ Avalie nosso atendimento</p>
                      <a href="${portalUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                        Avaliar e Encerrar Chamado
                      </a>
                    </div>
                  ` : ''}
                  
                  <p>Acesse o portal do cliente para mais detalhes.</p>
                </div>
                <div class="footer">
                  <p>Este é um email automático. Por favor, não responda diretamente.</p>
                </div>
              </div>
            </body>
            </html>
          `;

          const { data: emailResult, error: emailError } = await supabase.functions.invoke("send-email-resend", {
            body: {
              to: ticket.client.email,
              subject: `[Chamado #${ticket.ticket_number}] ${eventMessages[event_type]}`,
              html,
            },
          });

          results.email = emailError ? { error: emailError.message } : emailResult;
        }
      } catch (e) {
        console.error("Email error:", e);
      }
    }

    // Send WhatsApp notification to requester contact (client user who opened the ticket)
    const { data: evolutionSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .eq("is_active", true)
      .maybeSingle();

    const requesterContact = ticket.requester_contact;
    if (evolutionSettings?.is_active && requesterContact?.whatsapp && requesterContact?.notify_whatsapp !== false) {
      console.log(`[send-ticket-notification] Sending WhatsApp to requester: ${requesterContact.name} (${requesterContact.whatsapp})`);
      
      try {
      const whatsappMessage = `🎫 *Atualização do seu Chamado*\n\n` +
          `📋 *Chamado:* #${ticket.ticket_number}\n` +
          `📝 *Título:* ${ticket.title}\n` +
          `📊 *Status:* ${statusLabels[ticket.status] || ticket.status}\n\n` +
          `📢 ${eventMessages[event_type]}` +
          (comment ? `\n\n💬 *Comentário:* ${comment}` : '') +
          (event_type === 'resolved' ? `\n\n⭐ *Avalie o atendimento:*\n${portalUrl}` : '');

        const { data: waResult, error: waError } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            to: requesterContact.whatsapp,
            message: whatsappMessage,
            userId: requesterContact.user_id,
            relatedType: "ticket",
            relatedId: ticket.id,
          },
        });

        results.clientWhatsapp = waError ? { error: waError.message } : waResult;
        console.log(`[send-ticket-notification] Client WhatsApp result:`, results.clientWhatsapp);
      } catch (e) {
        console.error("[send-ticket-notification] Client WhatsApp error:", e);
        results.clientWhatsapp = { error: String(e) };
      }
    } else {
      console.log(`[send-ticket-notification] Skipping client WhatsApp - Evolution active: ${evolutionSettings?.is_active}, Contact WhatsApp: ${requesterContact?.whatsapp}, Notify enabled: ${requesterContact?.notify_whatsapp}`);
    }

    // Send WhatsApp notifications to staff users with rules for this client
    if (evolutionSettings?.is_active && notificationRules) {
      for (const rule of notificationRules) {
        const profile = rule.profiles as any;
        if (profile?.notify_whatsapp && profile?.whatsapp_number) {
          try {
            const whatsappMessage = `🎫 *Atualização de Chamado*\n\n` +
              `📋 *Chamado:* #${ticket.ticket_number}\n` +
              `📝 *Título:* ${ticket.title}\n` +
              `🏢 *Cliente:* ${ticket.client?.name || 'N/A'}\n` +
              `📊 *Status:* ${statusLabels[ticket.status] || ticket.status}\n` +
              `⚡ *Prioridade:* ${ticket.priority}\n\n` +
              `📢 *Evento:* ${eventMessages[event_type]}` +
              (comment ? `\n\n💬 *Comentário:* ${comment}` : '');

            const { data: waResult, error: waError } = await supabase.functions.invoke("send-whatsapp", {
              body: {
                to: profile.whatsapp_number,
                message: whatsappMessage,
                user_id: profile.user_id,
                related_type: "ticket",
                related_id: ticket.id,
              },
            });

            if (!results.whatsapp) results.whatsapp = [];
            results.whatsapp.push(waError ? { error: waError.message } : waResult);
          } catch (e) {
            console.error("WhatsApp error:", e);
          }
        }
      }
    }

    // Send Telegram notifications to users with rules for this client
    const { data: telegramSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "telegram")
      .eq("is_active", true)
      .maybeSingle();

    if (telegramSettings?.is_active && notificationRules) {
      for (const rule of notificationRules) {
        const profile = rule.profiles as any;
        if (profile?.notify_telegram && profile?.telegram_chat_id) {
          try {
            const telegramMessage = `🎫 <b>Atualização de Chamado</b>\n\n` +
              `📋 <b>Chamado:</b> #${ticket.ticket_number}\n` +
              `📝 <b>Título:</b> ${ticket.title}\n` +
              `🏢 <b>Cliente:</b> ${ticket.client?.name || 'N/A'}\n` +
              `📊 <b>Status:</b> ${statusLabels[ticket.status] || ticket.status}\n` +
              `⚡ <b>Prioridade:</b> ${ticket.priority}\n\n` +
              `📢 <b>Evento:</b> ${eventMessages[event_type]}` +
              (comment ? `\n\n💬 <b>Comentário:</b> ${comment}` : '');

            const { data: tgResult, error: tgError } = await supabase.functions.invoke("send-telegram", {
              body: {
                chat_id: profile.telegram_chat_id,
                message: telegramMessage,
                parse_mode: "HTML",
                user_id: profile.user_id,
                related_type: "ticket",
                related_id: ticket.id,
              },
            });

            if (!results.telegram) results.telegram = [];
            results.telegram.push(tgError ? { error: tgError.message } : tgResult);
          } catch (e) {
            console.error("Telegram error:", e);
          }
        }
      }
    }

    console.log("Ticket notification results:", results);

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
