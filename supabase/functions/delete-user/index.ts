import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check staff role (admin, manager, technician, financial)
    const { data: roles } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const staffRoles = ["admin", "manager", "technician", "financial"];
    const isStaff = roles?.some((r) => staffRoles.includes(r.role));

    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Apenas membros da equipe podem excluir usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = roles?.some((r) => r.role === "admin");

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Você não pode excluir sua própria conta" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user info before deletion for audit
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user: targetUser } } = await adminClient.auth.admin.getUserById(user_id);

    // Non-admin staff can only delete client users (not other staff)
    if (!isAdmin) {
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id);

      const targetIsStaff = targetRoles?.some((r) => staffRoles.includes(r.role));
      if (targetIsStaff) {
        return new Response(JSON.stringify({ error: "Apenas administradores podem excluir membros da equipe" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Delete user (cascades to profiles and user_roles)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteError) {
      throw deleteError;
    }

    // Also clean up any client_contacts referencing this user
    await adminClient
      .from("client_contacts")
      .update({ user_id: null, is_active: false })
      .eq("user_id", user_id);

    // Audit log
    await adminClient.from("audit_logs").insert({
      table_name: "auth.users",
      record_id: user_id,
      action: "DELETE_USER",
      user_id: caller.id,
      old_data: {
        email: targetUser?.email,
        deleted_at: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[delete-user] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
