import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking for alerts to escalate...");

    // Get escalation settings
    const { data: escalationSettings, error: settingsError } = await supabase
      .from("alert_escalation_settings")
      .select("id, client_id, escalation_minutes, escalate_to_role, is_active")
      .eq("is_active", true);

    if (settingsError) {
      console.error("Error fetching escalation settings:", settingsError);
      throw settingsError;
    }

    // Get default escalation (no client_id means global default)
    const defaultSettings = escalationSettings?.find((s) => !s.client_id) || {
      escalation_minutes: 30,
      escalate_to_role: "manager",
    };

    // Get active, unacknowledged, non-escalated alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("monitoring_alerts")
      .select(`
        *,
        monitored_devices!inner(
          name,
          client_id,
          clients(name)
        )
      `)
      .eq("status", "active")
      .is("escalated_at", null)
      .in("level", ["critical", "warning"]);

    if (alertsError) {
      console.error("Error fetching alerts:", alertsError);
      throw alertsError;
    }

    console.log(`Found ${alerts?.length || 0} active alerts to check`);

    const now = new Date();
    const alertsToEscalate: typeof alerts = [];

    for (const alert of alerts || []) {
      const clientId = alert.monitored_devices?.client_id;
      const clientSettings = escalationSettings?.find((s) => s.client_id === clientId);
      const settings = clientSettings || defaultSettings;

      const alertAge = (now.getTime() - new Date(alert.created_at).getTime()) / 1000 / 60;

      if (alertAge >= settings.escalation_minutes) {
        alertsToEscalate.push({ ...alert, escalateToRole: settings.escalate_to_role });
      }
    }

    if (alertsToEscalate.length === 0) {
      console.log("No alerts need escalation");
      return new Response(
        JSON.stringify({ success: true, message: "No alerts to escalate" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Escalating ${alertsToEscalate.length} alerts`);

    // Get managers to notify
    const { data: managers, error: managersError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    if (managersError) {
      console.error("Error fetching managers:", managersError);
      throw managersError;
    }

    const managerIds = managers?.map((m) => m.user_id) || [];

    // Get manager emails
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, full_name")
      .in("user_id", managerIds);

    // Create escalation notifications
    for (const alert of alertsToEscalate) {
      const deviceName = alert.monitored_devices?.name || "Dispositivo";
      const clientName = alert.monitored_devices?.clients?.name || "Cliente";

      // Update alert as escalated
      await supabase
        .from("monitoring_alerts")
        .update({ escalated_at: now.toISOString() })
        .eq("id", alert.id);

      // Create notifications for managers
      const notifications = managerIds.map((managerId) => ({
        user_id: managerId,
        title: `⚠️ ESCALAÇÃO: ${alert.title}`,
        message: `Alerta não reconhecido há mais de ${Math.floor(
          (now.getTime() - new Date(alert.created_at).getTime()) / 1000 / 60
        )} minutos. Dispositivo: ${deviceName} (${clientName})`,
        type: "escalation",
        related_type: "monitoring_alert",
        related_id: alert.id,
        is_read: false,
      }));

      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Error creating escalation notifications:", notifError);
      }
    }

    // Try to send email notifications
    const { data: smtpSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "smtp")
      .single();

    if (smtpSettings?.is_active) {
      const settings = smtpSettings.settings as {
        host: string;
        port: number;
        username: string;
        password: string;
        from_email: string;
        from_name: string;
        use_tls: boolean;
      };

      if (settings.host && settings.username && settings.password) {
        try {
          const client = new SMTPClient({
            connection: {
              hostname: settings.host,
              port: settings.port || 587,
              tls: settings.use_tls !== false,
              auth: {
                username: settings.username,
                password: settings.password,
              },
            },
          });

          const emails = profiles?.map((p) => p.email).filter(Boolean) || [];

          if (emails.length > 0) {
            const alertSummary = alertsToEscalate
              .map((a) => `- ${a.title} (${a.monitored_devices?.name})`)
              .join("\n");

            await client.send({
              from: `${settings.from_name || "Sistema"} <${settings.from_email || settings.username}>`,
              to: emails,
              subject: `🚨 ESCALAÇÃO: ${alertsToEscalate.length} alerta(s) não reconhecido(s)`,
              content: `Os seguintes alertas não foram reconhecidos e estão sendo escalados:\n\n${alertSummary}`,
              html: `
                <h1>🚨 Alertas Escalados</h1>
                <p>Os seguintes alertas não foram reconhecidos no tempo configurado:</p>
                <ul>
                  ${alertsToEscalate
                    .map(
                      (a) =>
                        `<li><strong>${a.title}</strong> - ${a.monitored_devices?.name} (${a.monitored_devices?.clients?.name})</li>`
                    )
                    .join("")}
                </ul>
                <p>Por favor, verifique imediatamente.</p>
              `,
            });

            await client.close();
            console.log("Escalation emails sent");
          }
        } catch (emailError) {
          console.error("Error sending escalation emails:", emailError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Escalated ${alertsToEscalate.length} alerts` 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in escalate-alerts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
