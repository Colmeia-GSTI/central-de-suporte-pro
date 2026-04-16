import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getEmailSettings,
  wrapInEmailLayout,
} from "../_shared/email-helpers.ts";

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

    // Fetch email settings and company contact info in parallel
    const [emailSettings, companyRes] = await Promise.all([
      getEmailSettings(supabase),
      supabase.from("company_settings").select("telefone, email").limit(1).maybeSingle(),
    ]);

    const companyPhone = companyRes.data?.telefone || "";
    const companyEmail = companyRes.data?.email || "";

    const contactSection = (companyPhone || companyEmail)
      ? `<p style="margin-top: 15px;">Em caso de dúvidas, entre em contato conosco:</p>
         <p style="color: #4b5563;">
           ${companyPhone ? `📞 ${companyPhone}` : ""}
           ${companyPhone && companyEmail ? " | " : ""}
           ${companyEmail ? `✉️ ${companyEmail}` : ""}
         </p>`
      : "";

    const subject = `Bem-vindo(a) à ${emailSettings.companyName}!`;

    const content = `
      <h2 style="color: ${emailSettings.primaryColor};">🎉 Bem-vindo(a)!</h2>
      <p>Olá <strong>${client_name}</strong>,</p>
      <p>Seu cadastro foi realizado com sucesso na <strong>${emailSettings.companyName}</strong>.</p>
      <p>A partir de agora você receberá suas faturas e documentos fiscais por este e-mail.</p>
      ${contactSection}
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #6b7280;">
        Atenciosamente,<br>
        <strong>${emailSettings.companyName}</strong>
      </p>
    `;

    const htmlContent = wrapInEmailLayout(content, emailSettings);

    // Send via send-email-resend (fire-and-forget — don't propagate errors)
    try {
      const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
        body: { to: client_email, subject, html: htmlContent },
      });

      if (emailError) {
        console.error("[send-welcome-email] Email send error:", emailError);
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
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[send-welcome-email] Error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
