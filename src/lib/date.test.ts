import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDate, formatRelative, isPastDate } from "./date";

describe("formatDate", () => {
  it("formata string YYYY-MM-DD para dd/MM/yyyy (default)", () => {
    expect(formatDate("2026-05-08")).toBe("08/05/2026");
  });

  it("aceita objeto Date", () => {
    const d = new Date("2026-05-08T12:00:00");
    expect(formatDate(d)).toBe("08/05/2026");
  });

  it("retorna fallback vazio para null/undefined", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
  });

  it("aceita fallback customizado", () => {
    expect(formatDate(null, "short", "—")).toBe("—");
  });

  it("retorna fallback para string inválida", () => {
    expect(formatDate("data-invalida")).toBe("");
  });

  it("normaliza timezone (YYYY-MM-DD não desloca para dia anterior)", () => {
    // problema clássico: new Date("2026-05-08") em BRT (-03:00) vira 07/05 21:00
    // formatDate deve sempre dar 08/05 independente do fuso do servidor
    expect(formatDate("2026-05-08")).toBe("08/05/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });

  it("variant 'long' inclui 'às' HH:mm", () => {
    expect(formatDate("2026-05-08", "long")).toMatch(/^08\/05\/2026 às \d{2}:\d{2}$/);
  });

  it("variant 'short-time' formata sem 'às'", () => {
    expect(formatDate("2026-05-08T14:30:00", "short-time")).toBe("08/05/2026 14:30");
  });

  it("variant 'with-seconds' inclui segundos", () => {
    expect(formatDate("2026-05-08T14:30:45", "with-seconds")).toBe("08/05/2026 14:30:45");
  });

  it("variant 'month-year' devolve mês/ano em pt-BR", () => {
    expect(formatDate("2026-05-08", "month-year")).toBe("mai/2026");
  });

  it("variant 'time-only' devolve só HH:mm", () => {
    expect(formatDate("2026-05-08T14:30:00", "time-only")).toBe("14:30");
  });

  it("variant 'iso-date' devolve YYYY-MM-DD", () => {
    expect(formatDate("2026-05-08", "iso-date")).toBe("2026-05-08");
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    // congela "agora" em 2026-05-08 12:00:00 para testes consistentes
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna distância no passado em pt-BR", () => {
    // 3 dias atrás
    expect(formatRelative("2026-05-05T12:00:00")).toContain("3 dias");
  });

  it("retorna distância no futuro em pt-BR", () => {
    // 2 meses no futuro
    const result = formatRelative("2026-07-08T12:00:00");
    expect(result).toContain("meses");
  });

  it("retorna fallback vazio para null", () => {
    expect(formatRelative(null)).toBe("");
  });
});

describe("isPastDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna true para data passada", () => {
    expect(isPastDate("2026-05-07")).toBe(true);
  });

  it("retorna false para hoje", () => {
    expect(isPastDate("2026-05-08")).toBe(false);
  });

  it("retorna false para futuro", () => {
    expect(isPastDate("2026-05-09")).toBe(false);
  });

  it("retorna false para null/undefined", () => {
    expect(isPastDate(null)).toBe(false);
    expect(isPastDate(undefined)).toBe(false);
  });
});
