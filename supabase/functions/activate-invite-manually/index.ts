import {
  corsHeaders, jsonResponse, requireRole, adminClient as makeAdminClient,
  rateLimit, logAudit,
} from "../_shared/auth-helpers.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  invite_id: z.string().uuid(),
  password: z.string().min(8).max(128),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireRole(req.headers.get("Authorization"), [
      "admin", "manager", "financial",
    ]);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status ?? 401);
    }

    const rl = rateLimit(`activate-invite-manually:${auth.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { invite_id, password } = parsed.data;

    const admin = makeAdminClient();

    const { data: invite, error: getErr } = await admin
      .from("pending_invites")
      .select("id, email, full_name, role, accepted_at, expires_at")
      .eq("id", invite_id)
      .maybeSingle();

    if (getErr || !invite) return jsonResponse({ error: "Convite não encontrado" }, 404);
    if (invite.accepted_at) return jsonResponse({ error: "Convite já foi utilizado" }, 409);
    if (new Date(invite.expires_at) <= new Date()) {
      return jsonResponse({ error: "Convite expirado. Renove-o antes de ativar." }, 409);
    }

    // Verifica se já existe usuário em auth.users com este email
    const emailLower = invite.email.toLowerCase();
    let userId: string | null = null;

    // Pagina até achar (limite razoável)
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) return jsonResponse({ error: `Falha ao listar usuários: ${listErr.message}` }, 500);
      const found = list.users.find((u) => (u.email ?? "").toLowerCase() === emailLower);
      if (found) userId = found.id;
      if (list.users.length < 200) break;
    }

    if (userId) {
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) return jsonResponse({ error: `Falha ao atualizar usuário: ${updErr.message}` }, 500);
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: invite.full_name },
      });
      if (createErr || !created.user) {
        return jsonResponse({ error: `Falha ao criar usuário: ${createErr?.message ?? "desconhecido"}` }, 500);
      }
      userId = created.user.id;
    }

    const { data: acceptData, error: acceptErr } = await admin.rpc("admin_accept_invite", {
      p_invite_id: invite.id,
      p_user_id: userId,
    });
    if (acceptErr) {
      return jsonResponse({ error: `Falha ao vincular convite: ${acceptErr.message}` }, 500);
    }

    await logAudit(admin, {
      actor_id: auth.userId!,
      action: "invite_activated_manually",
      target_table: "pending_invites",
      target_id: invite.id,
      diff: { email: invite.email, role: invite.role, target_user_id: userId },
    });

    return jsonResponse({
      success: true,
      email: invite.email,
      redirect: (acceptData as any)?.redirect ?? "/",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[activate-invite-manually] unexpected:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
