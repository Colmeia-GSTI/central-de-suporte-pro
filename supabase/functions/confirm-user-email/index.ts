import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify requesting user is admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: requestingUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check admin role
    const { data: adminRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .in("role", ["admin", "manager"]);

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem realizar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    if (action === "list") {
      // List users with their email confirmation status
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({
        perPage: 500,
      });

      if (listError) {
        console.error("[confirm-user-email] Error listing users:", listError.message);
        throw listError;
      }

      // Return map of user_id -> confirmed status
      const statusMap: Record<string, boolean> = {};
      for (const user of users) {
        statusMap[user.id] = !!user.email_confirmed_at;
      }

      return new Response(
        JSON.stringify({ data: statusMap }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "confirm") {
      const body = await req.json();
      const userId = body.user_id;

      if (!userId || typeof userId !== "string") {
        return new Response(
          JSON.stringify({ error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Confirm user email using admin API
      const { data: userData, error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });

      if (updateError) {
        console.error("[confirm-user-email] Error confirming user:", updateError.message);
        return new Response(
          JSON.stringify({ error: "Erro ao ativar usuário" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Ensure profile exists (upsert) to prevent orphan auth users
      if (userData?.user) {
        const u = userData.user;
        const fullName = u.user_metadata?.full_name || u.email || "Usuário";
        const { error: profileError } = await adminClient.from("profiles").upsert(
          {
            user_id: u.id,
            full_name: fullName,
            email: u.email,
          },
          { onConflict: "user_id" }
        );
        if (profileError) {
          console.error("[confirm-user-email] Failed to upsert profile:", profileError.message);
        } else {
          console.log(`[confirm-user-email] Profile ensured for user ${u.id}`);
        }
      }

      // Log the action
      await adminClient.from("audit_logs").insert({
        table_name: "auth.users",
        record_id: userId,
        action: "EMAIL_CONFIRMED_BY_ADMIN",
        user_id: requestingUser.id,
        new_data: { confirmed_by: requestingUser.id, confirmed_at: new Date().toISOString() },
      });

      console.log(`[confirm-user-email] User ${userId} confirmed by admin ${requestingUser.id}`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[confirm-user-email] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
