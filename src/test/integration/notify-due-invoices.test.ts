import { describe, it, expect } from "vitest";
import {
  notifyDueInvoicesHandler,
  validateNotifyInput,
} from "../../../supabase/functions/notify-due-invoices/logic";
import { createSupabaseMock } from "@/test/mocks/supabase";
import { makeInvoice } from "@/test/helpers/factories";

describe("notify-due-invoices logic", () => {
  it("happy path: sends email for an invoice with no recent notification", async () => {
    const { client, spies } = createSupabaseMock({
      tables: {
        invoices: { data: [makeInvoice()], error: null },
        invoice_notification_logs: { data: [], error: null },
      },
      functions: {
        "send-email-resend": { data: { success: true }, error: null },
      },
    });

    const res = await notifyDueInvoicesHandler(client, { days_before: 3 });

    expect(res.success).toBe(true);
    expect(res.emails_sent).toBe(1);
    expect(res.skipped_dedup).toBe(0);
    expect(spies.invokeCalls.some((c) => c.name === "send-email-resend")).toBe(true);
  });

  it("input error: rejects out-of-range days_before", () => {
    expect(validateNotifyInput({ days_before: -1 })).toMatchObject({ ok: false });
    expect(validateNotifyInput({ days_before: 999 })).toMatchObject({ ok: false });
    expect(validateNotifyInput({ days_before: "3" })).toMatchObject({ ok: false });
    expect(validateNotifyInput({ days_before: 5 })).toMatchObject({ ok: true });
  });

  it("edge case: dedupes invoices already notified in the last 24h", async () => {
    const { client, spies } = createSupabaseMock({
      tables: {
        invoices: { data: [makeInvoice()], error: null },
        invoice_notification_logs: {
          data: [{ id: "log-1" }],
          error: null,
        },
      },
    });

    const res = await notifyDueInvoicesHandler(client, { days_before: 3 });

    expect(res.emails_sent).toBe(0);
    expect(res.skipped_dedup).toBe(1);
    expect(spies.invokeCalls.some((c) => c.name === "send-email-resend")).toBe(false);
  });
});
