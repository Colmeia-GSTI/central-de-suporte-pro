import { describe, it, expect } from "vitest";
import {
  generateMonthlyInvoicesHandler,
  validateGenerateInput,
} from "../../../supabase/functions/generate-monthly-invoices/logic";
import { createSupabaseMock } from "@/test/mocks/supabase";
import { makeContract } from "@/test/helpers/factories";

describe("generate-monthly-invoices logic", () => {
  it("happy path: creates invoice for an active contract with no existing invoice", async () => {
    const { client, spies } = createSupabaseMock({
      tables: {
        contracts: { data: [makeContract()], error: null },
        invoices: { data: [], error: null }, // no existing
      },
    });

    const res = await generateMonthlyInvoicesHandler(client, {
      month: 6,
      year: 2026,
    });

    expect(res.success).toBe(true);
    expect(res.stats).toEqual({
      total_contracts: 1,
      generated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(spies.insertCalls.some((c) => c.table === "invoices")).toBe(true);
  });

  it("input error: rejects invalid month values", () => {
    expect(validateGenerateInput({ month: 13 })).toMatchObject({ ok: false });
    expect(validateGenerateInput({ month: 0 })).toMatchObject({ ok: false });
    expect(validateGenerateInput({ year: "2026" })).toMatchObject({ ok: false });
    expect(validateGenerateInput({ month: 6, year: 2026 })).toMatchObject({ ok: true });
  });

  it("edge case: skips contracts whose first_billing_month is in the future", async () => {
    const { client } = createSupabaseMock({
      tables: {
        contracts: {
          data: [makeContract({ first_billing_month: "2099-12" })],
          error: null,
        },
        invoices: { data: [], error: null },
      },
    });

    const res = await generateMonthlyInvoicesHandler(client, {
      month: 6,
      year: 2026,
    });

    expect(res.stats.generated).toBe(0);
    expect(res.stats.skipped).toBe(1);
  });
});
