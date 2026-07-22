import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  NFSE_BLOCKING_STATUSES,
  shouldBlockNewEmission,
  normalizeServiceCode,
  parseStatusDescription,
  normalizeCompetencia,
  extractStreetFromAddress,
  extractNumberFromAddress,
} from "./logic.ts";

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

Deno.test("normalizeServiceCode: remove pontuação e PRESERVA zeros à esquerda", () => {
  assertEquals(normalizeServiceCode("01.07.01"), "010701");
  assertEquals(normalizeServiceCode("010701"), "010701");
  assertEquals(normalizeServiceCode(" 1 - 2 . 3 "), "123");
});

Deno.test("parseStatusDescription: null -> erro desconhecido", () => {
  assertEquals(parseStatusDescription(null), {
    codigo: null,
    descricao: "Erro desconhecido",
    acao: null,
    knownError: null,
  });
});

Deno.test("parseStatusDescription: código conhecido E0014", () => {
  const r = parseStatusDescription("Código: E0014\r\nDescrição: NFS-e duplicada");
  assertEquals(r.codigo, "E0014");
  assertEquals(r.descricao, "NFS-e duplicada");
  assertEquals(r.knownError?.code, "DPS_DUPLICADA");
  assertEquals(typeof r.acao, "string");
});

Deno.test("parseStatusDescription: código desconhecido -> sem knownError/ação", () => {
  const r = parseStatusDescription("Código: E9999\nDescrição: outro erro");
  assertEquals(r.codigo, "E9999");
  assertEquals(r.knownError, null);
  assertEquals(r.acao, null);
});

Deno.test("normalizeCompetencia: formatos de data", () => {
  assertEquals(normalizeCompetencia("2026-07-15"), "2026-07-15"); // já completo
  assertEquals(normalizeCompetencia("2026-07"), "2026-07-01");     // mês -> dia 01
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(normalizeCompetencia("lixo")), true); // fallback = hoje
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(normalizeCompetencia()), true);       // sem arg = hoje
});

Deno.test("extractStreetFromAddress / extractNumberFromAddress", () => {
  assertEquals(extractStreetFromAddress("RUA X, 123"), "RUA X");
  assertEquals(extractStreetFromAddress("RUA SEM NUMERO"), "RUA SEM NUMERO");
  assertEquals(extractNumberFromAddress("RUA X, 123"), "123");
  assertEquals(extractNumberFromAddress("RUA X, 123 - APTO 4"), "123");
  assertEquals(extractNumberFromAddress("RUA SEM NUMERO"), null);
});
