import { adminClient, corsHeaders, jsonResponse, logAudit, rateLimit, requireRole } from "../_shared/auth-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireRole(req.headers.get("Authorization"), ["admin"]);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error, required_roles: ["admin"] }, auth.status ?? 401);
    }

    let action = "list";
    let bodyUserId: string | undefined;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      action = body?.action ?? "list";
      bodyUserId = body?.user_id;
    } else {
      const url = new URL(req.url);
      action = url.searchParams.get("action") ?? "list";
    }

    const admin = adminClient();

    if (action === "list") {
      const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 500 });
      if (listError) {
        console.error("[confirm-user-email] List error:", listError.message);
        return jsonResponse({ error: "Erro ao listar usuários" }, 500);
      }
      const statusMap: Record<string, boolean> = {};
      for (const u of users) statusMap[u.id] = !!u.email_confirmed_at;
      return jsonResponse({ data: statusMap });
    }

    if (action === "confirm") {
      if (!bodyUserId || typeof bodyUserId !== "string") {
        return jsonResponse({ error: "user_id é obrigatório" }, 400);
      }

      const rl = rateLimit(`confirm-user-email:${auth.userId}`, 5, 60_000);
      if (!rl.allowed) {
        return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
      }

      const { data: userData, error: updateError } = await admin.auth.admin.updateUserById(bodyUserId, { email_confirm: true });
      if (updateError) {
        console.error("[confirm-user-email] Confirm error:", updateError.message);
        return jsonResponse({ error: "Erro ao ativar usuário" }, 500);
      }

      if (userData?.user) {
        const u = userData.user;
        const fullName = u.user_metadata?.full_name || u.email || "Usuário";
        await admin.from("profiles").upsert(
          { user_id: u.id, full_name: fullName, email: u.email },
          { onConflict: "user_id" },
        );
      }

      await logAudit(admin, {
        table_name: "auth.users",
        record_id: bodyUserId,
        action: "EMAIL_CONFIRMED_BY_ADMIN",
        user_id: auth.userId!,
        new_data: { confirmed_at: new Date().toISOString() },
      });

      return jsonResponse({ success: true, message: "Usuário confirmado" });
    }

    return jsonResponse({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("[confirm-user-email] Unexpected:", error);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
