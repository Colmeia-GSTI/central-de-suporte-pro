import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT - only authenticated admin users
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem alterar esta configuração" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const { api_key } = await req.json();
    if (!api_key || typeof api_key !== "string" || !api_key.startsWith("re_")) {
      return new Response(
        JSON.stringify({ error: "API Key inválida. Deve começar com 're_'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate the key by making a test request to Resend API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const validateResponse = await fetch("https://api.resend.com/domains", {
      headers: { "Authorization": `Bearer ${api_key}` },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!validateResponse.ok) {
      const errData = await validateResponse.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ 
          error: "API Key inválida ou sem permissão",
          details: errData?.message || `Status: ${validateResponse.status}`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the key using Supabase Management API via vault
    // Since we can't directly update secrets from edge functions,
    // we store it encrypted in the vault
    const { error: vaultError } = await supabase.rpc("set_resend_api_key", {
      key_value: api_key,
    });

    // If vault RPC doesn't exist, store in integration_settings (encrypted field)
    if (vaultError) {
      console.warn("[update-resend-key] Vault RPC not available, storing in integration_settings");
      
      // Update the integration_settings with the key
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id, settings")
        .eq("integration_type", "resend")
        .maybeSingle();

      const currentSettings = (existing?.settings as Record<string, unknown>) || {};
      const updatedSettings = { ...currentSettings, api_key };

      if (existing) {
        await supabase
          .from("integration_settings")
          .update({ settings: updatedSettings })
          .eq("integration_type", "resend");
      } else {
        await supabase
          .from("integration_settings")
          .insert({
            integration_type: "resend",
            settings: updatedSettings,
            is_active: true,
          });
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      table_name: "integration_settings",
      action: "UPDATE_RESEND_KEY",
      user_id: user.id,
      new_data: { integration: "resend", updated_at: new Date().toISOString() },
    });

    console.log(`[update-resend-key] API Key updated by user ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, message: "API Key do Resend atualizada com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[update-resend-key] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
