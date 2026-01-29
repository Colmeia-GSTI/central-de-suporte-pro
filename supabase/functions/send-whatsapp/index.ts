import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  to: string;
  message: string;
  userId?: string;
  relatedType?: string;
  relatedId?: string;
}

interface EvolutionSettings {
  api_url: string;
  api_key: string;
  instance_name: string;
}

const TOKEN_TIMEOUT_MS = 5000; // Reduzido de 15000ms
const MAX_RETRIES = 2;

// Timeout wrapper for fetch
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = TOKEN_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Evolution API settings
    const { data: integrationData, error: integrationError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .maybeSingle();

    if (integrationError) {
      console.error("Error fetching Evolution API settings");
      return new Response(
        JSON.stringify({ error: "Erro ao buscar configurações da Evolution API" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integrationData || !integrationData.is_active) {
      console.log("Evolution API integration is not active");
      return new Response(
        JSON.stringify({ error: "Integração Evolution API não está ativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = integrationData.settings as unknown as EvolutionSettings;

    if (!settings.api_url || !settings.api_key || !settings.instance_name) {
      console.log("Evolution API settings incomplete");
      return new Response(
        JSON.stringify({ error: "Configurações da Evolution API incompletas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, message, userId, relatedType, relatedId }: WhatsAppRequest = await req.json();

    // Input validation
    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: "Campos 'to' e 'message' são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone number format (only digits, 10-15 chars)
    const cleanNumber = to.replace(/\D/g, "");
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      return new Response(
        JSON.stringify({ error: "Número de telefone inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit message length
    const sanitizedMessage = message.slice(0, 4096);

    // Evolution API endpoint for sending text messages
    // Handle case where user may have included manager path in api_url
    let baseUrl = settings.api_url.replace(/\/$/, "");
    // Remove manager/instance path if present
    baseUrl = baseUrl.replace(/\/manager\/instance\/[a-f0-9-]+$/i, "");
    const evolutionUrl = `${baseUrl}/message/sendText/${encodeURIComponent(settings.instance_name)}`;

    const response = await fetchWithTimeout(evolutionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": settings.api_key,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: sanitizedMessage,
      }),
    });

    const responseData = await response.json();
    
    // Safe logging - only log success/failure and message ID
    const externalId = responseData?.key?.id || responseData?.messageId || null;

    // Log message if userId provided
    if (userId) {
      await supabase.from("message_logs").insert({
        user_id: userId,
        channel: "whatsapp",
        recipient: cleanNumber,
        message: sanitizedMessage.slice(0, 500), // Truncate for logging
        status: response.ok ? "sent" : "failed",
        related_type: relatedType || null,
        related_id: relatedId || null,
        error_message: response.ok ? null : "Falha no envio",
        external_message_id: externalId,
        sent_at: response.ok ? new Date().toISOString() : null,
      });
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao enviar mensagem WhatsApp" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: externalId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    console.error("Error in send-whatsapp function:", isTimeout ? "Request timeout" : "Internal error");
    return new Response(
      JSON.stringify({ error: isTimeout ? "Timeout ao enviar mensagem" : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});