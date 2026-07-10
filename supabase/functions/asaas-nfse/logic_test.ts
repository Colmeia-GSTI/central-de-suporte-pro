import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { NFSE_BLOCKING_STATUSES, shouldBlockNewEmission } from "./logic.ts";

const INV = "11111111-1111-1111-1111-111111111111";
const HIST = "22222222-2222-2222-2222-222222222222";

Deno.test("bloqueia emissão nova quando fatura tem nota viva", () => {
  for (const status of NFSE_BLOCKING_STATUSES) {
    assertEquals(shouldBlockNewEmission({ invoice_id: INV }, status), true, status);
  }
});

Deno.test("não bloqueia sem nota viva (erro/cancelada/substituida/inexistente)", () => {
  for (const status of ["erro", "cancelada", "substituida", null]) {
    assertEquals(shouldBlockNewEmission({ invoice_id: INV }, status), false, String(status));
  }
});

Deno.test("bypass: reemissão com nfse_history_id", () => {
  assertEquals(shouldBlockNewEmission({ invoice_id: INV, nfse_history_id: HIST }, "autorizada"), false);
});

Deno.test("bypass: force_new_emission (substituição pós-cancelamento)", () => {
  assertEquals(shouldBlockNewEmission({ invoice_id: INV, force_new_emission: true }, "autorizada"), false);
});

Deno.test("sem invoice_id (avulsa) não bloqueia", () => {
  assertEquals(shouldBlockNewEmission({}, "autorizada"), false);
  assertEquals(shouldBlockNewEmission({ invoice_id: null }, "autorizada"), false);
});

Deno.test("predicado do índice único: exatamente os 3 status vivos", () => {
  assertEquals([...NFSE_BLOCKING_STATUSES], ["autorizada", "processando", "pendente"]);
});
