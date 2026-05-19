import {
  corsHeaders, jsonResponse, requireRole, adminClient as makeAdminClient,
  rateLimit, logAudit,
} from "../_shared/auth-helpers.ts";
import { getEmailSettings, wrapInEmailLayout, escapeHtml } from "../_shared/email-helpers.ts";

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

    const rl = rateLimit(`resend-invite:${auth.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    const { invite_id } = await req.json();
    if (!invite_id) return jsonResponse({ error: "invite_id obrigatório" }, 400);

    const admin = makeAdminClient();

    // Carrega convite
    const { data: invite, error: getErr } = await admin
      .from("pending_invites")
      .select("id, email, full_name, role, client_id, token, accepted_at")
      .eq("id", invite_id)
      .maybeSingle();

    if (getErr || !invite) {
      return jsonResponse({ error: "Convite não encontrado" }, 404);
    }
    if (invite.accepted_at) {
      return jsonResponse({ error: "Convite já foi utilizado" }, 409);
    }

    // Estende validade em mais 7 dias
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updErr } = await admin
      .from("pending_invites")
      .update({ expires_at: newExpires })
      .eq("id", invite.id);
    if (updErr) {
      return jsonResponse({ error: updErr.message }, 500);
    }

    // Monta email novamente
    const appUrl = Deno.env.get("APP_URL") || "https://suporte.colmeiagsti.com.br";
    const acceptUrl = `${appUrl}/setup-account?token=${invite.token}`;

    let clientName: string | null = null;
    if (invite.client_id) {
      const { data: client } = await admin.from("clients").select("name").eq("id", invite.client_id).maybeSingle();
      clientName = client?.name ?? null;
    }

    const settings = await getEmailSettings(admin);
    const greeting = `Olá, ${escapeHtml(invite.full_name || "")}!`;
    const contextLine = clientName
      ? `Você foi convidado(a) a acessar o portal da <strong>${escapeHtml(clientName)}</strong> na Colmeia HD.`
      : `Você foi convidado(a) a fazer parte da equipe Colmeia HD.`;

    const content = `
      <h2>Lembrete: você tem um convite pendente</h2>
      <p>${greeting}</p>
      <p>${contextLine}</p>
      <p>Clique no botão abaixo para criar sua senha e ativar sua conta.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${acceptUrl}"
           style="background: ${settings.primaryColor}; color: #ffffff; padding: 14px 32px;
                  text-decoration: none; border-radius: 8px; font-weight: 600;
                  display: inline-block;">
          Ativar minha conta
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Se o botão não funcionar, copie e cole:<br>
        <span style="word-break: break-all;">${acceptUrl}</span>
      </p>
      <p style="font-size: 13px; color: #6b7280;">Este convite agora expira em 7 dias.</p>
    `;
    const html = wrapInEmailLayout(content, settings);

    const { data: sendResult, error: sendErr } = await admin.functions.invoke(
      "send-email-resend",
      {
        body: {
          to: invite.email,
          subject: "Lembrete: seu convite Colmeia HD",
          html,
          related_type: "invite",
          related_id: invite.id,
        },
      },
    );

    if (sendErr || !sendResult?.success) {
      return jsonResponse({ error: sendErr?.message || "Falha ao reenviar email" }, 500);
    }

    await logAudit(admin, {
      actor_id: auth.userId!,
      action: "invite_resent",
      target_table: "pending_invites",
      target_id: invite.id,
      diff: { new_expires_at: newExpires },
    });

    return jsonResponse({ success: true, expires_at: newExpires });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[resend-invite] unexpected:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
