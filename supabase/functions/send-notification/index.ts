import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Unified notification request interface
interface NotificationRequest {
  channels: ("email" | "whatsapp" | "telegram")[];
  // Email fields
  email_to?: string | string[];
  email_subject?: string;
  email_html?: string;
  email_text?: string;
  // WhatsApp fields
  whatsapp_to?: string;
  whatsapp_message?: string;
  // Telegram fields
  telegram_chat_id?: string;
  telegram_message?: string;
  telegram_parse_mode?: string;
  // Common fields
  user_id?: string;
  related_type?: string;
  related_id?: string;
}

interface NotificationResult {
  channel: string;
  success: boolean;
  error?: string;
  message_id?: string;
}

interface IntegrationRow {
  integration_type: string;
  settings: Record<string, unknown>;
  is_active: boolean;
}

// Fetch all integration settings in one query
// deno-lint-ignore no-explicit-any
async function getIntegrationSettings(supabase: SupabaseClient<any, any, any>) {
  const { data, error } = await supabase
    .from("integration_settings")
    .select("integration_type, settings, is_active")
    .in("integration_type", ["smtp", "evolution_api", "telegram"]);

  if (error) {
    console.error("Error fetching integration settings:", error);
    return {};
  }

  const settings: Record<string, { settings: Record<string, unknown>; is_active: boolean }> = {};
  for (const row of (data || []) as IntegrationRow[]) {
    settings[row.integration_type] = {
      settings: row.settings,
      is_active: row.is_active,
    };
  }
  return settings;
}

// Validate email address
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Send email via SMTP
async function sendEmail(
  settings: {
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    use_tls: boolean;
  },
  to: string | string[],
  subject: string,
  html: string,
  text?: string
): Promise<NotificationResult> {
  try {
    const emails = Array.isArray(to) ? to : [to];

    // Validate all emails before sending
    for (const email of emails) {
      if (!validateEmail(email)) {
        return { channel: "email", success: false, error: `Email inválido: ${email}` };
      }
    }

    const client = new SMTPClient({
      connection: {
        hostname: settings.host,
        port: settings.port || 587,
        tls: settings.port === 465 || settings.use_tls !== false,
        auth: {
          username: settings.username,
          password: settings.password,
        },
      },
    });

    await client.send({
      from: `${settings.from_name || "Sistema"} <${settings.from_email || settings.username}>`,
      to: emails,
      subject,
      content: text || html.replace(/<[^>]*>/g, ""),
      html,
    });

    await client.close();
    return { channel: "email", success: true };
  } catch (error) {
    console.error("Email send error:", error);
    return { channel: "email", success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Send WhatsApp via Evolution API
async function sendWhatsApp(
  settings: { api_url: string; api_key: string; instance_name: string },
  to: string,
  message: string,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId?: string,
  relatedType?: string,
  relatedId?: string
): Promise<NotificationResult> {
  try {
    const cleanNumber = to.replace(/\D/g, "");
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      return { channel: "whatsapp", success: false, error: "Número inválido" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const evolutionUrl = `${settings.api_url.replace(/\/$/, "")}/message/sendText/${settings.instance_name}`;

    const response = await fetch(evolutionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: settings.api_key,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: message.slice(0, 4096),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseData = await response.json();
    const externalId = responseData?.key?.id || responseData?.messageId || null;

    // Log message if userId provided
    if (userId) {
      await supabase.from("message_logs").insert({
        user_id: userId,
        channel: "whatsapp",
        recipient: cleanNumber,
        message: message.slice(0, 500),
        status: response.ok ? "sent" : "failed",
        related_type: relatedType || null,
        related_id: relatedId || null,
        error_message: response.ok ? null : "Falha no envio",
        external_message_id: externalId,
        sent_at: response.ok ? new Date().toISOString() : null,
      });
    }

    if (!response.ok) {
      return { channel: "whatsapp", success: false, error: "Falha no envio" };
    }

    return { channel: "whatsapp", success: true, message_id: externalId };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return { channel: "whatsapp", success: false, error: isTimeout ? "Timeout" : "Erro interno" };
  }
}

// Send Telegram message
async function sendTelegram(
  settings: { bot_token: string; default_chat_id: string },
  chatId: string,
  message: string,
  parseMode: string = "Markdown"
): Promise<NotificationResult> {
  try {
    const targetChatId = chatId || settings.default_chat_id;
    if (!targetChatId) {
      return { channel: "telegram", success: false, error: "Chat ID não configurado" };
    }

    const telegramUrl = `https://api.telegram.org/bot${settings.bot_token}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: parseMode,
      }),
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.ok) {
      return { channel: "telegram", success: false, error: responseData.description || "Erro no envio" };
    }

    return { channel: "telegram", success: true, message_id: responseData.result?.message_id?.toString() };
  } catch (error) {
    return { channel: "telegram", success: false, error: error instanceof Error ? error.message : "Erro interno" };
  }
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

    const request: NotificationRequest = await req.json();
    const { channels } = request;

    if (!channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ error: "Pelo menos um canal deve ser especificado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all integration settings in one query
    const integrations = await getIntegrationSettings(supabase);
    const results: NotificationResult[] = [];

    // Process channels in parallel
    const promises: Promise<NotificationResult>[] = [];

    for (const channel of channels) {
      switch (channel) {
        case "email": {
          const smtp = integrations["smtp"];
          if (!smtp?.is_active) {
            results.push({ channel: "email", success: false, error: "SMTP não configurado ou inativo" });
            break;
          }
          const smtpSettings = smtp.settings as {
            host: string;
            port: number;
            username: string;
            password: string;
            from_email: string;
            from_name: string;
            use_tls: boolean;
          };
          if (!smtpSettings.host || !smtpSettings.username || !smtpSettings.password) {
            results.push({ channel: "email", success: false, error: "Configuração SMTP incompleta" });
            break;
          }
          if (!request.email_to || !request.email_subject || !request.email_html) {
            results.push({ channel: "email", success: false, error: "Campos de email incompletos" });
            break;
          }
          promises.push(
            sendEmail(smtpSettings, request.email_to, request.email_subject, request.email_html, request.email_text)
          );
          break;
        }

        case "whatsapp": {
          const evolution = integrations["evolution_api"];
          if (!evolution?.is_active) {
            results.push({ channel: "whatsapp", success: false, error: "WhatsApp não configurado ou inativo" });
            break;
          }
          const waSettings = evolution.settings as {
            api_url: string;
            api_key: string;
            instance_name: string;
          };
          if (!waSettings.api_url || !waSettings.api_key || !waSettings.instance_name) {
            results.push({ channel: "whatsapp", success: false, error: "Configuração Evolution API incompleta" });
            break;
          }
          if (!request.whatsapp_to || !request.whatsapp_message) {
            results.push({ channel: "whatsapp", success: false, error: "Campos de WhatsApp incompletos" });
            break;
          }
          promises.push(
            sendWhatsApp(
              waSettings,
              request.whatsapp_to,
              request.whatsapp_message,
              supabase,
              request.user_id,
              request.related_type,
              request.related_id
            )
          );
          break;
        }

        case "telegram": {
          const telegram = integrations["telegram"];
          if (!telegram?.is_active) {
            results.push({ channel: "telegram", success: false, error: "Telegram não configurado ou inativo" });
            break;
          }
          const tgSettings = telegram.settings as {
            bot_token: string;
            default_chat_id: string;
          };
          if (!tgSettings.bot_token) {
            results.push({ channel: "telegram", success: false, error: "Bot token não configurado" });
            break;
          }
          if (!request.telegram_message) {
            results.push({ channel: "telegram", success: false, error: "Mensagem Telegram não fornecida" });
            break;
          }
          promises.push(
            sendTelegram(
              tgSettings,
              request.telegram_chat_id || "",
              request.telegram_message,
              request.telegram_parse_mode
            )
          );
          break;
        }

        default:
          results.push({ channel, success: false, error: "Canal não suportado" });
      }
    }

    // Wait for all parallel operations using Promise.allSettled for better error handling
    if (promises.length > 0) {
      const promiseResults = await Promise.allSettled(promises);
      for (const result of promiseResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          // Handle rejected promises
          console.error("Promise rejected:", result.reason);
          // Add a failure result for the rejected promise
          const channel = results[results.length] ? results[results.length].channel : "unknown";
          results.push({
            channel,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : "Unknown error",
          });
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    console.log(`[send-notification] Processed ${channels.length} channels: ${anySuccess ? "success" : "failed"}`);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        partial_success: !allSuccess && anySuccess,
        results,
      }),
      {
        status: allSuccess ? 200 : anySuccess ? 207 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});