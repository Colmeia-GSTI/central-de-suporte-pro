/**
 * Pure, testable handler for the generate-monthly-invoices flow.
 *
 * This module mirrors the core decision tree from `index.ts`
 * (skip-if-exists → validate first_billing_month → check window →
 * insert invoice) so it can be exercised under Vitest with a mock
 * Supabase client. The production `Deno.serve` entrypoint in
 * `index.ts` remains the source of truth for the full pipeline
 * (NFS-e emission, payment provider invocation, notifications,
 * application_logs etc.). Keeping this file dependency-free of
 * `npm:` specifiers is deliberate so it can be imported under
 * Node/Vitest without Deno.
 */

export interface GenerateInput {
  month?: number;
  year?: number;
  contract_id?: string | null;
}

export interface GenerateResult {
  success: boolean;
  reference_month: string;
  stats: {
    total_contracts: number;
    generated: number;
    skipped: number;
    failed: number;
  };
  errors: Array<{ contract_id: string; message: string }>;
}

interface MinimalSupabase {
  from: (table: string) => {
    select: (...args: unknown[]) => unknown;
    insert: (payload: unknown) => unknown;
    update: (payload: unknown) => unknown;
    eq: (...args: unknown[]) => unknown;
    gt: (...args: unknown[]) => unknown;
    not: (...args: unknown[]) => unknown;
    limit: (n: number) => unknown;
    single: () => Promise<{ data: unknown; error: unknown }>;
    then: (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
    ) => Promise<unknown>;
  };
}

interface ContractRow {
  id: string;
  client_id: string;
  name: string;
  monthly_value: number;
  billing_day: number | null;
  days_before_due: number | null;
  payment_preference: string | null;
  billing_provider: string | null;
  first_billing_month: string | null;
}

export function validateGenerateInput(body: unknown): {
  ok: boolean;
  error?: string;
  value?: GenerateInput;
} {
  if (body === null || body === undefined) return { ok: true, value: {} };
  if (typeof body !== "object") return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (b.month !== undefined) {
    if (typeof b.month !== "number" || b.month < 1 || b.month > 12) {
      return { ok: false, error: "month must be 1..12" };
    }
  }
  if (b.year !== undefined) {
    if (typeof b.year !== "number" || b.year < 2000 || b.year > 2100) {
      return { ok: false, error: "year must be valid" };
    }
  }
  if (b.contract_id !== undefined && b.contract_id !== null && typeof b.contract_id !== "string") {
    return { ok: false, error: "contract_id must be string" };
  }
  return {
    ok: true,
    value: {
      month: b.month as number | undefined,
      year: b.year as number | undefined,
      contract_id: (b.contract_id as string | null | undefined) ?? null,
    },
  };
}

export async function generateMonthlyInvoicesHandler(
  supabase: MinimalSupabase,
  input: GenerateInput,
): Promise<GenerateResult> {
  const targetMonth = input.month ?? new Date().getMonth() + 1;
  const targetYear = input.year ?? new Date().getFullYear();
  const referenceMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

  const contractsRes = (await (supabase.from("contracts") as unknown as Promise<{
    data: ContractRow[] | null;
    error: { message: string } | null;
  }>));

  if (contractsRes.error) {
    return {
      success: false,
      reference_month: referenceMonth,
      stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
      errors: [{ contract_id: "", message: contractsRes.error.message }],
    };
  }

  const contracts = contractsRes.data ?? [];
  const errors: Array<{ contract_id: string; message: string }> = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const contract of contracts) {
    if (
      contract.first_billing_month &&
      referenceMonth < contract.first_billing_month
    ) {
      skipped++;
      continue;
    }

    const existingRes = (await (supabase.from("invoices") as unknown as Promise<{
      data: Array<{ id: string }> | null;
      error: unknown;
    }>));

    if (existingRes.data && existingRes.data.length > 0) {
      skipped++;
      continue;
    }

    const insertRes = (await (
      supabase.from("invoices").insert({
        client_id: contract.client_id,
        contract_id: contract.id,
        amount: contract.monthly_value,
        reference_month: referenceMonth,
        status: "pending",
        payment_method: contract.payment_preference ?? "boleto",
      }) as unknown as Promise<{ data: unknown; error: { message: string } | null }>
    ));

    if (insertRes.error) {
      failed++;
      errors.push({ contract_id: contract.id, message: insertRes.error.message });
      continue;
    }
    generated++;
  }

  return {
    success: failed === 0,
    reference_month: referenceMonth,
    stats: {
      total_contracts: contracts.length,
      generated,
      skipped,
      failed,
    },
    errors,
  };
}
