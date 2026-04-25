import { z } from "https://esm.sh/zod@3.23.8";
import { adminClient, corsHeaders, jsonResponse, logAudit, rateLimit, requireRole } from "../_shared/auth-helpers.ts";

const UpdateEmailSchema = z.object({
  user_id: z.string().uuid("user_id deve ser um UUID válido"),
  new_email: z.string().email("Email inválido").max(255),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireRole(req.headers.get("Authorization"), ["admin"]);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error, required_roles: ["admin"] }, auth.status ?? 401);
    }

    const rl = rateLimit(`update-user-email:${auth.userId}`, 5, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch { return jsonResponse({ error: "JSON inválido" }, 400); }

    const parsed = UpdateEmailSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.errors[0]?.message ?? "Dados inválidos" }, 400);
    }

    const { user_id, new_email } = parsed.data;
    const admin = adminClient();

    const { data: prevUser } = await admin.auth.admin.getUserById(user_id);
    const oldEmail = prevUser?.user?.email ?? null;

    const { error: authError } = await admin.auth.admin.updateUserById(user_id, {
      email: new_email,
      email_confirm: true,
    });
    if (authError) {
      console.error("[update-user-email] Auth error:", authError.message);
      return jsonResponse({ error: "Não foi possível atualizar o email" }, 400);
    }

    await admin.from("profiles").update({ email: new_email }).eq("user_id", user_id);

    await logAudit(admin, {
      table_name: "auth.users",
      record_id: user_id,
      action: "USER_EMAIL_UPDATED",
      user_id: auth.userId!,
      old_data: { email: oldEmail },
      new_data: { email: new_email },
    });

    return jsonResponse({ success: true, message: "Email atualizado com sucesso" });
  } catch (error) {
    console.error("[update-user-email] Unexpected:", error);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
