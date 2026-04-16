import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/email-helpers.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 50000;
const MAX_RECIPIENTS = 50;

interface EmailAttachment {
  filename: string;
  content?: string; // base64
  path?: string;    // URL
}

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from_name?: string;
  from_email?: string;
  attachments?: EmailAttachment[];
}

function sanitizeEmails(input: string | string[]): { valid: boolean; emails: string[]; error?: string } {
  const emails = Array.isArray(input) ? input : [input];
  if (emails.length === 0) return { valid: false, emails: [], error: "Pelo menos um destinatário é necessário" };
  if (emails.length > MAX_RECIPIENTS) return { valid: false, emails: [], error: `Máximo de ${MAX_RECIPIENTS} destinatários` };

  const sanitized: string[] = [];
  for (const email of emails) {
    const trimmed = String(email).toLowerCase().trim();
    if (!EMAIL_REGEX.test(trimmed)) return { valid: false, emails: [], error: `Email inválido: ${trimmed.slice(0, 50)}` };
    sanitized.push(trimmed);
  }
  return { valid: true, emails: sanitized };
}

function sanitizeHtml(html: string): string {
  let sanitized = html.slice(0, MAX_HTML_LENGTH);
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "");
  sanitized = sanitized.replace(/javascript:/gi, "");
  sanitized = sanitized.replace(/data:text\/html/gi, "");
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  sanitized = sanitized.replace(/<(embed|object)[^>]*>/gi, "");
  return sanitized;
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetTime) rateLimitMap.delete(key);
  }
}, 60_000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(`send-email:${clientIp}`)) {
      console.warn(`[send-email-resend] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Muitas requisições. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "1" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("[send-email-resend] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Serviço de email não configurado. Atualize o segredo RESEND_API_KEY no Lovable Cloud.", configured: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "JSON inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, subject, html, text, from_name, from_email, attachments } = body as EmailRequest;

    // Validate recipients
    const emailValidation = sanitizeEmails(to);
    if (!emailValidation.valid) {
      return new Response(
        JSON.stringify({ error: emailValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Assunto é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Conteúdo HTML é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedSubject = subject.trim().slice(0, MAX_SUBJECT_LENGTH);
    const sanitizedHtml = sanitizeHtml(html);
    const sanitizedText = text ? String(text).slice(0, MAX_HTML_LENGTH) : sanitizedHtml.replace(/<[^>]*>/g, "");

    // Determine sender - use provided or fetch from integration_settings
    let senderName = from_name || "";
    let senderEmail = from_email || "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (!senderName || !senderEmail) {
      const { data: resendSettings } = await supabase
        .from("integration_settings")
        .select("settings")
        .eq("integration_type", "resend")
        .eq("is_active", true)
        .maybeSingle();

      const resendConfig = resendSettings?.settings as { default_from_email?: string; default_from_name?: string } | null;

      if (!senderName) {
        senderName = resendConfig?.default_from_name || "Colmeia TI";
      }

      if (!senderEmail) {
        senderEmail = resendConfig?.default_from_email || "noreply@suporte.colmeiagsti.com";
      }
    }

    // Fire-and-forget logging for pending
    Promise.resolve().then(async () => {
      try {
        for (const recipient of emailValidation.emails) {
          await supabase.from("message_logs").insert({
            channel: "email",
            recipient,
            message: sanitizedHtml.slice(0, 500),
            status: "pending",
            sent_at: null,
          });
        }
      } catch (logErr) {
        console.warn("[send-email-resend] Log error:", logErr);
      }
    });

    const fromValue = `${senderName} <${senderEmail}>`;
    console.log(`[send-email-resend] Sending to ${emailValidation.emails.length} recipient(s) from ${fromValue}`);

    // Build Resend API body
    const resendBody: Record<string, unknown> = {
      from: fromValue,
      to: emailValidation.emails,
      subject: sanitizedSubject,
      html: sanitizedHtml,
      text: sanitizedText,
    };

    // Include attachments if provided
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      resendBody.attachments = attachments.map((a) => ({
        filename: a.filename,
        ...(a.content ? { content: a.content } : {}),
        ...(a.path ? { path: a.path } : {}),
      }));
      console.log(`[send-email-resend] Including ${attachments.length} attachment(s)`);
    }

    // Send via Resend API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(resendBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      const errMsg = resendData?.message || resendData?.error || `Resend API error: ${resendResponse.status}`;
      console.error(`[send-email-resend] Resend error:`, errMsg);

      for (const recipient of emailValidation.emails) {
        await supabase.from("message_logs").insert({
          channel: "email",
          recipient,
          message: sanitizedHtml.slice(0, 500),
          status: "failed",
          error_message: errMsg.slice(0, 500),
        }).then(() => {});
      }

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: resendResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-email-resend] Email sent successfully. ID: ${resendData?.id}`);

    for (const recipient of emailValidation.emails) {
      await supabase.from("message_logs").insert({
        channel: "email",
        recipient,
        message: sanitizedHtml.slice(0, 500),
        status: "sent",
        sent_at: new Date().toISOString(),
      }).then(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email enviado com sucesso", id: resendData?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-email-resend] Unexpected error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
