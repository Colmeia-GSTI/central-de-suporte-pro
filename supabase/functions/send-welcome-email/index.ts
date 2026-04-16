import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeRequest {
  client_id: string;
  client_name: string;
  client_email: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: WelcomeRequest = await req.json();
    const { client_id, client_name, client_email } = body;

    if (!client_email) {
      console.log("[send-welcome-email] No email provided, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!client_id || !client_name) {
      return new Response(
        JSON.stringify({ error: "client_id e client_name são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company info and email settings in parallel
    const [companyRes, emailSettingsRes, resendSettingsRes] = await Promise.all([
      supabase.from("company_settings").select("razao_social, nome_fantasia, telefone, email").limit(1).maybeSingle(),
      supabase.from("email_settings").select("*").limit(1).maybeSingle(),
      supabase.from("integration_settings").select("settings").eq("integration_type", "resend").eq("is_active", true).maybeSingle(),
    ]);

    const company = companyRes.data;
    const companyName = company?.nome_fantasia || company?.razao_social || "Colmeia TI";
    const companyPhone = company?.telefone || "";
    const companyEmail = company?.email || "";

    const emailSettings = emailSettingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Este é um e-mail automático. Em caso de dúvidas, entre em contato.",
    };

    const subject = `Bem-vindo(a) à ${companyName}!`;

    const contactSection = (companyPhone || companyEmail)
      ? `<p style="margin-top: 15px;">Em caso de dúvidas, entre em contato conosco:</p>
         <p style="color: #4b5563;">
           ${companyPhone ? `📞 ${companyPhone}` : ""}
           ${companyPhone && companyEmail ? " | " : ""}
           ${companyEmail ? `✉️ ${companyEmail}` : ""}
         </p>`
      : "";

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; }
    .email-container { max-width: 600px; margin: 0 auto; background: #fff; }
    .email-header { background: ${emailSettings.primary_color}; padding: 24px; text-align: center; }
    .email-header img { max-height: 50px; max-width: 200px; }
    .email-content { padding: 32px 24px; color: #1f2937; line-height: 1.6; }
    .email-content h2 { margin-top: 0; color: #111827; }
    .email-footer { background: ${emailSettings.secondary_color}; color: #9ca3af; padding: 20px 24px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      ${emailSettings.logo_url ? `<img src="${emailSettings.logo_url}" alt="Logo" />` : `<span style="color: #fff; font-size: 18px; font-weight: 600;">${companyName}</span>`}
    </div>
    <div class="email-content">
      <h2 style="color: ${emailSettings.primary_color};">🎉 Bem-vindo(a)!</h2>
      <p>Olá <strong>${client_name}</strong>,</p>
      <p>Seu cadastro foi realizado com sucesso na <strong>${companyName}</strong>.</p>
      <p>A partir de agora você receberá suas faturas e documentos fiscais por este e-mail.</p>
      ${contactSection}
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #6b7280;">
        Atenciosamente,<br>
        <strong>${companyName}</strong>
      </p>
    </div>
    <div class="email-footer">
      ${emailSettings.footer_text}
    </div>
  </div>
</body>
</html>`;

    // Send via send-email-resend (fire-and-forget style — don't propagate errors)
    try {
      const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
        body: { to: client_email, subject, html: htmlContent },
      });

      if (emailError) {
        console.error("[send-welcome-email] Email send error:", emailError);
        // Log failure but don't propagate
        await supabase.from("message_logs").insert({
          channel: "email",
          recipient: client_email,
          message: `E-mail de boas-vindas para ${client_name}`,
          status: "failed",
          error_message: emailError.message || "Erro ao enviar",
          related_type: "client",
          related_id: client_id,
        });
      } else {
        console.log(`[send-welcome-email] Welcome email sent to ${client_email}`);
        await supabase.from("message_logs").insert({
          channel: "email",
          recipient: client_email,
          message: `E-mail de boas-vindas para ${client_name}`,
          status: "sent",
          sent_at: new Date().toISOString(),
          related_type: "client",
          related_id: client_id,
        });
      }
    } catch (err) {
      console.error("[send-welcome-email] Exception:", err);
      // Never propagate — the client creation must not be affected
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[send-welcome-email] Error:", errorMsg);
    // Return 200 even on error to not affect the trigger
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
