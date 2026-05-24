import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTempPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  // garante 1 de cada classe
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (base.length < length) base.push(pick(all));
  // shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: currentUser }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !currentUser) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", currentUser.id);
    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem redefinir senhas" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const Schema = z.object({
      user_id: z.string().uuid(),
      new_password: z.string().min(8).max(128).optional(),
      generate: z.boolean().optional().default(false),
      must_change: z.boolean().optional().default(true),
      notify_email: z.boolean().optional().default(true),
    }).refine((v) => v.generate || (v.new_password && v.new_password.length >= 8), {
      message: "Forneça new_password (>=8) ou generate=true",
    });

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Schema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.errors[0]?.message || "Dados inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, generate, must_change, notify_email } = parsed.data;
    const finalPassword = generate ? generateTempPassword(14) : parsed.data.new_password!;

    // Atualiza senha
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: finalPassword,
    });
    if (updateErr) {
      console.error("[reset-password] updateUserById error:", updateErr);
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Flag must_change_password
    if (must_change) {
      const { error: flagErr } = await supabaseAdmin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("user_id", user_id);
      if (flagErr) console.warn("[reset-password] flag must_change failed:", flagErr.message);
    } else {
      await supabaseAdmin.from("profiles").update({ must_change_password: false }).eq("user_id", user_id);
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      table_name: "auth.users",
      record_id: user_id,
      action: "PASSWORD_RESET_BY_ADMIN",
      user_id: currentUser.id,
      new_data: {
        target_user_id: user_id,
        method: generate ? "generated" : "manual",
        must_change_password: must_change,
        notified_by_email: notify_email,
        at: new Date().toISOString(),
      },
    });

    // Notificação por email (sem incluir a senha — segurança)
    let emailSent = false;
    if (notify_email) {
      try {
        const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(user_id);
        const recipient = targetUser?.user?.email;
        if (recipient && !recipient.endsWith(".internal")) {
          const { data: profile } = await supabaseAdmin
            .from("profiles").select("full_name").eq("user_id", user_id).maybeSingle();
          const fullName = profile?.full_name || "usuário";

          const origin = req.headers.get("origin") || "https://suporte.colmeiagsti.com";
          const html = `
            <div style="font-family: Montserrat, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #212529;">
              <h2 style="color: #E8A914;">Sua senha foi redefinida</h2>
              <p>Olá, <strong>${fullName}</strong>.</p>
              <p>Um administrador redefiniu a senha da sua conta na Central de Suporte Colmeia.</p>
              ${must_change ? "<p>Ao entrar, você será solicitado a definir uma nova senha de sua escolha.</p>" : ""}
              <p style="margin: 24px 0;">
                <a href="${origin}/login" style="background:#E8A914;color:#212529;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
                  Acessar agora
                </a>
              </p>
              <p style="color:#6c757d;font-size:12px;">Se você não solicitou esta alteração, entre em contato com o suporte imediatamente.</p>
            </div>`;

          const { error: mailErr } = await supabaseAdmin.functions.invoke("send-email-resend", {
            body: {
              to: recipient,
              subject: "Sua senha foi redefinida — Central de Suporte Colmeia",
              html,
              tags: [{ name: "type", value: "password_reset_admin" }],
            },
          });
          if (mailErr) console.warn("[reset-password] email send failed:", mailErr.message);
          else emailSent = true;
        }
      } catch (e) {
        console.warn("[reset-password] email block error:", e);
      }
    }

    console.log(`[reset-password] OK user=${user_id} by=${currentUser.id} generated=${generate} must_change=${must_change}`);

    return new Response(JSON.stringify({
      success: true,
      message: "Senha redefinida com sucesso",
      generated_password: generate ? finalPassword : undefined,
      must_change_password: must_change,
      email_sent: emailSent,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("[reset-password] fatal:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
