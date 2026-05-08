import { describe, it, expect } from "vitest";
import {
  computeInvoiceDerivedState,
  canMarkAsPaid,
  canResendNotification,
  canRegenerateBoleto,
  canEmitNfse,
  canCancelInvoice,
  canCancelBoleto,
  canForcePolling,
  getDerivedStateDisplay,
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

describe("computeInvoiceDerivedState", () => {
  it("retorna 'pago' quando status='paid' (prioridade máxima)", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ status: "paid", boleto_status: "erro" }))).toBe("pago");
  });

  it("retorna 'cancelada' quando status='cancelled'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ status: "cancelled" }))).toBe("cancelada");
  });

  it("retorna 'cancelada' quando status='lost'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ status: "lost" }))).toBe("cancelada");
  });

  it("retorna 'renegociada' quando status='renegotiated'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ status: "renegotiated" }))).toBe("renegociada");
  });

  it("retorna 'com_erro' se boleto_status='erro' (prioridade sobre overdue)", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ status: "overdue", boleto_status: "erro" }))).toBe("com_erro");
  });

  it("retorna 'com_erro' se email_status='erro'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ email_status: "erro" }))).toBe("com_erro");
  });

  it("retorna 'com_erro' se nfse_status='erro'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ nfse_status: "erro" }))).toBe("com_erro");
  });

  it("retorna 'em_atraso' quando overdue sem erros", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ status: "overdue", boleto_status: "enviado" }))).toBe("em_atraso");
  });

  it("retorna 'aguardando_geracao' quando boleto_status é null", () => {
    expect(computeInvoiceDerivedState(buildInvoice({}))).toBe("aguardando_geracao");
  });

  it("retorna 'aguardando_geracao' quando boleto_status='pendente'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ boleto_status: "pendente" }))).toBe("aguardando_geracao");
  });

  it("retorna 'aguardando_envio' quando boleto_status='gerado'", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ boleto_status: "gerado" }))).toBe("aguardando_envio");
  });

  it("retorna 'aguardando_pagamento' quando boleto_status='enviado' sem outros sinais", () => {
    expect(computeInvoiceDerivedState(buildInvoice({ boleto_status: "enviado" }))).toBe("aguardando_pagamento");
  });
});

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

describe("canResendNotification", () => {
  it("permite quando boleto gerado e fatura pendente", () => {
    expect(canResendNotification(buildInvoice({ status: "pending", boleto_status: "gerado" })).allowed).toBe(true);
  });
  it("permite quando boleto enviado", () => {
    expect(canResendNotification(buildInvoice({ status: "overdue", boleto_status: "enviado" })).allowed).toBe(true);
  });
  it("permite quando tem boleto_url mesmo se status divergente", () => {
    expect(canResendNotification(buildInvoice({ boleto_url: "https://...", boleto_status: "pendente" })).allowed).toBe(true);
  });
  it("bloqueia quando fatura paga", () => {
    expect(canResendNotification(buildInvoice({ status: "paid", boleto_status: "enviado" })).allowed).toBe(false);
  });
  it("bloqueia quando boleto não foi gerado", () => {
    const r = canResendNotification(buildInvoice({ status: "pending", boleto_status: null }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("não foi gerado");
  });
});

describe("canRegenerateBoleto", () => {
  it("permite mesmo se boleto está com erro", () => {
    expect(canRegenerateBoleto(buildInvoice({ status: "pending", boleto_status: "erro" })).allowed).toBe(true);
  });
  it("permite se já existe boleto gerado (regenera substitui)", () => {
    expect(canRegenerateBoleto(buildInvoice({ status: "pending", boleto_status: "gerado" })).allowed).toBe(true);
  });
  it("bloqueia se fatura paga", () => {
    expect(canRegenerateBoleto(buildInvoice({ status: "paid" })).allowed).toBe(false);
  });
  it("bloqueia se cancelada", () => {
    expect(canRegenerateBoleto(buildInvoice({ status: "cancelled" })).allowed).toBe(false);
  });
});

describe("canEmitNfse", () => {
  it("permite quando NFSe ainda não emitida", () => {
    expect(canEmitNfse(buildInvoice({ status: "paid" })).allowed).toBe(true);
  });
  it("bloqueia se já emitida com numero", () => {
    const r = canEmitNfse(buildInvoice({ status: "paid" }), { status: "autorizada", numero_nfse: "12345" });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("12345");
  });
  it("bloqueia se fatura cancelada", () => {
    expect(canEmitNfse(buildInvoice({ status: "cancelled" })).allowed).toBe(false);
  });
  it("permite se nfseInfo presente mas SEM numero (status=erro)", () => {
    expect(canEmitNfse(buildInvoice({ status: "pending" }), { status: "erro", numero_nfse: null }).allowed).toBe(true);
  });
});

describe("canCancelInvoice", () => {
  it("permite quando pendente", () => {
    expect(canCancelInvoice(buildInvoice({ status: "pending" })).allowed).toBe(true);
  });
  it("bloqueia quando paga", () => {
    expect(canCancelInvoice(buildInvoice({ status: "paid" })).allowed).toBe(false);
  });
  it("bloqueia se já cancelada", () => {
    expect(canCancelInvoice(buildInvoice({ status: "cancelled" })).allowed).toBe(false);
  });
  it("bloqueia se renegociada", () => {
    expect(canCancelInvoice(buildInvoice({ status: "renegotiated" })).allowed).toBe(false);
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

describe("canForcePolling", () => {
  it("permite se tem boleto e pendente", () => {
    expect(canForcePolling(buildInvoice({ status: "pending", boleto_url: "https://..." })).allowed).toBe(true);
  });
  it("bloqueia se paga", () => {
    expect(canForcePolling(buildInvoice({ status: "paid", boleto_url: "https://..." })).allowed).toBe(false);
  });
  it("bloqueia se sem boleto_url", () => {
    expect(canForcePolling(buildInvoice({ status: "pending" })).allowed).toBe(false);
  });
});

describe("getDerivedStateDisplay", () => {
  it("retorna label e variant para todos os 8 estados", () => {
    const states = [
      "aguardando_geracao", "aguardando_envio", "aguardando_pagamento",
      "pago", "em_atraso", "cancelada", "renegociada", "com_erro",
    ] as const;
    states.forEach((s) => {
      const display = getDerivedStateDisplay(s);
      expect(display.label).toBeTruthy();
      expect(display.variant).toBeTruthy();
    });
  });
});
