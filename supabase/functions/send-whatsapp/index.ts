import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

// Rate limiting: 10 req/seg por phone
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 1000;

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetTime) rateLimitMap.delete(key);
  }
}, 60_000);

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
    // Rate limit by IP before processing
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const { allowed } = checkRateLimit(`send-whatsapp:${clientIp}`);
    if (!allowed) {
      console.warn(`[send-whatsapp] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Muitas requisições. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "1" } }
      );
    }
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
    
    console.log(`[send-whatsapp] Sending to Evolution API: ${evolutionUrl}`);

    // Retry logic for Evolution API call
    let response: Response | null = null;
    let responseData: any = null;
    let lastError = "";
    const maxAttempts = 3;
    const retryDelaysMs = [0, 3000, 10000];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        console.log(`[send-whatsapp] Retry attempt ${attempt + 1}/${maxAttempts}`);
        await new Promise(r => setTimeout(r, retryDelaysMs[attempt]));
      }

      try {
        response = await fetchWithTimeout(evolutionUrl, {
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

        responseData = await response.json();
        console.log(`[send-whatsapp] Response status: ${response.status} (attempt ${attempt + 1})`);

        if (response.ok) {
          // Log retry metrics if retried
          if (attempt > 0) {
            await supabase.from("application_logs").insert({
              module: "retry",
              level: "info",
              message: `WhatsApp enviado após ${attempt + 1} tentativas`,
              action: "send-whatsapp",
              context: { attempts: attempt + 1, success: true, label: "evolution_api" },
            }).then(() => {});
          }
          break;
        }

        lastError = responseData?.message || responseData?.error || `Status ${response.status}`;
        // Only retry on 5xx or network errors
        if (response.status < 500) break;
      } catch (err: unknown) {
        const isTimeout = err instanceof Error && err.name === "AbortError";
        lastError = isTimeout ? "Request timeout" : (err instanceof Error ? err.message : "Unknown error");
        console.error(`[send-whatsapp] Error (attempt ${attempt + 1}):`, lastError);
        if (attempt === maxAttempts - 1) {
          // Log retry exhaustion
          await supabase.from("application_logs").insert({
            module: "retry",
            level: "error",
            message: `WhatsApp falhou após ${maxAttempts} tentativas: ${lastError}`,
            action: "send-whatsapp",
            context: { attempts: maxAttempts, success: false, label: "evolution_api" },
          }).then(() => {});

          return new Response(
            JSON.stringify({ error: isTimeout ? "Timeout ao enviar mensagem" : "Erro interno" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (!response || !responseData) {
      return new Response(
        JSON.stringify({ error: "Falha ao conectar com a Evolution API" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
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
        error_message: response.ok ? null : (responseData?.message || responseData?.error || "Falha no envio"),
        external_message_id: externalId,
        sent_at: response.ok ? new Date().toISOString() : null,
      });
    }

    if (!response.ok) {
      // Evolution API returns nested error structure: { response: { message: [...] } }
      const nestedMessages = responseData?.response?.message;
      const errorMsg = Array.isArray(nestedMessages) 
        ? nestedMessages[0] 
        : (responseData?.message || responseData?.error || "Erro ao enviar mensagem WhatsApp");
      return new Response(
        JSON.stringify({ error: errorMsg, status: response.status }),
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