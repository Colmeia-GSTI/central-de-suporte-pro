/**
 * Shared email helpers for all Edge Functions that send emails.
 * Consolidates: wrapInEmailLayout, replaceVariables, getEmailSettings,
 * formatCurrencyBRL, formatDateBR, applyNotificationMessage, corsHeaders.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface EmailLayoutOptions {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  footerText: string;
  companyName: string;
  /** Extra CSS rules injected inside <style> (e.g. ticket-specific classes) */
  extraCss?: string;
}

// ── Fetch settings ──────────────────────────────────────────────

export async function getEmailSettings(
  supabase: SupabaseClient,
): Promise<EmailLayoutOptions> {
  const [emailRes, companyRes] = await Promise.all([
    supabase
      .from("email_settings")
      .select("primary_color, secondary_color, logo_url, footer_text")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("company_settings")
      .select("nome_fantasia, razao_social")
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    primaryColor: emailRes.data?.primary_color || "#f59e0b",
    secondaryColor: emailRes.data?.secondary_color || "#1f2937",
    logoUrl: emailRes.data?.logo_url || null,
    footerText:
      emailRes.data?.footer_text ||
      "Este é um e-mail automático. Em caso de dúvidas, entre em contato.",
    companyName:
      companyRes.data?.nome_fantasia ||
      companyRes.data?.razao_social ||
      "Colmeia TI",
  };
}

// ── HTML layout wrapper ─────────────────────────────────────────

export function wrapInEmailLayout(
  content: string,
  options: EmailLayoutOptions,
): string {
  const extra = options.extraCss || "";
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; }
    .email-container { max-width: 600px; margin: 0 auto; background: #fff; }
    .email-header { background: ${options.primaryColor}; padding: 24px; text-align: center; }
    .email-header img { max-height: 50px; max-width: 200px; }
    .email-content { padding: 32px 24px; color: #1f2937; line-height: 1.6; }
    .email-content h2 { margin-top: 0; color: #111827; }
    .email-content a { color: ${options.primaryColor}; }
    .email-content blockquote { border-left: 3px solid ${options.primaryColor}; padding-left: 15px; margin: 15px 0; background: #f9fafb; padding: 12px 15px; }
    .email-content code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .email-footer { background: ${options.secondaryColor}; color: #9ca3af; padding: 20px 24px; text-align: center; font-size: 12px; }
    ${extra}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      ${options.logoUrl ? `<img src="${options.logoUrl}" alt="Logo" />` : `<span style="color: #fff; font-size: 18px; font-weight: 600;">${options.companyName}</span>`}
    </div>
    <div class="email-content">
      ${content}
    </div>
    <div class="email-footer">
      ${options.footerText}
    </div>
  </div>
</body>
</html>`;
}

// ── Variable replacement ────────────────────────────────────────

/**
 * Replaces {{variable}} and conditional blocks {{#variable}}...{{/variable}}.
 */
export function replaceVariables(
  template: string,
  data: Record<string, string>,
): string {
  let result = template;

  // Simple variables
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, "g"),
      value || "",
    );
  });

  // Conditional blocks
  Object.entries(data).forEach(([key, value]) => {
    const re = new RegExp(
      `\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`,
      "g",
    );
    result = result.replace(re, value ? "$1" : "");
  });

  return result;
}

// ── Formatting helpers ──────────────────────────────────────────

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDateBR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

// ── Notification message (merged from notification-helpers.ts) ──

/**
 * Applies a contract's custom notification_message into the email HTML.
 * Inserts a styled blockquote before the closing </body> tag.
 */
export function applyNotificationMessage(
  baseHtml: string,
  notificationMessage: string | null,
  variables: {
    cliente: string;
    valor: string;
    vencimento: string;
    fatura: string;
    contrato?: string;
    nota?: string;
    boleto?: string;
    pix?: string;
  },
): string {
  if (!notificationMessage || !notificationMessage.trim()) return baseHtml;

  let message = notificationMessage;

  message = message.replace(/\{cliente\}/g, variables.cliente);
  message = message.replace(/\{valor\}/g, variables.valor);
  message = message.replace(/\{vencimento\}/g, variables.vencimento);
  message = message.replace(/\{fatura\}/g, variables.fatura);
  if (variables.contrato !== undefined)
    message = message.replace(/\{contrato\}/g, variables.contrato);
  if (variables.nota !== undefined)
    message = message.replace(/\{nota\}/g, variables.nota || "—");
  if (variables.boleto !== undefined)
    message = message.replace(/\{boleto\}/g, variables.boleto || "—");
  if (variables.pix !== undefined)
    message = message.replace(/\{pix\}/g, variables.pix || "—");

  const personalizedSection = `
    <div style="border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; background: #fffbeb; border-radius: 0 6px 6px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">${message}</p>
    </div>
  `;

  if (baseHtml.includes("</body>")) {
    return baseHtml.replace("</body>", personalizedSection + "</body>");
  }

  return baseHtml + personalizedSection;
}

// ── Email template fetching ─────────────────────────────────────

export interface EmailTemplate {
  subject_template: string;
  html_template: string;
  is_active: boolean;
}

export async function getEmailTemplate(
  supabase: SupabaseClient,
  templateType: string,
): Promise<EmailTemplate | null> {
  const { data } = await supabase
    .from("email_templates")
    .select("subject_template, html_template, is_active")
    .eq("template_type", templateType)
    .maybeSingle();
  return data?.is_active ? data : null;
}
