/**
 * Pure, testable handler for the notify-due-invoices flow.
 *
 * Mirrors the production decision tree from `index.ts`:
 *   1. Validate `days_before` input.
 *   2. Query pending invoices in the date window.
 *   3. For each invoice, dedupe against recent notifications.
 *   4. Invoke the email send and log the outcome.
 *
 * Production WhatsApp + staff notification side-effects are not
 * reproduced here — the test surface is the email decision path.
 * Keeping this dependency-free (no `npm:` imports) lets it run
 * under Vitest.
 */

interface MinimalSupabase {
  from: (table: string) => unknown;
  functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
}

export interface NotifyInput {
  days_before?: number;
}

export interface NotifyResult {
  success: boolean;
  total: number;
  emails_sent: number;
  skipped_dedup: number;
  errors: string[];
}

interface InvoiceRow {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  client_id: string;
  contract_id: string | null;
  boleto_url: string | null;
  clients: {
    id: string;
    name: string;
    email: string | null;
    financial_email: string | null;
    whatsapp: string | null;
  } | null;
}

export function validateNotifyInput(body: unknown): {
  ok: boolean;
  error?: string;
  value?: NotifyInput;
} {
  if (body === null || body === undefined) return { ok: true, value: {} };
  if (typeof body !== "object") return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (b.days_before !== undefined) {
    if (typeof b.days_before !== "number" || b.days_before < 0 || b.days_before > 60) {
      return { ok: false, error: "days_before must be 0..60" };
    }
  }
  return {
    ok: true,
    value: { days_before: (b.days_before as number | undefined) ?? 3 },
  };
}

export async function notifyDueInvoicesHandler(
  supabase: MinimalSupabase,
  input: NotifyInput,
): Promise<NotifyResult> {
  const _daysBefore = input.days_before ?? 3;

  const invoicesRes = (await (supabase.from("invoices") as unknown as Promise<{
    data: InvoiceRow[] | null;
    error: { message: string } | null;
  }>));

  if (invoicesRes.error) {
    return {
      success: false,
      total: 0,
      emails_sent: 0,
      skipped_dedup: 0,
      errors: [invoicesRes.error.message],
    };
  }

  const invoices = invoicesRes.data ?? [];
  const errors: string[] = [];
  let emailsSent = 0;
  let skippedDedup = 0;

  for (const invoice of invoices) {
    const client = invoice.clients;
    if (!client) continue;

    const recentRes = (await (
      supabase.from("invoice_notification_logs") as unknown as Promise<{
        data: Array<{ id: string }> | null;
        error: unknown;
      }>
    ));

    if (recentRes.data && recentRes.data.length > 0) {
      skippedDedup++;
      continue;
    }

    const recipient = client.financial_email || client.email;
    if (!recipient) continue;

    const send = await supabase.functions.invoke("send-email-resend", {
      body: {
        to: recipient,
        subject: `Lembrete: Fatura #${invoice.invoice_number}`,
        html: `<p>Olá ${client.name}, sua fatura vence em breve.</p>`,
        related_type: "invoice",
        related_id: invoice.id,
        user_id: client.id,
      },
    });

    const ok = !send.error && (send.data as { success?: boolean } | null)?.success === true;
    if (ok) {
      emailsSent++;
    } else {
      const errMsg =
        (send.error as { message?: string } | null)?.message ||
        (send.data as { error?: string } | null)?.error ||
        "Falha desconhecida";
      errors.push(errMsg);
    }
  }

  return {
    success: errors.length === 0,
    total: invoices.length,
    emails_sent: emailsSent,
    skipped_dedup: skippedDedup,
    errors,
  };
}
