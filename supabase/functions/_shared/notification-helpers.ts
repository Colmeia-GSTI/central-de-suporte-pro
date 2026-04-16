/**
 * Shared notification helpers for billing email flows.
 * Used by: resend-payment-notification, notify-due-invoices, batch-collection-notification
 */

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
  }
): string {
  if (!notificationMessage || !notificationMessage.trim()) return baseHtml;

  let message = notificationMessage;

  // Replace template variables
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

  // Insert before closing </body> or at end of content
  if (baseHtml.includes("</body>")) {
    return baseHtml.replace("</body>", personalizedSection + "</body>");
  }

  // Fallback: append at end
  return baseHtml + personalizedSection;
}
