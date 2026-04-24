// deno-lint-ignore-file no-explicit-any
// Helper compartilhado para registrar notificações de fatura.
// Centraliza o insert em invoice_notification_logs e evita duplicação
// de lógica entre as Edge Functions de envio.

export interface InvoiceNotificationLog {
  invoice_id: string;
  notification_type: string;
  channel: "email" | "whatsapp";
  recipient: string | null;
  success: boolean;
  error_message?: string | null;
}

export async function logInvoiceNotification(
  supabase: any,
  log: InvoiceNotificationLog,
): Promise<void> {
  try {
    await supabase.from("invoice_notification_logs").insert({
      invoice_id: log.invoice_id,
      notification_type: log.notification_type,
      channel: log.channel,
      recipient: log.recipient,
      success: log.success,
      error_message: log.error_message?.slice(0, 1000) ?? null,
      sent_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[logInvoiceNotification] Failed to log:", err);
  }
}
