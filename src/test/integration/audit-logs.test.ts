import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { diffJsonb } from "@/lib/audit-diff";
import { useAuditLogs } from "@/hooks/useAuditLogs";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("audit-diff: diffJsonb", () => {
  it("detects added, removed and changed top-level keys", () => {
    const result = diffJsonb(
      { a: 1, b: "old", c: true },
      { a: 1, b: "new", d: 42 },
    );
    expect(result.changed.map((c) => c.key)).toEqual(["b"]);
    expect(result.removed.map((c) => c.key)).toEqual(["c"]);
    expect(result.added.map((c) => c.key)).toEqual(["d"]);
  });
});

describe("useAuditLogs", () => {
  beforeEach(() => rpcMock.mockReset());

  it("forwards table filter and pagination to RPC", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(
      () =>
        useAuditLogs({
          tables: ["invoices"],
          page: 2,
          pageSize: 50,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith(
      "list_audit_logs_with_user",
      expect.objectContaining({
        p_tables: ["invoices"],
        p_limit: 50,
        p_offset: 50,
      }),
    );
  });

  it("computes total from total_count of first row", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "1",
          table_name: "invoices",
          record_id: null,
          action: "UPDATE",
          user_id: null,
          user_name: null,
          user_email: null,
          old_data: {},
          new_data: {},
          created_at: new Date().toISOString(),
          total_count: 137,
        },
      ],
      error: null,
    });
    const { result } = renderHook(
      () => useAuditLogs({ page: 1, pageSize: 50 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(137);
    expect(result.current.data?.rows.length).toBe(1);
  });
});
