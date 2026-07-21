import { describe, it, expect } from "vitest";
import { previewMerge, MERGEABLE_FIELDS } from "@/lib/client-merge";

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
