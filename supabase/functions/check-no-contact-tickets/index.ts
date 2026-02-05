import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TicketData {
  id: string;
  status: string;
  assigned_to: string | null;
  title: string;
  ticket_number: number;
  updated_at: string;
}

interface PauseData {
  id: string;
  ticket_id: string;
  auto_resume_at: string;
  tickets: TicketData;
}

interface ProfileData {
  user_id: string;
  full_name: string;
  email: string;
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

    // Verificar configuração de intervalo
    const { data: config } = await supabase
      .from("integration_settings")
      .select("is_active, settings")
      .eq("integration_type", "no_contact_check")
      .maybeSingle();

    // Se inativo, retornar sem executar
    if (config && !config.is_active) {
      console.log("No-contact check is disabled, skipping...");
      return new Response(
        JSON.stringify({ success: true, message: "Verificação desativada", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Verificar intervalo configurado
    const settings = config?.settings as { interval_minutes?: number; last_run_at?: string } | null;
    const intervalMinutes = settings?.interval_minutes || 30;
    const lastRunAt = settings?.last_run_at ? new Date(settings.last_run_at) : null;

    if (lastRunAt) {
      const minutesSinceLastRun = (Date.now() - lastRunAt.getTime()) / (1000 * 60);
      if (minutesSinceLastRun < intervalMinutes) {
        console.log(`Skipping: Only ${minutesSinceLastRun.toFixed(1)} minutes since last run (interval: ${intervalMinutes} min)`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Próxima execução em ${Math.ceil(intervalMinutes - minutesSinceLastRun)} minutos`,
            skipped: true 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    console.log("Checking tickets with 'no_contact' status...");

    const results = {
      autoResumed: 0,
      remindersFor24h: 0,
      remindersFor48h: 0,
      notificationsSent: [] as string[],
    };

    // 1. Buscar pausas que estão ativas e passaram do horário de auto_resume_at
    const { data: pausesToResume, error: pauseError } = await supabase
      .from("ticket_pauses")
      .select(`
        id,
        ticket_id,
        auto_resume_at,
        tickets!inner(
          id,
          status,
          assigned_to,
          title,
          ticket_number
        )
      `)
      .is("resumed_at", null)
      .lte("auto_resume_at", new Date().toISOString())
      .eq("pause_type", "no_contact");

    if (pauseError) {
      console.error("Error fetching pauses:", pauseError);
      throw pauseError;
    }

    console.log(`Found ${pausesToResume?.length || 0} tickets to auto-resume`);

    for (const pause of (pausesToResume || []) as unknown as PauseData[]) {
      const ticket = pause.tickets;
      if (!ticket || ticket.status !== "no_contact") continue;

      // Retomar automaticamente a pausa
      const { error: resumeError } = await supabase
        .from("ticket_pauses")
        .update({ resumed_at: new Date().toISOString() })
        .eq("id", pause.id);

      if (resumeError) {
        console.error(`Error resuming pause ${pause.id}:`, resumeError);
        continue;
      }

      // Atualizar o ticket para "open"
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ status: "open" })
        .eq("id", ticket.id);

      if (ticketError) {
        console.error(`Error updating ticket ${ticket.id}:`, ticketError);
        continue;
      }

      // Registrar histórico
      await supabase.from("ticket_history").insert([{
        ticket_id: ticket.id,
        user_id: null,
        old_status: "no_contact",
        new_status: "open",
        comment: "Reagendado automaticamente para nova tentativa de contato",
      }]);

      // Criar notificação para o técnico
      if (ticket.assigned_to) {
        await supabase.from("notifications").insert([{
          user_id: ticket.assigned_to,
          title: "🔔 Nova tentativa de contato",
          message: `O chamado #${ticket.ticket_number} - "${ticket.title}" foi reagendado. Tente contato com o cliente.`,
          type: "reminder",
          related_type: "ticket",
          related_id: ticket.id,
        }]);

        // Enviar notificação push
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: ticket.assigned_to,
              title: "Nova tentativa de contato",
              body: `Chamado #${ticket.ticket_number}: ${ticket.title}`,
              url: `/tickets`,
            },
          });
        } catch (e) {
          console.log("Push notification error (non-fatal):", e);
        }

        results.autoResumed++;
        results.notificationsSent.push(`auto-resume: #${ticket.ticket_number}`);
      }
    }

    // 2. Tickets em "no_contact" há mais de 24h - primeiro lembrete
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: ticketsNoContact, error: ticketsError } = await supabase
      .from("tickets")
      .select(`id, title, ticket_number, assigned_to, updated_at`)
      .eq("status", "no_contact")
      .lt("updated_at", twentyFourHoursAgo);

    if (ticketsError) {
      console.error("Error fetching no_contact tickets:", ticketsError);
    }

    console.log(`Found ${ticketsNoContact?.length || 0} tickets in no_contact for 24h+`);

    for (const ticket of (ticketsNoContact || []) as TicketData[]) {
      if (!ticket.assigned_to) continue;

      const isOver48h = new Date(ticket.updated_at) < new Date(fortyEightHoursAgo);
      const reminderType = isOver48h ? "48h" : "24h";

      // Verificar se já existe notificação recente (12h) para evitar spam
      const { data: recentNotif } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", ticket.assigned_to)
        .eq("related_id", ticket.id)
        .eq("type", "reminder")
        .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (recentNotif?.length) {
        console.log(`Skipping ticket ${ticket.id} - recent notification exists`);
        continue;
      }

      // Criar notificação
      const title = isOver48h 
        ? "⚠️ Chamado sem contato há 48h+"
        : "📞 Lembrete: Chamado sem contato";
      
      const message = isOver48h
        ? `O chamado #${ticket.ticket_number} - "${ticket.title}" está sem contato há mais de 48 horas. Ação urgente necessária!`
        : `O chamado #${ticket.ticket_number} - "${ticket.title}" está aguardando contato há mais de 24 horas.`;

      await supabase.from("notifications").insert([{
        user_id: ticket.assigned_to,
        title,
        message,
        type: "reminder",
        related_type: "ticket",
        related_id: ticket.id,
      }]);

      // Enviar push
      try {
        await supabase.functions.invoke("send-push-notification", {
          body: {
            userId: ticket.assigned_to,
            title: isOver48h ? "⚠️ Chamado urgente" : "📞 Lembrete de contato",
            body: `Chamado #${ticket.ticket_number}: ${ticket.title}`,
            url: `/tickets`,
          },
        });
      } catch (e) {
        console.log("Push notification error (non-fatal):", e);
      }

      // Buscar perfil do técnico para notificações adicionais
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, notify_email, whatsapp_number, notify_whatsapp, notify_telegram, telegram_chat_id")
        .eq("user_id", ticket.assigned_to)
        .single();

      if (profile) {
        // Email para casos urgentes (48h+)
        if (isOver48h && profile.notify_email && profile.email) {
          try {
            await supabase.functions.invoke("send-email-smtp", {
              body: {
                to: profile.email,
                subject: `⚠️ Chamado #${ticket.ticket_number} sem contato há 48h+`,
                html: `
                  <h2>Atenção: Chamado requer ação urgente</h2>
                  <p>O chamado <strong>#${ticket.ticket_number} - ${ticket.title}</strong> está sem contato com o cliente há mais de 48 horas.</p>
                  <p>Por favor, verifique a situação e tente contato ou atualize o status do chamado.</p>
                `,
              },
            });
          } catch (e) {
            console.log("Email notification error (non-fatal):", e);
          }
        }

        // WhatsApp
        if (profile.notify_whatsapp && profile.whatsapp_number) {
          try {
            await supabase.functions.invoke("send-whatsapp", {
              body: {
                to: profile.whatsapp_number,
                message: `📞 Lembrete: Chamado #${ticket.ticket_number} está ${isOver48h ? "há 48h+ " : ""}sem contato. Título: ${ticket.title}`,
              },
            });
          } catch (e) {
            console.log("WhatsApp notification error (non-fatal):", e);
          }
        }

        // Telegram
        if (profile.notify_telegram && profile.telegram_chat_id) {
          try {
            await supabase.functions.invoke("send-telegram", {
              body: {
                chatId: profile.telegram_chat_id,
                message: `📞 Lembrete: Chamado #${ticket.ticket_number} está ${isOver48h ? "há 48h+ " : ""}sem contato.\n\n*${ticket.title}*`,
                parseMode: "Markdown",
              },
            });
          } catch (e) {
            console.log("Telegram notification error (non-fatal):", e);
          }
        }
      }

      if (isOver48h) {
        results.remindersFor48h++;
      } else {
        results.remindersFor24h++;
      }
      results.notificationsSent.push(`${reminderType}: #${ticket.ticket_number}`);
    }

    console.log("Check complete:", results);

    // Atualizar last_run_at
    await supabase
      .from("integration_settings")
      .update({
        settings: {
          interval_minutes: settings?.interval_minutes || 30,
          last_run_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("integration_type", "no_contact_check");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-resumed: ${results.autoResumed}, 24h reminders: ${results.remindersFor24h}, 48h reminders: ${results.remindersFor48h}`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-no-contact-tickets:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
