import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TicketNotificationRequest {
  ticket_id: string;
  event_type: "created" | "updated" | "commented" | "resolved";
  comment?: string;
}

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
    .email-content blockquote { border-left: 3px solid ${settings.primary_color}; padding-left: 15px; margin: 15px 0; background: #f9fafb; padding: 12px 15px; }
    .email-footer { background: ${settings.secondary_color}; color: #9ca3af; padding: 20px 24px; text-align: center; font-size: 12px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; background: #dbeafe; color: #1e40af; }
    .ticket-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb; }
    .comment-box { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${settings.primary_color}; }
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

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (char) => map[char]);
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

    const { ticket_id, event_type, comment }: TicketNotificationRequest = await req.json();
    console.log(`[send-ticket-notification] Processing ${event_type} for ticket ${ticket_id}`);

    // Fetch settings, template, and ticket in parallel
    const templateType = `ticket_${event_type}`;
    const [settingsRes, templateRes, ticketRes] = await Promise.all([
      supabase.from("email_settings").select("*").limit(1).single(),
      supabase.from("email_templates").select("*").eq("template_type", templateType).maybeSingle(),
      supabase.from("tickets").select(`
        *, client:clients(id, name, email, phone, whatsapp),
        requester_contact:client_contacts!tickets_requester_contact_id_fkey(
          id, name, email, phone, whatsapp, notify_whatsapp, user_id
        )
      `).eq("id", ticket_id).single(),
    ]);

    const emailSettings: EmailSettings = settingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Este é um email automático. Por favor, não responda diretamente.",
    };

    const emailTemplate: EmailTemplate | null = templateRes.data?.is_active ? templateRes.data : null;

    if (ticketRes.error || !ticketRes.data) {
      console.error("Ticket not found:", ticketRes.error);
      throw new Error("Ticket not found");
    }
    const ticket = ticketRes.data;

    console.log(`[send-ticket-notification] Ticket #${ticket.ticket_number} - ${ticket.title}`);

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://suporte.colmeiagsti.com/portal";

    const statusLabels: Record<string, string> = {
      open: "Aberto", in_progress: "Em Andamento", waiting: "Aguardando", paused: "Pausado",
      waiting_third_party: "Aguardando Terceiro", no_contact: "Sem Contato", resolved: "Resolvido", closed: "Fechado",
    };

    const eventMessages: Record<string, string> = {
      created: `Seu chamado #${ticket.ticket_number} foi aberto com sucesso.`,
      updated: `Seu chamado #${ticket.ticket_number} foi atualizado.`,
      commented: `Novo comentário no chamado #${ticket.ticket_number}.`,
      resolved: `Seu chamado #${ticket.ticket_number} foi resolvido! Por favor, acesse o portal para avaliar o atendimento.`,
    };

    // Template variables
    const templateVars: Record<string, string> = {
      client_name: ticket.client?.name || "Cliente",
      ticket_number: String(ticket.ticket_number),
      title: ticket.title,
      status: statusLabels[ticket.status] || ticket.status,
      priority: ticket.priority,
      comment: comment ? escapeHtml(comment) : "",
      portal_url: portalUrl,
    };

    const results: { email?: unknown; whatsapp?: unknown; telegram?: unknown; clientWhatsapp?: unknown } = {};

    // Get notification rules
    const { data: notificationRules } = await supabase
      .from("client_notification_rules")
      .select("*, profiles:user_id(id, user_id, full_name, email, whatsapp_number, telegram_chat_id, notify_email, notify_whatsapp, notify_telegram)")
      .eq("client_id", ticket.client?.id);

    // Send Email notification
    if (ticket.client?.email) {
      try {
        let emailSubject: string;
        let emailHtml: string;

        if (emailTemplate) {
          emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
          const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
          emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
        } else {
          emailSubject = `[Chamado #${ticket.ticket_number}] ${eventMessages[event_type]}`;
          const defaultContent = `
            <p>Olá <strong>${ticket.client.name}</strong>,</p>
            <p>${eventMessages[event_type]}</p>
            <div class="ticket-info">
              <p><strong>Chamado:</strong> #${ticket.ticket_number}</p>
              <p><strong>Título:</strong> ${ticket.title}</p>
              <p><strong>Status:</strong> <span class="status">${statusLabels[ticket.status] || ticket.status}</span></p>
              <p><strong>Prioridade:</strong> ${ticket.priority}</p>
            </div>
            ${comment ? `<div class="comment-box"><p><strong>Comentário:</strong></p><p>${escapeHtml(comment)}</p></div>` : ''}
            ${event_type === 'resolved' ? `
              <div style="background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center;">
                <p style="color: #166534; font-weight: 600; margin-bottom: 10px;">⭐ Avalie nosso atendimento</p>
                <a href="${portalUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
                  Avaliar e Encerrar Chamado
                </a>
              </div>
            ` : ''}
            <p>Acesse o portal do cliente para mais detalhes.</p>
          `;
          emailHtml = wrapInEmailLayout(defaultContent, emailSettings);
        }

        const { data: emailResult, error: emailError } = await supabase.functions.invoke("send-email-resend", {
          body: { to: ticket.client.email, subject: emailSubject, html: emailHtml },
        });
        results.email = emailError ? { error: emailError.message } : emailResult;
      } catch (e) {
        console.error("Email error:", e);
      }
    }

    // Send WhatsApp to requester contact
    const { data: evolutionSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .eq("is_active", true)
      .maybeSingle();

    const requesterContact = ticket.requester_contact;
    if (evolutionSettings?.is_active && requesterContact?.whatsapp && requesterContact?.notify_whatsapp !== false) {
      console.log(`[send-ticket-notification] Sending WhatsApp to requester: ${requesterContact.name}`);
      
      try {
        const whatsappMessage = `🎫 *Atualização do seu Chamado*\n\n` +
          `📋 *Chamado:* #${ticket.ticket_number}\n` +
          `📝 *Título:* ${ticket.title}\n` +
          `📊 *Status:* ${statusLabels[ticket.status] || ticket.status}\n\n` +
          `📢 ${eventMessages[event_type]}` +
          (comment ? `\n\n💬 *Comentário:* ${comment}` : '') +
          (event_type === 'resolved' ? `\n\n⭐ *Avalie o atendimento:*\n${portalUrl}` : '');

        const { data: waResult, error: waError } = await supabase.functions.invoke("send-whatsapp", {
          body: { to: requesterContact.whatsapp, message: whatsappMessage, userId: requesterContact.user_id, relatedType: "ticket", relatedId: ticket.id },
        });
        results.clientWhatsapp = waError ? { error: waError.message } : waResult;
      } catch (e) {
        console.error("[send-ticket-notification] Client WhatsApp error:", e);
        results.clientWhatsapp = { error: String(e) };
      }
    }

    // Send WhatsApp to staff users
    if (evolutionSettings?.is_active && notificationRules) {
      for (const rule of notificationRules) {
        const profile = rule.profiles as { notify_whatsapp?: boolean; whatsapp_number?: string; user_id?: string };
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
              body: { to: profile.whatsapp_number, message: whatsappMessage, user_id: profile.user_id, related_type: "ticket", related_id: ticket.id },
            });
            if (!results.whatsapp) results.whatsapp = [];
            (results.whatsapp as unknown[]).push(waError ? { error: waError.message } : waResult);
          } catch (e) {
            console.error("WhatsApp error:", e);
          }
        }
      }
    }

    // Send Telegram
    const { data: telegramSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "telegram")
      .eq("is_active", true)
      .maybeSingle();

    if (telegramSettings?.is_active && notificationRules) {
      for (const rule of notificationRules) {
        const profile = rule.profiles as { notify_telegram?: boolean; telegram_chat_id?: string; user_id?: string };
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
              body: { chat_id: profile.telegram_chat_id, message: telegramMessage, parse_mode: "HTML", user_id: profile.user_id, related_type: "ticket", related_id: ticket.id },
            });
            if (!results.telegram) results.telegram = [];
            (results.telegram as unknown[]).push(tgError ? { error: tgError.message } : tgResult);
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
