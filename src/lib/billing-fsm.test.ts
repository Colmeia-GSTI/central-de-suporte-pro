import { describe, it, expect } from "vitest";
import {
  canMarkAsPaid,
  canCancelBoleto,
} from "./billing-fsm";

// Factory mínima — só os campos relevantes para a FSM
const buildInvoice = (overrides: Partial<{
  status: string;
  boleto_status: string | null;
  email_status: string | null;
  nfse_status: string | null;
  boleto_url: string | null;
}>) => ({
  status: "pending",
  boleto_status: null,
  email_status: null,
  nfse_status: null,
  boleto_url: null,
  ...overrides,
}) as any;

describe("canMarkAsPaid", () => {
  it("permite quando pendente", () => {
    expect(canMarkAsPaid(buildInvoice({ status: "pending" }))).toEqual({ allowed: true });
  });
  it("permite quando overdue", () => {
    expect(canMarkAsPaid(buildInvoice({ status: "overdue" }))).toEqual({ allowed: true });
  });
  it("bloqueia quando paga", () => {
    const r = canMarkAsPaid(buildInvoice({ status: "paid" }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("já está paga");
  });
  it("bloqueia quando cancelada", () => {
    expect(canMarkAsPaid(buildInvoice({ status: "cancelled" })).allowed).toBe(false);
  });
  it("bloqueia quando renegociada", () => {
    expect(canMarkAsPaid(buildInvoice({ status: "renegotiated" })).allowed).toBe(false);
  });
});

describe("canCancelBoleto", () => {
  it("permite se tem boleto e fatura não paga", () => {
    expect(canCancelBoleto(buildInvoice({ status: "pending", boleto_url: "https://..." })).allowed).toBe(true);
  });
  it("bloqueia se fatura paga", () => {
    expect(canCancelBoleto(buildInvoice({ status: "paid", boleto_url: "https://..." })).allowed).toBe(false);
  });
  it("bloqueia se não tem boleto_url", () => {
    expect(canCancelBoleto(buildInvoice({ status: "pending" })).allowed).toBe(false);
  });
});
