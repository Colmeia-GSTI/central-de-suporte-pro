/**
 * Regression test for /billing/delinquency.
 *
 * The page crashed in production because the supabase embed
 * `clients(...)` could come back as an array OR as a single object,
 * and the original code accessed `.id` / `.name` directly on it.
 *
 * These tests cover the 3 shapes (array, object, null) and assert
 * that the page never crashes and behaves as expected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { createSupabaseMock } from "@/test/mocks/supabase";

// Hoisted mock holder so the vi.mock factory can reach it.
const mocks = vi.hoisted(() => {
  return { fromImpl: vi.fn() };
});

// Mock the supabase singleton BEFORE importing the page.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.fromImpl,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  },
}));

// Mock useAuth so the page does not need a real session.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-user", email: "test@example.com" }, loading: false }),
}));

// AppLayout pulls in too many providers — stub it.
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// recharts requires real DOM measurements — stub the wrapper to avoid noise.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

import DelinquencyReportPage from "@/pages/billing/DelinquencyReportPage";

// Remove unused symbol warning by referencing types
type _UnusedClient = typeof sampleClient;

const baseInvoice = {
  id: "inv-1",
  invoice_number: 100,
  amount: 250,
  due_date: "2025-01-01",
  status: "overdue",
  installment_number: null,
  total_installments: null,
};

const sampleClient = {
  id: "client-1",
  name: "ACME Corp",
  email: "billing@acme.com",
  financial_email: null,
  whatsapp: null,
  phone: null,
};

function configureInvoicesResponse(data: unknown) {
  const { client } = createSupabaseMock({ tables: { invoices: { data, error: null } } });
  mocks.fromImpl.mockImplementation(client.from as never);
}

describe("DelinquencyReportPage — embed shape resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not crash when embed `clients` is an ARRAY and lists the client", async () => {
    configureInvoicesResponse([{ ...baseInvoice, clients: [sampleClient] }]);

    renderWithProviders(<DelinquencyReportPage />);

    await waitFor(() => {
      expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Algo deu errado/i)).not.toBeInTheDocument();
  });

  it("does not crash when embed `clients` is a single OBJECT and lists the client", async () => {
    configureInvoicesResponse([{ ...baseInvoice, clients: sampleClient }]);

    renderWithProviders(<DelinquencyReportPage />);

    await waitFor(() => {
      expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Algo deu errado/i)).not.toBeInTheDocument();
  });

  it("discards invoice and warns when embed `clients` is NULL", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    configureInvoicesResponse([{ ...baseInvoice, clients: null }]);

    renderWithProviders(<DelinquencyReportPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Nenhum cliente inadimplente encontrado/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("ACME Corp")).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("DelinquencyReport"),
      expect.anything(),
    );
    expect(screen.queryByText(/Algo deu errado/i)).not.toBeInTheDocument();
    warnSpy.mockRestore();
  });
});
