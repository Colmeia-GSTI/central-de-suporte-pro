import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// FALHA-22: Edge Function para notificações de violação de SLA
// Deve ser agendada via cron (a cada 5-10 minutos) no Supabase Dashboard

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Active statuses that can breach SLA
const ACTIVE_STATUSES = ["open", "in_progress", "waiting", "no_contact"];

// Warning window before breach (minutes)
const WARNING_MINUTES = 30;

// Minimum gap between repeated notifications for the same ticket (minutes)
const NOTIFICATION_COOLDOWN_MINUTES = 60;

interface TicketRow {
  id: string;
  ticket_number: number;
  title: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  sla_deadline: string;
  clients: { name: string } | null;
}

interface ProfileRow {
  user_id: string;
  full_name: string;
  email: string | null;
  notify_email: boolean;
  whatsapp_number: string | null;
  notify_whatsapp: boolean;
  notify_telegram: boolean;
  telegram_chat_id: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_MINUTES * 60 * 1000);

    console.log(`[notify-sla-breach] Running at ${now.toISOString()}`);
    console.log(`[notify-sla-breach] Warning window: tickets with sla_deadline <= ${warningCutoff.toISOString()}`);

    // Fetch active tickets where sla_deadline is within the warning window or already breached
    const { data: ticketsData, error: ticketsError } = await supabase
      .from("tickets")
      .select(`
        id,
        ticket_number,
        title,
        priority,
        status,
        assigned_to,
        sla_deadline,
        clients(name)
      `)
      .in("status", ACTIVE_STATUSES)
      .not("sla_deadline", "is", null)
      .lte("sla_deadline", warningCutoff.toISOString())
      .order("sla_deadline", { ascending: true });

    if (ticketsError) {
      console.error("[notify-sla-breach] Error fetching tickets:", ticketsError);
      throw ticketsError;
    }

    const tickets = (ticketsData || []) as TicketRow[];
    console.log(`[notify-sla-breach] Found ${tickets.length} ticket(s) at risk`);

    if (tickets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum chamado em risco de SLA", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results = {
      warnings: 0,
      breaches: 0,
      notificationsSent: [] as string[],
      skipped: 0,
    };

    for (const ticket of tickets) {
      const slaDeadline = new Date(ticket.sla_deadline);
      const isBreached = slaDeadline <= now;
      const minutesRemaining = Math.round((slaDeadline.getTime() - now.getTime()) / 60000);

      const notifType = isBreached ? "sla_breach" : "sla_warning";
      const urgencyLabel = isBreached
        ? `violado há ${Math.abs(minutesRemaining)} min`
        : `expira em ${minutesRemaining} min`;

      // Check cooldown: skip if a notification of the same type was sent recently
      const cooldownCutoff = new Date(
        now.getTime() - NOTIFICATION_COOLDOWN_MINUTES * 60 * 1000
      ).toISOString();

      const notifyUserId = ticket.assigned_to;

      if (notifyUserId) {
        const { data: recentNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("related_id", ticket.id)
          .eq("type", notifType)
          .gte("created_at", cooldownCutoff)
          .limit(1);

        if (recentNotif?.length) {
          console.log(`[notify-sla-breach] Skipping #${ticket.ticket_number} - cooldown active`);
          results.skipped++;
          continue;
        }
      }

      const clientName = ticket.clients?.name || "Cliente";
      const title = isBreached
        ? `🚨 SLA Violado: #${ticket.ticket_number}`
        : `⏰ SLA em Risco: #${ticket.ticket_number}`;
      const message = isBreached
        ? `O SLA do chamado #${ticket.ticket_number} - "${ticket.title}" (${clientName}) foi violado (${urgencyLabel}).`
        : `O SLA do chamado #${ticket.ticket_number} - "${ticket.title}" (${clientName}) ${urgencyLabel}. Ação necessária!`;

      // 1. Notify assigned technician (if any)
      if (notifyUserId) {
        // In-app notification
        await supabase.from("notifications").insert([{
          user_id: notifyUserId,
          title,
          message,
          type: notifType,
          related_type: "ticket",
          related_id: ticket.id,
          is_read: false,
        }]);

        // Push notification
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: notifyUserId,
              title,
              body: message,
              url: `/tickets`,
            },
          });
        } catch (e) {
          console.log(`[notify-sla-breach] Push error (non-fatal): ${e}`);
        }

        // Fetch profile for additional channels
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, notify_email, whatsapp_number, notify_whatsapp, notify_telegram, telegram_chat_id")
          .eq("user_id", notifyUserId)
          .single();

        const profile = profileData as ProfileRow | null;

        if (profile) {
          // Email for breaches or last 10 minutes
          if ((isBreached || minutesRemaining <= 10) && profile.notify_email && profile.email) {
            try {
              await supabase.functions.invoke("send-email-smtp", {
                body: {
                  to: profile.email,
                  subject: title,
                  html: `
                    <h2>${title}</h2>
                    <p>${message}</p>
                    <table style="border-collapse:collapse;margin-top:12px">
                      <tr><td style="padding:4px 8px;font-weight:bold">Chamado</td><td style="padding:4px 8px">#${ticket.ticket_number}</td></tr>
                      <tr><td style="padding:4px 8px;font-weight:bold">Título</td><td style="padding:4px 8px">${ticket.title}</td></tr>
                      <tr><td style="padding:4px 8px;font-weight:bold">Cliente</td><td style="padding:4px 8px">${clientName}</td></tr>
                      <tr><td style="padding:4px 8px;font-weight:bold">Prioridade</td><td style="padding:4px 8px">${ticket.priority}</td></tr>
                      <tr><td style="padding:4px 8px;font-weight:bold">Prazo SLA</td><td style="padding:4px 8px">${slaDeadline.toLocaleString("pt-BR")}</td></tr>
                      <tr><td style="padding:4px 8px;font-weight:bold">Situação</td><td style="padding:4px 8px;color:${isBreached ? "red" : "orange"}">${urgencyLabel.toUpperCase()}</td></tr>
                    </table>
                  `,
                },
              });
            } catch (e) {
              console.log(`[notify-sla-breach] Email error (non-fatal): ${e}`);
            }
          }

          // WhatsApp
          if (profile.notify_whatsapp && profile.whatsapp_number) {
            try {
              await supabase.functions.invoke("send-whatsapp", {
                body: {
                  to: profile.whatsapp_number,
                  message: `${title}\n${message}`,
                },
              });
            } catch (e) {
              console.log(`[notify-sla-breach] WhatsApp error (non-fatal): ${e}`);
            }
          }

          // Telegram
          if (profile.notify_telegram && profile.telegram_chat_id) {
            try {
              await supabase.functions.invoke("send-telegram", {
                body: {
                  chatId: profile.telegram_chat_id,
                  message: `${title}\n\n${message}`,
                  parseMode: "Markdown",
                },
              });
            } catch (e) {
              console.log(`[notify-sla-breach] Telegram error (non-fatal): ${e}`);
            }
          }
        }

        results.notificationsSent.push(
          `${notifType}: #${ticket.ticket_number} → ${profile?.full_name || notifyUserId}`
        );
      }

      // 2. Also notify managers for breached tickets with high/critical priority
      if (isBreached && (ticket.priority === "high" || ticket.priority === "critical")) {
        const { data: managersData } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "manager"]);

        const managerIds = ((managersData || []) as { user_id: string }[])
          .map((m) => m.user_id)
          .filter((id) => id !== notifyUserId); // don't double-notify if manager is also assignee

        if (managerIds.length > 0) {
          const managerNotifs = managerIds.map((managerId) => ({
            user_id: managerId,
            title: `🚨 SLA Crítico: #${ticket.ticket_number}`,
            message: `Chamado #${ticket.ticket_number} (prioridade ${ticket.priority}) de ${clientName} violou o SLA. Técnico: ${notifyUserId ? "atribuído" : "não atribuído"}.`,
            type: "sla_breach",
            related_type: "ticket",
            related_id: ticket.id,
            is_read: false,
          }));

          await supabase.from("notifications").insert(managerNotifs);
        }
      }

      if (isBreached) {
        results.breaches++;
      } else {
        results.warnings++;
      }
    }

    console.log("[notify-sla-breach] Done:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Violações: ${results.breaches}, Avisos: ${results.warnings}, Pulados: ${results.skipped}`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[notify-sla-breach] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
