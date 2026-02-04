import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security: Input validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 50000;
const MAX_RECIPIENTS = 50;

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

interface ResendSettings {
  api_key: string;
  from_email: string;
  from_name: string;
}

// Sanitize and validate email addresses
function sanitizeEmails(input: string | string[]): { valid: boolean; emails: string[]; error?: string } {
  const emails = Array.isArray(input) ? input : [input];
  
  if (emails.length === 0) {
    return { valid: false, emails: [], error: "At least one recipient required" };
  }
  
  if (emails.length > MAX_RECIPIENTS) {
    return { valid: false, emails: [], error: `Maximum ${MAX_RECIPIENTS} recipients allowed` };
  }
  
  const sanitized: string[] = [];
  for (const email of emails) {
    const trimmed = String(email).toLowerCase().trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      return { valid: false, emails: [], error: `Invalid email: ${trimmed.slice(0, 50)}` };
    }
    sanitized.push(trimmed);
  }
  
  return { valid: true, emails: sanitized };
}

// Sanitize HTML content (basic - remove script tags)
function sanitizeHtml(html: string): string {
  return html
    .slice(0, MAX_HTML_LENGTH)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "data-removed=");
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

    // Get Resend settings from database
    const { data: resendSettings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "resend")
      .single();

    if (settingsError || !resendSettings) {
      console.warn("[send-email-resend] Resend configuration not found");
      return new Response(
        JSON.stringify({ error: "Configuração Resend não encontrada", configured: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resendSettings.is_active) {
      return new Response(
        JSON.stringify({ error: "Integração Resend desativada", configured: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = resendSettings.settings as ResendSettings;

    if (!settings.api_key || !settings.from_email) {
      return new Response(
        JSON.stringify({ error: "Configuração Resend incompleta (API Key ou Email)", configured: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, subject, html, text } = body as EmailRequest;

    // Validate recipients
    const emailValidation = sanitizeEmails(to);
    if (!emailValidation.valid) {
      return new Response(
        JSON.stringify({ error: emailValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate subject
    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Subject is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate HTML content
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "HTML content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize inputs
    const sanitizedSubject = subject.trim().slice(0, MAX_SUBJECT_LENGTH);
    const sanitizedHtml = sanitizeHtml(html);
    const sanitizedText = text ? String(text).slice(0, MAX_HTML_LENGTH) : sanitizedHtml.replace(/<[^>]*>/g, '');

    // Safe logging (no sensitive data)
    console.log(`[send-email-resend] Sending to ${emailValidation.emails.length} recipient(s)`);

    // Initialize Resend client
    const resend = new Resend(settings.api_key);

    try {
      const { data: emailResult, error: sendError } = await resend.emails.send({
        from: `${settings.from_name || "Sistema"} <${settings.from_email}>`,
        to: emailValidation.emails,
        subject: sanitizedSubject,
        html: sanitizedHtml,
        text: sanitizedText,
      });

      if (sendError) {
        console.error("[send-email-resend] Resend API error:", sendError);
        return new Response(
          JSON.stringify({ error: sendError.message || "Erro ao enviar email via Resend" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[send-email-resend] Email sent successfully:", emailResult?.id);

      return new Response(
        JSON.stringify({ success: true, message: "Email enviado com sucesso", id: emailResult?.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (sendError: unknown) {
      const errorMsg = sendError instanceof Error ? sendError.message : "Unknown send error";
      console.error("[send-email-resend] Send error:", errorMsg);
      throw sendError;
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-email-resend] Error:", errorMsg);
    
    // Return more specific error messages for debugging
    let userMessage = "Erro ao enviar email. Verifique as configurações Resend.";
    if (errorMsg.includes("API key")) {
      userMessage = "API Key do Resend inválida. Verifique a configuração.";
    } else if (errorMsg.includes("domain")) {
      userMessage = "Domínio do email remetente não validado no Resend.";
    } else if (errorMsg.includes("rate")) {
      userMessage = "Limite de envio atingido. Tente novamente em alguns minutos.";
    }
    
    return new Response(
      JSON.stringify({ error: userMessage, details: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
