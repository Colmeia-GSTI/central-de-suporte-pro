import { describe, it, expect } from "vitest";
import {
  resolveMergedFields,
  previewMerge,
  MERGEABLE_FIELDS,
} from "@/lib/client-merge";

describe("client-merge: resolveMergedFields", () => {
  it("estratégia B: destino prevalece quando preenchido", () => {
    const source = { name: "Alpha", email: "a@a.com", phone: "111" };
    const target = { name: "Beta", email: "b@b.com", phone: "222" };
    const result = resolveMergedFields(source, target);
    // Nenhum campo muda — destino prevalece
    expect(result).toEqual({});
  });

  it("estratégia B: campo NULL no destino recebe do source", () => {
    const source = { name: "Alpha", email: "a@a.com", phone: "111" };
    const target = { name: "Beta", email: null, phone: "" };
    const result = resolveMergedFields(source, target);
    expect(result).toEqual({ email: "a@a.com", phone: "111" });
  });

  it("estratégia A: overrides explícitos sempre prevalecem", () => {
    const source = { name: "Alpha", email: "a@a.com" };
    const target = { name: "Beta", email: "b@b.com" };
    const result = resolveMergedFields(source, target, {
      email: "custom@example.com",
    });
    expect(result.email).toBe("custom@example.com");
  });

  it("mistura: override + B fill-null", () => {
    const source = { name: "Alpha", email: "a@a.com", phone: "111" };
    const target = { name: "Beta", email: null, phone: "222" };
    const result = resolveMergedFields(source, target, { name: "Custom" });
    expect(result.name).toBe("Custom");
    expect(result.email).toBe("a@a.com");
    expect(result.phone).toBeUndefined();
  });

  it("não copia se ambos vazios", () => {
    const result = resolveMergedFields({ city: "" }, { city: null });
    expect(result.city).toBeUndefined();
  });
});

describe("client-merge: previewMerge", () => {
  it("retorna uma linha por campo mergeável", () => {
    const result = previewMerge({}, {});
    expect(result).toHaveLength(MERGEABLE_FIELDS.length);
  });

  it("marca conflict quando ambos preenchidos com valores diferentes", () => {
    const rows = previewMerge({ email: "a@a.com" }, { email: "b@b.com" });
    const emailRow = rows.find((r) => r.field === "email")!;
    expect(emailRow.conflict).toBe(true);
    expect(emailRow.origin).toBe("target");
    expect(emailRow.finalValue).toBe("b@b.com");
  });

  it("marca origin=source quando destino vazio", () => {
    const rows = previewMerge({ phone: "111" }, { phone: null });
    const row = rows.find((r) => r.field === "phone")!;
    expect(row.origin).toBe("source");
    expect(row.finalValue).toBe("111");
  });

  it("marca origin=override quando override fornecido", () => {
    const rows = previewMerge({ name: "A" }, { name: "B" }, { name: "C" });
    const row = rows.find((r) => r.field === "name")!;
    expect(row.origin).toBe("override");
    expect(row.finalValue).toBe("C");
  });
});
