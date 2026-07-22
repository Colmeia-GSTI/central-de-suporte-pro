import { adminClient, corsHeaders, jsonResponse, logAudit, rateLimit, requireRole } from "../_shared/auth-helpers.ts";

const STAFF_ROLES = ["admin", "manager", "technician", "financial"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireRole(req.headers.get("Authorization"), ["admin"]);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error, required_roles: ["admin"] }, auth.status ?? 401);
    }

    const rl = rateLimit(`delete-user:${auth.userId}`, 5, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id || typeof user_id !== "string") {
      return jsonResponse({ error: "user_id é obrigatório" }, 400);
    }

    if (user_id === auth.userId) {
      return jsonResponse({ error: "Você não pode excluir sua própria conta" }, 400);
    }

    const admin = adminClient();
    const { data: { user: targetUser } } = await admin.auth.admin.getUserById(user_id);
    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    // Captura os contatos vinculados ANTES do delete: a FK client_contacts.user_id
    // → auth.users é ON DELETE SET NULL, então o delete abaixo zera user_id e um
    // filtro por user_id depois não casaria mais nenhuma linha.
    const { data: linkedContacts } = await admin
      .from("client_contacts")
      .select("id")
      .eq("user_id", user_id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      console.error("[delete-user] Error:", deleteError.message);
      return jsonResponse({ error: "Erro ao excluir usuário" }, 500);
    }

    const contactIds = (linkedContacts ?? []).map((c) => c.id);
    if (contactIds.length > 0) {
      await admin.from("client_contacts")
        .update({ user_id: null, is_active: false })
        .in("id", contactIds);
    }

    await logAudit(admin, {
      table_name: "auth.users",
      record_id: user_id,
      action: "USER_DELETED",
      user_id: auth.userId!,
      old_data: {
        email: targetUser?.email,
        roles: (targetRoles ?? []).map((r) => r.role),
      },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[delete-user] Unexpected:", error);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
