import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPaymentSectionHtml } from "./email-helpers.ts";

Deno.test("buildPaymentSectionHtml: vazio quando não há boleto nem PIX", () => {
  assertEquals(buildPaymentSectionHtml({}), "");
  assertEquals(buildPaymentSectionHtml({ boletoUrl: "", boletoBarcode: "", pixCode: "" }), "");
  assertEquals(buildPaymentSectionHtml({ boletoUrl: null, boletoBarcode: null, pixCode: null }), "");
});

Deno.test("buildPaymentSectionHtml: boleto PDF + linha digitável", () => {
  const html = buildPaymentSectionHtml({ boletoUrl: "https://x/b.pdf", boletoBarcode: "34191..." });
  assertStringIncludes(html, "Boleto Bancário");
  assertStringIncludes(html, "https://x/b.pdf");
  assertStringIncludes(html, "34191...");
});

Deno.test("buildPaymentSectionHtml: só linha digitável (sem URL) ainda mostra boleto", () => {
  const html = buildPaymentSectionHtml({ boletoBarcode: "34191..." });
  assertStringIncludes(html, "Linha Digitável");
  assertEquals(html.includes("Visualizar Boleto PDF"), false);
});

Deno.test("buildPaymentSectionHtml: PIX copia e cola", () => {
  const html = buildPaymentSectionHtml({ pixCode: "00020126..." });
  assertStringIncludes(html, "PIX Copia e Cola");
  assertStringIncludes(html, "00020126...");
});

Deno.test("buildPaymentSectionHtml: boleto + PIX juntos (e-mail consolidado)", () => {
  const html = buildPaymentSectionHtml({ boletoUrl: "https://x/b.pdf", pixCode: "00020126..." });
  assertStringIncludes(html, "Boleto Bancário");
  assertStringIncludes(html, "PIX Copia e Cola");
});
