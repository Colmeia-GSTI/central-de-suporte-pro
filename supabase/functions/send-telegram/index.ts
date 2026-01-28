import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramRequest {
  chat_id: string;
  message: string;
  parse_mode?: string;
}

interface TelegramSettings {
  bot_token: string;
  default_chat_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Telegram settings
    const { data: integrationData, error: integrationError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "telegram")
      .maybeSingle();

    if (integrationError) {
      console.error("Error fetching Telegram settings:", integrationError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar configurações do Telegram" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integrationData || !integrationData.is_active) {
      console.log("Telegram integration is not active");
      return new Response(
        JSON.stringify({ error: "Integração Telegram não está ativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = integrationData.settings as unknown as TelegramSettings;

    if (!settings.bot_token) {
      console.log("Telegram bot token not configured");
      return new Response(
        JSON.stringify({ error: "Token do Bot Telegram não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chat_id, message, parse_mode = "Markdown" }: TelegramRequest = await req.json();

    const targetChatId = chat_id || settings.default_chat_id;

    if (!targetChatId || !message) {
      return new Response(
        JSON.stringify({ error: "Campos 'chat_id' e 'message' são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending Telegram message to chat ${targetChatId}`);

    // Telegram Bot API endpoint
    const telegramUrl = `https://api.telegram.org/bot${settings.bot_token}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: parse_mode,
      }),
    });

    const responseData = await response.json();
    console.log("Telegram API response:", JSON.stringify(responseData));

    if (!response.ok || !responseData.ok) {
      console.error("Telegram API error:", responseData);
      return new Response(
        JSON.stringify({ error: responseData.description || "Erro ao enviar mensagem Telegram" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Telegram message sent successfully");

    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-telegram function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
