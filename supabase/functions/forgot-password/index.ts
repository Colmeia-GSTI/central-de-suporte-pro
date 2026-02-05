import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ForgotPasswordRequest {
  identifier: string; // username or email
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body: ForgotPasswordRequest = await req.json();
    const { identifier } = body;

    if (!identifier) {
      return new Response(
        JSON.stringify({ error: "Informe seu email ou username" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password recovery requested for: ${identifier}`);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const isEmail = identifier.includes("@");
    let realEmail: string | null = null;
    let userId: string | null = null;

    if (isEmail) {
      // Buscar por email real em client_contacts
      const { data: contact } = await adminClient
        .from("client_contacts")
        .select("user_id, email")
        .eq("email", identifier)
        .not("user_id", "is", null)
        .maybeSingle();

      if (contact) {
        userId = contact.user_id;
        realEmail = contact.email;
      } else {
        // Talvez seja um usuário staff - buscar em profiles
        const { data: profile } = await adminClient
          .from("profiles")
          .select("user_id, email")
          .eq("email", identifier)
          .maybeSingle();

        if (profile) {
          // Verificar se não é um email sintético
          if (!profile.email.endsWith(".internal")) {
            userId = profile.user_id;
            realEmail = profile.email;
          }
        }
      }
    } else {
      // Buscar por username
      const { data: contact } = await adminClient
        .from("client_contacts")
        .select("user_id, email")
        .eq("username", identifier)
        .not("user_id", "is", null)
        .maybeSingle();

      if (contact) {
        userId = contact.user_id;
        // Usar apenas se tiver email real cadastrado
        if (contact.email && !contact.email.endsWith(".internal")) {
          realEmail = contact.email;
        }
      }
    }

    if (!userId) {
      console.log(`User not found: ${identifier}`);
      // Retornamos sucesso mesmo se não encontrar para não revelar se o usuário existe
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Se o usuário existir e tiver um email cadastrado, enviaremos instruções de recuperação." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!realEmail) {
      console.log(`User ${identifier} has no real email for recovery`);
      return new Response(
        JSON.stringify({ 
          error: "Este usuário não possui email cadastrado para recuperação. Entre em contato com o suporte.",
          noEmail: true
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar email de recuperação
    console.log(`Sending recovery email to: ${realEmail}`);
    
    const { error: resetError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: realEmail,
      options: {
        redirectTo: `${req.headers.get("origin") || supabaseUrl}/login`,
      },
    });

    if (resetError) {
      console.error("Error generating recovery link:", resetError);
      
      // Tentar método alternativo
      const { error: altError } = await adminClient.auth.resetPasswordForEmail(realEmail, {
        redirectTo: `${req.headers.get("origin") || supabaseUrl}/login`,
      });

      if (altError) {
        console.error("Alternative reset also failed:", altError);
        return new Response(
          JSON.stringify({ error: "Erro ao enviar email de recuperação. Tente novamente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Recovery email sent successfully to ${realEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Instruções de recuperação enviadas para seu email cadastrado."
      }),
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
