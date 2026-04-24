/**
 * Pure, testable handler for the resend-confirmation flow.
 *
 * Mirrors the production validation path from `index.ts`:
 *   1. Validate email format.
 *   2. Look up user via auth.admin.listUsers.
 *   3. Reject if already confirmed.
 *   4. Enforce rate limit (3 sends / hour).
 *   5. Generate magic link and invoke send-email-resend.
 *
 * Kept dependency-free (no `npm:` specifiers) to run under Vitest.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_MAX = 3;

interface AuthUser {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  user_metadata?: Record<string, unknown>;
}

interface MinimalSupabase {
  auth: {
    admin: {
      listUsers: () => Promise<{ data: { users: AuthUser[] }; error: unknown }>;
      generateLink: (opts: { type: string; email: string }) => Promise<{
        data: { properties?: { action_link?: string } } | null;
        error: { message: string } | null;
      }>;
    };
  };
  from: (table: string) => unknown;
  functions: {
    invoke: (
      name: string,
      opts: { body: unknown },
    ) => Promise<{ data: { success?: boolean; error?: string } | null; error: { message: string } | null }>;
  };
}

export type ResendOutcome =
  | { ok: true; success: true; message: string }
  | { ok: true; success: false; already_confirmed: true; message: string }
  | { ok: false; status: number; error: string };

export function validateEmailInput(body: unknown): {
  ok: boolean;
  email?: string;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "JSON inválido" };
  }
  const raw = (body as { email?: unknown }).email;
  const email = String(raw ?? "").toLowerCase().trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  return { ok: true, email };
}

export async function resendConfirmationHandler(
  supabase: MinimalSupabase,
  email: string,
): Promise<ResendOutcome> {
  const listed = await supabase.auth.admin.listUsers();
  if (listed.error) {
    return { ok: false, status: 500, error: "Erro ao localizar usuário" };
  }

  const user = listed.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );
  if (!user) {
    return { ok: false, status: 404, error: "Email não cadastrado" };
  }

  if (user.email_confirmed_at) {
    return {
      ok: true,
      success: false,
      already_confirmed: true,
      message: "Conta já ativada. Faça login normalmente.",
    };
  }

  const recent = (await (supabase.from("message_logs") as unknown as Promise<{
    count: number | null;
    error: unknown;
  }>));
  if ((recent.count ?? 0) >= RATE_LIMIT_MAX) {
    return { ok: false, status: 429, error: "rate_limited" };
  }

  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data?.properties?.action_link) {
    return { ok: false, status: 500, error: "Não foi possível gerar o link de confirmação" };
  }

  const send = await supabase.functions.invoke("send-email-resend", {
    body: {
      to: email,
      subject: "Confirme seu cadastro - Colmeia",
      html: `<a href="${link.data.properties.action_link}">Confirmar</a>`,
      related_type: "user_signup",
      related_id: user.id,
      user_id: user.id,
    },
  });

  if (send.error || !send.data?.success) {
    return {
      ok: false,
      status: 500,
      error: send.error?.message || send.data?.error || "Falha ao enviar email",
    };
  }

  return { ok: true, success: true, message: "Email de confirmação reenviado" };
}
