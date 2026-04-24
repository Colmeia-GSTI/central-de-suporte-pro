import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getEmailSettings,
  wrapInEmailLayout,
  escapeHtml,
} from "../_shared/email-helpers.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface RequestBody {
  email?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let payload: RequestBody;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "JSON inválido" }, 400);
    }

    const email = String(payload.email ?? "").toLowerCase().trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      return jsonResponse({ error: "Email inválido" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Find user by email
    const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      console.error("[resend-confirmation] listUsers error:", listErr.message);
      return jsonResponse({ error: "Erro ao localizar usuário" }, 500);
    }

    const user = usersData.users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );

    if (!user) {
      return jsonResponse({ error: "Email não cadastrado" }, 404);
    }

    if (user.email_confirmed_at) {
      return jsonResponse({
        success: false,
        already_confirmed: true,
        message: "Conta já ativada. Faça login normalmente.",
      });
    }

    // 2. Rate limit: max 3 successful sends in last hour
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await admin
      .from("message_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("related_type", "user_signup")
      .eq("status", "sent")
      .gte("sent_at", since);

    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return jsonResponse({
        error: "rate_limited",
        message: "Aguarde alguns minutos antes de solicitar novamente.",
      }, 429);
    }

    // 3. Generate signup confirmation link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[resend-confirmation] generateLink error:", linkErr?.message);
      return jsonResponse({ error: "Não foi possível gerar o link de confirmação" }, 500);
    }

    const actionLink = linkData.properties.action_link;

    // 4. Build branded HTML using shared helpers
    const settings = await getEmailSettings(admin);
    const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";
    const safeName = escapeHtml(fullName);
    const greeting = safeName ? `Olá, ${safeName}!` : "Olá!";

    const content = `
      <h2>Confirme seu cadastro</h2>
      <p>${greeting}</p>
      <p>Clique no botão abaixo para confirmar seu email e acessar a Colmeia.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${actionLink}"
           style="background: ${settings.primaryColor}; color: #ffffff; padding: 14px 32px;
                  text-decoration: none; border-radius: 8px; font-weight: 600;
                  display: inline-block;">
          Confirmar meu email
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br>
        <span style="word-break: break-all;">${actionLink}</span>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="font-size: 12px; color: #9ca3af;">
        Se você não se cadastrou na Colmeia, pode ignorar este email.
      </p>
    `;

    const html = wrapInEmailLayout(content, settings);

    // 5. Send via send-email-resend (consolidated logging path)
    const { data: sendResult, error: sendErr } = await admin.functions.invoke(
      "send-email-resend",
      {
        body: {
          to: email,
          subject: "Confirme seu cadastro - Colmeia",
          html,
          related_type: "user_signup",
          related_id: user.id,
          user_id: user.id,
        },
      },
    );

    if (sendErr || !sendResult?.success) {
      const msg = sendErr?.message || sendResult?.error || "Falha ao enviar email";
      console.error("[resend-confirmation] send-email-resend failed:", msg);
      return jsonResponse({ error: msg }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Email de confirmação reenviado",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    console.error("[resend-confirmation] Unexpected:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
