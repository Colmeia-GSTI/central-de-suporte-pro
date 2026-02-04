import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://suporte.colmeiagsti.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// Sanitize HTML content - remove dangerous elements and attributes
function sanitizeHtml(html: string): string {
  let sanitized = html.slice(0, MAX_HTML_LENGTH);

  // Remove script tags and content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove event handlers (on*)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "");

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, "");

  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, "");

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  // Remove embed and object tags
  sanitized = sanitized.replace(/<(embed|object)[^>]*>/gi, "");

  // Remove style tags with potentially malicious content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  return sanitized;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] || fromHeader).trim();
}

function toCrlf(input: string): string {
  return input.replace(/\r?\n/g, "\r\n");
}

function dotStuff(input: string): string {
  // RFC 5321 dot transparency
  return input
    .split("\n")
    .map((line) => (line.startsWith(".") ? "." + line : line))
    .join("\n");
}

type SmtpConn = Deno.Conn;

async function readLine(conn: SmtpConn, buf: Uint8Array, state: { carry: Uint8Array }): Promise<string | null> {
  // Simple line reader with carry buffer.
  const idxInCarry = () => {
    for (let i = 0; i < state.carry.length; i++) {
      if (state.carry[i] === 10) return i; // \n
    }
    return -1;
  };

  while (true) {
    const nlIndex = idxInCarry();
    if (nlIndex !== -1) {
      const lineBytes = state.carry.slice(0, nlIndex + 1);
      state.carry = state.carry.slice(nlIndex + 1);
      return decoder.decode(lineBytes).replace(/\r?\n$/, "");
    }

    const n = await conn.read(buf);
    if (n === null) return null;
    const chunk = buf.slice(0, n);
    const merged = new Uint8Array(state.carry.length + chunk.length);
    merged.set(state.carry, 0);
    merged.set(chunk, state.carry.length);
    state.carry = merged;
  }
}

async function readResponse(conn: SmtpConn, buf: Uint8Array, state: { carry: Uint8Array }): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const first = await readLine(conn, buf, state);
  if (!first) throw new Error("SMTP: conexão encerrada");
  lines.push(first);

  const code = Number.parseInt(first.slice(0, 3), 10);
  if (!Number.isFinite(code)) throw new Error(`SMTP: resposta inválida: ${first}`);

  // Multiline: 250-... until 250 <space>
  const isMulti = first.length >= 4 && first[3] === "-";
  if (!isMulti) return { code, lines };

  while (true) {
    const line = await readLine(conn, buf, state);
    if (!line) throw new Error("SMTP: conexão encerrada");
    lines.push(line);
    if (line.startsWith(`${code} `)) break;
  }

  return { code, lines };
}

async function writeCmd(conn: SmtpConn, cmd: string): Promise<void> {
  await conn.write(encoder.encode(cmd + "\r\n"));
}

async function smtpSend(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
  fromHeader: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const buf = new Uint8Array(4096);
  const state = { carry: new Uint8Array(0) };
  let conn: SmtpConn | null = null;

  const cleanup = () => {
    try {
      conn?.close();
    } catch {
      // ignore
    }
  };

  try {
    const implicitTls = params.port === 465;
    conn = implicitTls
      ? await Deno.connectTls({ hostname: params.host, port: params.port })
      : await Deno.connect({ hostname: params.host, port: params.port });

    // 220 greeting
    let res = await readResponse(conn, buf, state);
    if (res.code !== 220) throw new Error(res.lines.join("\n"));

    const ehloName = "localhost";
    await writeCmd(conn, `EHLO ${ehloName}`);
    res = await readResponse(conn, buf, state);
    if (res.code !== 250) throw new Error(res.lines.join("\n"));

    // STARTTLS if needed
    if (!implicitTls && params.useTls) {
      const supportsStartTls = res.lines.some((l) => l.toUpperCase().includes("STARTTLS"));
      if (supportsStartTls) {
        await writeCmd(conn, "STARTTLS");
        const tlsRes = await readResponse(conn, buf, state);
        if (tlsRes.code !== 220) throw new Error(tlsRes.lines.join("\n"));
        // startTls requires a TcpConn; at this point the connection is from Deno.connect()
        conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: params.host });
        state.carry = new Uint8Array(0);

        await writeCmd(conn, `EHLO ${ehloName}`);
        res = await readResponse(conn, buf, state);
        if (res.code !== 250) throw new Error(res.lines.join("\n"));
      }
    }

    // AUTH LOGIN
    await writeCmd(conn, "AUTH LOGIN");
    res = await readResponse(conn, buf, state);
    if (res.code !== 334) throw new Error(res.lines.join("\n"));
    await writeCmd(conn, btoa(params.username));
    res = await readResponse(conn, buf, state);
    if (res.code !== 334) throw new Error(res.lines.join("\n"));
    await writeCmd(conn, btoa(params.password));
    res = await readResponse(conn, buf, state);
    if (res.code !== 235) throw new Error(res.lines.join("\n"));

    const mailFrom = extractEmailAddress(params.fromHeader) || params.username;
    await writeCmd(conn, `MAIL FROM:<${mailFrom}>`);
    res = await readResponse(conn, buf, state);
    if (res.code >= 400) throw new Error(res.lines.join("\n"));

    for (const recipient of params.to) {
      await writeCmd(conn, `RCPT TO:<${recipient}>`);
      res = await readResponse(conn, buf, state);
      if (res.code >= 400) throw new Error(res.lines.join("\n"));
    }

    await writeCmd(conn, "DATA");
    res = await readResponse(conn, buf, state);
    if (res.code !== 354) throw new Error(res.lines.join("\n"));

    const boundary = `ALT_${crypto.randomUUID()}`;
    const headers = [
      `Subject: ${params.subject}`,
      `From: ${params.fromHeader}`,
      `To: ${params.to.join(", ")}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary=${boundary}`,
      "",
    ].join("\r\n");

    const textPart = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=\"utf-8\"`,
      "",
      toCrlf(dotStuff(params.text)),
      "",
    ].join("\r\n");

    const htmlPart = [
      `--${boundary}`,
      `Content-Type: text/html; charset=\"utf-8\"`,
      "",
      toCrlf(dotStuff(params.html)),
      "",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const data = headers + textPart + htmlPart;
    await conn.write(encoder.encode(data + "\r\n.\r\n"));
    res = await readResponse(conn, buf, state);
    if (res.code >= 400) throw new Error(res.lines.join("\n"));

    await writeCmd(conn, "QUIT");
    // Ignore QUIT response
  } finally {
    cleanup();
  }
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
    const port = settings.port || 587;
    console.log(`[send-email-smtp] Connecting to ${settings.host}:${port}`);
    console.log(`[send-email-smtp] Sending to ${emailValidation.emails.length} recipient(s)`);

    let sendErrorMsg = "";

    try {
      const fromValue = `${settings.from_name || "Sistema"} <${settings.from_email || settings.username}>`;

      await smtpSend({
        host: settings.host,
        port,
        username: settings.username,
        password: settings.password,
        useTls: settings.use_tls !== false,
        fromHeader: fromValue,
        to: emailValidation.emails,
        subject: sanitizedSubject,
        text: sanitizedText,
        html: sanitizedHtml,
      });

      console.log("[send-email-smtp] Email sent successfully");

      // Log each recipient in message_logs for auditability
      try {
        for (const recipient of emailValidation.emails) {
          await supabase.from("message_logs").insert({
            channel: "email",
            recipient: recipient,
            message: sanitizedHtml.slice(0, 500),
            status: "sent",
            error_message: null,
            sent_at: new Date().toISOString(),
          });
        }
      } catch (logError) {
        console.warn("[send-email-smtp] Failed to log message:", logError);
        // Don't fail the email send if logging fails
      }

      return new Response(
        JSON.stringify({ success: true, message: "Email enviado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (sendError: unknown) {
      sendErrorMsg = sendError instanceof Error ? sendError.message : "Unknown send error";
      console.error("[send-email-smtp] Send error:", sendErrorMsg);

      // Log failed send attempt for auditability
      try {
        for (const recipient of emailValidation.emails) {
          await supabase.from("message_logs").insert({
            channel: "email",
            recipient: recipient,
            message: sanitizedHtml.slice(0, 500),
            status: "failed",
            error_message: sendErrorMsg.slice(0, 500),
            sent_at: null,
          });
        }
      } catch (logError) {
        console.warn("[send-email-smtp] Failed to log error message:", logError);
      }

      // Determine user-friendly message based on error
      let userMessage = "Erro ao enviar email. Verifique as configurações SMTP.";

      if (sendErrorMsg.includes("datamode") || sendErrorMsg.includes("connection not recoverable")) {
        userMessage = "A conexão SMTP foi interrompida durante o envio. Isso pode indicar que o servidor rejeitou o email ou há um problema de rede.";
      } else if (sendErrorMsg.includes("554") || sendErrorMsg.includes("policy") || sendErrorMsg.includes("relay") || sendErrorMsg.includes("Rejected")) {
        userMessage = "O servidor SMTP rejeitou o email. Isso pode ocorrer quando o servidor não permite envio para domínios externos. Verifique as configurações de relay do seu provedor SMTP.";
      } else if (sendErrorMsg.includes("connect")) {
        userMessage = "Não foi possível conectar ao servidor SMTP. Verifique host e porta.";
      } else if (sendErrorMsg.includes("auth") || sendErrorMsg.includes("credentials")) {
        userMessage = "Falha na autenticação SMTP. Verifique usuário e senha.";
      } else if (sendErrorMsg.includes("certificate") || sendErrorMsg.includes("TLS")) {
        userMessage = "Erro de certificado SSL/TLS. Verifique as configurações de segurança.";
      }

      return new Response(
        JSON.stringify({ error: userMessage, details: sendErrorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-email-smtp] Unexpected error:", errorMsg);
    
    return new Response(
      JSON.stringify({ error: "Erro inesperado ao processar requisição de email", details: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
