import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvolutionSettings {
  api_url: string;
  api_key: string;
  instance_name: string;
}

interface ValidateRequest {
  phone: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Evolution API settings
    const { data: settings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .single();

    if (settingsError || !settings) {
      console.error("Evolution API settings not found:", settingsError);
      return new Response(
        JSON.stringify({ 
          error: "Evolution API não configurada",
          valid: false,
          exists: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.is_active) {
      console.error("Evolution API is not active");
      return new Response(
        JSON.stringify({ 
          error: "Evolution API está desativada",
          valid: false,
          exists: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evolutionSettings = settings.settings as EvolutionSettings;
    
    if (!evolutionSettings.api_url || !evolutionSettings.api_key || !evolutionSettings.instance_name) {
      console.error("Incomplete Evolution API settings");
      return new Response(
        JSON.stringify({ 
          error: "Configuração da Evolution API incompleta",
          valid: false,
          exists: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { phone }: ValidateRequest = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Número de telefone é obrigatório", valid: false, exists: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean and format phone number
    let cleanPhone = phone.replace(/\D/g, "");
    
    // Add Brazil country code if not present
    if (!cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
      cleanPhone = "55" + cleanPhone;
    }

    // Validate phone length (should be 12-13 digits with country code)
    if (cleanPhone.length < 12 || cleanPhone.length > 13) {
      return new Response(
        JSON.stringify({ 
          error: "Número de telefone inválido. Use o formato: (XX) XXXXX-XXXX",
          valid: false,
          exists: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Validating WhatsApp number: ${cleanPhone}`);

    // Call Evolution API to check if number has WhatsApp
    const apiUrl = evolutionSettings.api_url.replace(/\/$/, "");
    const endpoint = `${apiUrl}/chat/whatsappNumbers/${evolutionSettings.instance_name}`;

    console.log(`Calling Evolution API: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionSettings.api_key,
      },
      body: JSON.stringify({
        numbers: [cleanPhone],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: "Erro ao consultar Evolution API",
          valid: false,
          exists: false,
          details: errorText 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Evolution API response:", JSON.stringify(result));

    // Parse response - Evolution API returns array of validated numbers
    let exists = false;
    let jid = null;

    if (Array.isArray(result) && result.length > 0) {
      const numberResult = result[0];
      exists = numberResult.exists === true || numberResult.numberExists === true;
      jid = numberResult.jid || numberResult._serialized || null;
    } else if (result.exists !== undefined) {
      exists = result.exists === true;
      jid = result.jid || null;
    }

    console.log(`WhatsApp validation result for ${cleanPhone}: exists=${exists}, jid=${jid}`);

    return new Response(
      JSON.stringify({
        valid: true,
        exists: exists,
        phone: cleanPhone,
        jid: jid,
        message: exists 
          ? "Número possui WhatsApp vinculado" 
          : "Número não possui WhatsApp vinculado",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error validating WhatsApp:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ 
        error: "Erro interno ao validar número",
        valid: false,
        exists: false,
        details: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
