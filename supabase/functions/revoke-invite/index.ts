import {
  corsHeaders, jsonResponse, requireRole, adminClient as makeAdminClient,
  rateLimit, logAudit,
} from "../_shared/auth-helpers.ts";

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

    const rl = rateLimit(`revoke-invite:${auth.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    const { invite_id } = await req.json();
    if (!invite_id) return jsonResponse({ error: "invite_id obrigatório" }, 400);

    const admin = makeAdminClient();

    const { data: invite, error: getErr } = await admin
      .from("pending_invites")
      .select("id, email, accepted_at, expires_at")
      .eq("id", invite_id)
      .maybeSingle();

    if (getErr || !invite) {
      return jsonResponse({ error: "Convite não encontrado" }, 404);
    }
    if (invite.accepted_at) {
      return jsonResponse({ error: "Convite já foi utilizado" }, 409);
    }

    // Expira imediatamente
    const { error: updErr } = await admin
      .from("pending_invites")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (updErr) {
      return jsonResponse({ error: updErr.message }, 500);
    }

    await logAudit(admin, {
      actor_id: auth.userId!,
      action: "invite_revoked",
      target_table: "pending_invites",
      target_id: invite.id,
      diff: { email: invite.email },
    });

    return jsonResponse({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[revoke-invite] unexpected:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
