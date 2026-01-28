import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get SMTP settings from database
    const { data: smtpSettings, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "smtp")
      .single();

    if (settingsError || !smtpSettings) {
      console.warn("[send-email-smtp] SMTP configuration not found");
      return new Response(
        JSON.stringify({ error: "Configuração SMTP não encontrada", configured: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smtpSettings.is_active) {
      return new Response(
        JSON.stringify({ error: "Integração SMTP desativada", configured: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = smtpSettings.settings as {
      host: string;
      port: number;
      username: string;
      password: string;
      from_email: string;
      from_name: string;
      use_tls: boolean;
    };

    if (!settings.host || !settings.username || !settings.password) {
      return new Response(
        JSON.stringify({ error: "Configuração SMTP incompleta", configured: false }),
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
    console.log(`[send-email-smtp] Sending to ${emailValidation.emails.length} recipient(s)`);

    const client = new SMTPClient({
      connection: {
        hostname: settings.host,
        port: settings.port || 587,
        tls: settings.use_tls !== false,
        auth: {
          username: settings.username,
          password: settings.password,
        },
      },
    });

    await client.send({
      from: `${settings.from_name || "Sistema"} <${settings.from_email || settings.username}>`,
      to: emailValidation.emails,
      subject: sanitizedSubject,
      content: sanitizedText,
      html: sanitizedHtml,
    });

    await client.close();

    console.log("[send-email-smtp] Email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Email enviado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    // Never expose internal error details
    console.error("[send-email-smtp] Error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Erro ao enviar email. Verifique as configurações SMTP." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
