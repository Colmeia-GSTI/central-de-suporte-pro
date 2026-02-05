import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    device_id: string;
    level: "critical" | "warning" | "info";
    title: string;
    message: string | null;
    status: string;
    created_at: string;
  };
  schema: string;
}

interface NotificationRule {
  user_id: string;
  notify_on_critical: boolean;
  notify_on_warning: boolean;
  notify_on_info: boolean;
  notify_email: boolean;
  notify_push: boolean;
}

interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  notify_email: boolean;
  notify_whatsapp: boolean;
  notify_telegram: boolean;
  whatsapp_number: string | null;
  telegram_chat_id: string | null;
}

async function logMessage(
  supabase: any,
  userId: string,
  channel: "email" | "whatsapp" | "telegram",
  recipient: string,
  message: string,
  status: "pending" | "sent" | "delivered" | "read" | "failed",
  relatedType?: string,
  relatedId?: string,
  errorMessage?: string,
  externalMessageId?: string
) {
  try {
    const { error } = await supabase.from("message_logs").insert({
      user_id: userId,
      channel,
      recipient,
      message,
      status,
      related_type: relatedType || null,
      related_id: relatedId || null,
      error_message: errorMessage || null,
      external_message_id: externalMessageId || null,
      sent_at: status === "sent" || status === "delivered" ? new Date().toISOString() : null,
    });
    if (error) console.error("Error logging message:", error);
  } catch (e) {
    console.error("Failed to log message:", e);
  }
}

async function sendWhatsApp(
  supabase: any,
  userId: string,
  to: string,
  message: string,
  alertId: string
): Promise<boolean> {
  try {
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .maybeSingle();

    if (!settings?.is_active) {
      console.log("Evolution API not active");
      return false;
    }

    const config = settings.settings as {
      api_url: string;
      api_key: string;
      instance_name: string;
    };

    if (!config.api_url || !config.api_key || !config.instance_name) {
      console.log("Evolution API settings incomplete");
      return false;
    }

    const cleanNumber = to.replace(/\D/g, "");
    const evolutionUrl = `${config.api_url.replace(/\/$/, "")}/message/sendText/${config.instance_name}`;

    const response = await fetch(evolutionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.api_key,
      },
      body: JSON.stringify({ number: cleanNumber, text: message }),
    });

    const responseData = await response.json();
    const success = response.ok;
    const externalId = responseData?.key?.id || responseData?.messageId || null;

    await logMessage(
      supabase,
      userId,
      "whatsapp",
      cleanNumber,
      message,
      success ? "sent" : "failed",
      "monitoring_alert",
      alertId,
      success ? undefined : JSON.stringify(responseData),
      externalId
    );

    return success;
  } catch (error) {
    console.error("WhatsApp error:", error);
    await logMessage(
      supabase,
      userId,
      "whatsapp",
      to,
      message,
      "failed",
      "monitoring_alert",
      alertId,
      error instanceof Error ? error.message : "Unknown error"
    );
    return false;
  }
}

async function sendTelegram(
  supabase: any,
  userId: string,
  chatId: string,
  message: string,
  alertId: string
): Promise<boolean> {
  try {
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "telegram")
      .maybeSingle();

    if (!settings?.is_active) {
      console.log("Telegram not active");
      return false;
    }

    const config = settings.settings as { bot_token: string };
    if (!config.bot_token) {
      console.log("Telegram bot token not configured");
      return false;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    const responseData = await response.json();
    const success = response.ok && responseData.ok;
    const externalId = responseData?.result?.message_id?.toString() || null;

    await logMessage(
      supabase,
      userId,
      "telegram",
      chatId,
      message,
      success ? "sent" : "failed",
      "monitoring_alert",
      alertId,
      success ? undefined : JSON.stringify(responseData),
      externalId
    );

    return success;
  } catch (error) {
    console.error("Telegram error:", error);
    await logMessage(
      supabase,
      userId,
      "telegram",
      chatId,
      message,
      "failed",
      "monitoring_alert",
      alertId,
      error instanceof Error ? error.message : "Unknown error"
    );
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: AlertPayload = await req.json();
    console.log("Received alert notification payload:", JSON.stringify(payload));

    if (payload.type !== "INSERT" || payload.record.status !== "active") {
      console.log("Skipping non-INSERT or non-active alert");
      return new Response(
        JSON.stringify({ success: true, message: "Skipped" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const alert = payload.record;

    // Get device info
    const { data: device } = await supabase
      .from("monitored_devices")
      .select("*, clients(id, name)")
      .eq("id", alert.device_id)
      .single();

    const deviceName = device?.name || "Dispositivo desconhecido";
    const clientName = device?.clients?.name || "Cliente desconhecido";
    const clientId = device?.clients?.id;

    // Get notification rules for this client
    const { data: notificationRules } = await supabase
      .from("client_notification_rules")
      .select("user_id, notify_on_critical, notify_on_warning, notify_on_info, notify_email, notify_push")
      .eq("client_id", clientId);

    // Filter rules based on alert level
    const levelKey = `notify_on_${alert.level}` as keyof NotificationRule;
    const usersToNotify = (notificationRules || [])
      .filter((rule: NotificationRule) => rule[levelKey] === true)
      .map((rule: NotificationRule) => rule.user_id);

    // If no specific rules, fall back to all staff
    let targetUserIds: string[] = usersToNotify;
    if (targetUserIds.length === 0) {
      const { data: staffUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager", "technician"]);
      targetUserIds = (staffUsers || []).map((u: { user_id: string }) => u.user_id);
    }

    console.log(`Found ${targetUserIds.length} users to notify`);

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No users to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profiles with preferences
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, full_name, notify_email, notify_whatsapp, notify_telegram, whatsapp_number, telegram_chat_id")
      .in("user_id", targetUserIds);

    // Create in-app notifications
    const notifications = targetUserIds.map((userId) => ({
      user_id: userId,
      title: `Alerta ${alert.level.toUpperCase()}: ${deviceName}`,
      message: alert.title + (alert.message ? ` - ${alert.message}` : ""),
      type: "alert",
      related_type: "monitoring_alert",
      related_id: alert.id,
      is_read: false,
    }));

    const { error: notifError } = await supabase.from("notifications").insert(notifications);
    if (notifError) console.error("Error creating notifications:", notifError);
    else console.log(`Created ${notifications.length} in-app notifications`);

    // Prepare message content
    const levelLabels = { critical: "CRÍTICO", warning: "AVISO", info: "INFO" };
    const levelEmojis = { critical: "🔴", warning: "🟡", info: "🔵" };

    const textMessage = `${levelEmojis[alert.level]} *Alerta ${levelLabels[alert.level]}*

📍 *${alert.title}*
${alert.message ? `\n${alert.message}` : ""}

🖥️ Dispositivo: ${deviceName}
🏢 Cliente: ${clientName}
🕐 ${new Date(alert.created_at).toLocaleString("pt-BR")}`;

    const htmlMessage = `${levelEmojis[alert.level]} <b>Alerta ${levelLabels[alert.level]}</b>

📍 <b>${alert.title}</b>
${alert.message ? `\n${alert.message}` : ""}

🖥️ Dispositivo: ${deviceName}
🏢 Cliente: ${clientName}
🕐 ${new Date(alert.created_at).toLocaleString("pt-BR")}`;

    // Send WhatsApp and Telegram in parallel based on user preferences
    const notificationPromises: Promise<boolean>[] = [];
    
    for (const profile of (profiles || []) as UserProfile[]) {
      // WhatsApp
      if (profile.notify_whatsapp && profile.whatsapp_number) {
        console.log(`Queueing WhatsApp for ${profile.full_name}`);
        notificationPromises.push(sendWhatsApp(supabase, profile.user_id, profile.whatsapp_number, textMessage, alert.id));
      }

      // Telegram
      if (profile.notify_telegram && profile.telegram_chat_id) {
        console.log(`Queueing Telegram for ${profile.full_name}`);
        notificationPromises.push(sendTelegram(supabase, profile.user_id, profile.telegram_chat_id, htmlMessage, alert.id));
      }
    }
    
    // Execute all notifications in parallel
    if (notificationPromises.length > 0) {
      const results = await Promise.allSettled(notificationPromises);
      const successful = results.filter(r => r.status === "fulfilled" && r.value).length;
      console.log(`Sent ${successful}/${notificationPromises.length} notifications`);
    }

    // Only send email for critical and warning alerts
    if (alert.level === "info") {
      console.log("Skipping email for info-level alert");
      return new Response(
        JSON.stringify({ success: true, message: "Notifications sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if SMTP is configured
    const { data: smtpSettings } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "smtp")
      .single();

    if (!smtpSettings?.is_active) {
      console.log("SMTP not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, message: "Notifications sent (no SMTP)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = smtpSettings.settings as {
      host: string;
      port: number;
      username: string;
      password: string;
      from_email: string;
      from_name: string;
      use_tls: boolean;
    };

    if (!settings.host || !settings.username || !settings.password) {
      console.log("SMTP settings incomplete");
      return new Response(
        JSON.stringify({ success: true, message: "Notifications sent (SMTP incomplete)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get emails from users who have email notifications enabled
    const emails = (profiles || [])
      .filter((p: UserProfile) => p.notify_email !== false && p.email)
      .map((p: UserProfile) => p.email);

    if (emails.length === 0) {
      console.log("No users with email notifications enabled");
      return new Response(
        JSON.stringify({ success: true, message: "Notifications sent (no email recipients)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending email to ${emails.length} recipients`);

    const levelColors = { critical: "#dc2626", warning: "#f59e0b", info: "#3b82f6" };

    const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { background: ${levelColors[alert.level]}; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .info-row { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .label { font-weight: bold; color: #666; }
    .footer { padding: 20px; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Alerta ${levelLabels[alert.level]}</h1>
    </div>
    <div class="content">
      <h2>${alert.title}</h2>
      ${alert.message ? `<p>${alert.message}</p>` : ""}
      <div class="info-row"><span class="label">Dispositivo:</span> ${deviceName}</div>
      <div class="info-row"><span class="label">Cliente:</span> ${clientName}</div>
      <div class="info-row"><span class="label">IP:</span> ${device?.ip_address || "N/A"}</div>
      <div class="info-row"><span class="label">Data/Hora:</span> ${new Date(alert.created_at).toLocaleString("pt-BR")}</div>
    </div>
    <div class="footer">Este é um email automático do sistema de monitoramento.</div>
  </div>
</body>
</html>`;

    try {
      const client = new SMTPClient({
        connection: {
          hostname: settings.host,
          port: settings.port || 587,
          tls: settings.use_tls !== false,
          auth: { username: settings.username, password: settings.password },
        },
      });

      await client.send({
        from: `${settings.from_name || "Sistema de Monitoramento"} <${settings.from_email || settings.username}>`,
        to: emails,
        subject: `[${levelLabels[alert.level]}] ${alert.title} - ${deviceName}`,
        content: textMessage.replace(/\*/g, ""),
        html: htmlEmail,
      });

      await client.close();
      console.log("Email sent successfully");

      // Log email sends
      for (const profile of (profiles || []).filter((p: UserProfile) => p.notify_email !== false && p.email)) {
        await logMessage(
          supabase,
          profile.user_id,
          "email",
          profile.email,
          `[${levelLabels[alert.level]}] ${alert.title}`,
          "sent",
          "monitoring_alert",
          alert.id
        );
      }
    } catch (emailError) {
      console.error("Error sending email:", emailError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-alert-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
