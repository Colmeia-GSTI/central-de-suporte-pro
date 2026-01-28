import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResolveUsernameRequest {
  username: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body: ResolveUsernameRequest = await req.json();
    const { username } = body;

    if (!username) {
      return new Response(
        JSON.stringify({ error: "Username é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Resolving username: ${username}`);

    // Usar service role para buscar dados
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar contato pelo username
    const { data: contact, error: contactError } = await adminClient
      .from("client_contacts")
      .select("user_id, is_active")
      .eq("username", username)
      .maybeSingle();

    if (contactError) {
      console.error("Error fetching contact:", contactError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar usuário" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contact) {
      console.log(`Username not found: ${username}`);
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contact.is_active) {
      console.log(`User is inactive: ${username}`);
      return new Response(
        JSON.stringify({ error: "Usuário inativo" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contact.user_id) {
      console.log(`User has no auth account: ${username}`);
      return new Response(
        JSON.stringify({ error: "Usuário sem conta de acesso" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar email do profile
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("email")
      .eq("user_id", contact.user_id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Error fetching profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Perfil não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Username resolved: ${username} -> ${profile.email}`);

    return new Response(
      JSON.stringify({ email: profile.email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
