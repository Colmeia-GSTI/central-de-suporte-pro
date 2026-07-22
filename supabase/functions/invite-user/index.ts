import { z } from "https://esm.sh/zod@3.23.8";
import {
  corsHeaders, jsonResponse, requireRole, adminClient as makeAdminClient,
  rateLimit, logAudit,
} from "../_shared/auth-helpers.ts";
import { getEmailSettings, wrapInEmailLayout, escapeHtml } from "../_shared/email-helpers.ts";

const InviteSchema = z.object({
  email: z.string().email("Email inválido"),
  full_name: z.string().min(2, "Nome obrigatório").max(120),
  role: z.enum(["admin", "manager", "technician", "financial", "client", "client_master"]),
  client_id: z.string().uuid().nullable().optional(),
}).refine(
  (d) => (d.role === "client" || d.role === "client_master") ? !!d.client_id : !d.client_id,
  { message: "Convite de cliente exige client_id; staff não pode ter client_id" }
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireRole(req.headers.get("Authorization"), [
      "admin", "manager", "financial",
    ]);
    if (!auth.ok) {
      return jsonResponse(
        { error: auth.error, required_roles: ["admin", "manager", "financial"] },
        auth.status ?? 401,
      );
    }

    const rl = rateLimit(`invite-user:${auth.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    const body = await req.json();
    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.issues[0].message }, 400);
    }
    const { email, full_name, role, client_id } = parsed.data;

    // Gate de escalonamento de privilégio: conceder o papel 'admin' exige que o
    // solicitante SEJA admin. manager/financial podem convidar demais papéis,
    // mas não podem criar novos admins.
    if (role === "admin" && !(auth.roles ?? []).includes("admin")) {
      return jsonResponse(
        { error: "Apenas administradores podem conceder o papel de administrador." },
        403,
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const admin = makeAdminClient();

    // 1. Bloqueia se já existe auth.users com esse email (paginação real)
    let userExists = false;
    for (let page = 1; page <= 20 && !userExists; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) {
        console.error("[invite-user] listUsers error:", listErr.message);
        return jsonResponse({ error: `Falha ao verificar usuários existentes: ${listErr.message}` }, 500);
      }
      if (list.users.some((u) => (u.email ?? "").toLowerCase() === normalizedEmail)) {
        userExists = true;
        break;
      }
      if (list.users.length < 200) break;
    }
    if (userExists) {
      return jsonResponse({ error: "Já existe um usuário com esse email." }, 409);
    }

    // 2. Bloqueia se já existe convite válido pendente
    const { data: existingInvite } = await admin
      .from("pending_invites")
      .select("id, expires_at")
      .ilike("email", normalizedEmail)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existingInvite) {
      return jsonResponse({
        error: "Já existe um convite pendente para este email. Revogue antes de reenviar.",
      }, 409);
    }

    // 3. Cria convite
    const { data: invite, error: insertErr } = await admin
      .from("pending_invites")
      .insert({
        email: normalizedEmail,
        full_name,
        role,
        client_id: client_id ?? null,
        invited_by: auth.userId!,
      })
      .select("id, token, expires_at")
      .single();

    if (insertErr || !invite) {
      console.error("[invite-user] insert error:", insertErr?.message);
      return jsonResponse({ error: insertErr?.message || "Falha ao criar convite" }, 500);
    }

    // 4. Monta URL de aceite
    const appUrl = Deno.env.get("APP_URL") || "https://suporte.colmeiagsti.com";
    const acceptUrl = `${appUrl}/setup-account?token=${invite.token}`;

    // 5. Resolve nome do cliente (se houver)
    let clientName: string | null = null;
    if (client_id) {
      const { data: client } = await admin.from("clients").select("name").eq("id", client_id).maybeSingle();
      clientName = client?.name ?? null;
    }

    // 6. Email branded
    const settings = await getEmailSettings(admin);
    const greeting = `Olá, ${escapeHtml(full_name)}!`;
    const contextLine = clientName
      ? `Você foi convidado(a) a acessar o portal da <strong>${escapeHtml(clientName)}</strong> na Colmeia HD.`
      : `Você foi convidado(a) a fazer parte da equipe Colmeia HD.`;

    const content = `
      <h2>Você recebeu um convite</h2>
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
        Se o botão não funcionar, copie e cole este endereço no navegador:<br>
        <span style="word-break: break-all;">${acceptUrl}</span>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Este convite expira em 7 dias.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="font-size: 12px; color: #9ca3af;">
        Se você não esperava este convite, pode ignorar este email.
      </p>
    `;
    const html = wrapInEmailLayout(content, settings);

    // 7. Envia via send-email-resend
    const { data: sendResult, error: sendErr } = await admin.functions.invoke(
      "send-email-resend",
      {
        body: {
          to: normalizedEmail,
          subject: "Convite para acessar a Colmeia HD",
          html,
          related_type: "invite",
          related_id: invite.id,
        },
      },
    );

    if (sendErr || !sendResult?.success) {
      // Convite criado mas email falhou — admin pode reenviar
      console.error("[invite-user] send-email-resend failed:", sendErr?.message);
      await logAudit(admin, {
        user_id: auth.userId!,
        action: "invite_created_email_failed",
        table_name: "pending_invites",
        record_id: invite.id,
        new_data: { email: normalizedEmail, role, client_id, error: sendErr?.message },
      });
      return jsonResponse({
        warning: "Convite criado mas email falhou. Use o botão 'Reenviar' na lista.",
        invite_id: invite.id,
        expires_at: invite.expires_at,
      }, 207);
    }

    await logAudit(admin, {
      user_id: auth.userId!,
      action: "invite_created",
      table_name: "pending_invites",
      record_id: invite.id,
      new_data: { email: normalizedEmail, role, client_id },
    });

    return jsonResponse({
      success: true,
      invite_id: invite.id,
      expires_at: invite.expires_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[invite-user] unexpected:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
