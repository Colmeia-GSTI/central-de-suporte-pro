

# Plano Revisado e Completo -- Correcoes do Faturamento

O plano anterior cobre 3 dos 5 problemas reais. Esta revisao adiciona os cenarios que estavam faltando para garantir cobertura total em todos os fluxos (contrato, avulsa, retry, polling).

---

## Problemas Descobertos (Alem dos 4 Originais)

### Problema 5: `emit_standalone` tem o mesmo bug de match exato no codigo de servico
A linha 949 do `asaas-nfse/index.ts` faz `s.code === service_code` -- identico ao bug da linha 727. Se o Asaas retorna `01.07.01` e o sistema envia `010701`, nao encontra match.

### Problema 6: `emit` e `emit_standalone` usam campos diferentes no payload
- `emit` usa `municipalServiceExternalId` (linha 799)
- `emit_standalone` usa `municipalServiceCode` (linha 1022)
- Essa inconsistencia causa comportamentos diferentes de erro entre os dois fluxos

### Problema 7: `emit` nao salva `codigo_tributacao` no `nfse_history`
O `emit_standalone` salva (linha 974), mas o `emit` nao. Isso quebra a cadeia de auto-resolve em retries, pois `nfse_history.codigo_tributacao` estara NULL para notas de contrato.

### Problema 8: Retry so cobre NFS-e de contratos
A query de retry (linha 661) usa `.not("contract_id", "is", null)`, ignorando faturas avulsas com NFS-e em erro.

### Problema 9: `poll-services` nao captura boletos com status `overdue`
Faturas que transicionaram para `overdue` antes de ter o barcode preenchido ficam permanentemente orfas.

---

## Plano Completo de Correcoes (9 itens)

### Correcao 1: Normalizar match de codigo de servico (CRITICO)
**Arquivo:** `supabase/functions/asaas-nfse/index.ts`
**Linhas:** 726-728 (emit) e 949-951 (emit_standalone)

Criar funcao utilitaria `normalizeServiceCode(code)` que remove pontos, espacos e zeros a esquerda. Usar em ambos os fluxos:
```text
function normalizeServiceCode(code: string): string {
  return code.replace(/[.\s-]/g, "").replace(/^0+/, "");
}

// Match: comparar normalizado de ambos os lados
const matchedService = services.find(s => 
  normalizeServiceCode(s.code) === normalizeServiceCode(effectiveServiceCode)
);
```

Se nenhum match for encontrado, logar todos os codigos disponiveis para diagnostico.

### Correcao 2: Nao sobrescrever `boleto_status` prematuramente (ALTO)
**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`
**Linha:** 453

Mudar de `boleto_status: "gerado"` para condicional:
- Se o `banco-inter` ja definiu o status (via update anterior), nao sobrescrever
- Alterar para `boleto_status: "processando"` (status intermediario que o `poll-services` captura)

### Correcao 3: `poll-services` capturar boletos orfaos (ALTO)
**Arquivo:** `supabase/functions/poll-services/index.ts`
**Linhas:** 135-142

Ajustar query para incluir:
- `boleto_barcode IS NULL`
- `status IN ('pending', 'overdue')` (ao inves de so `pending`)
- Remover filtro por `boleto_status` -- confiar apenas em `boleto_barcode IS NULL`

### Correcao 4: Padronizar campo do payload entre `emit` e `emit_standalone` (MEDIO)
**Arquivo:** `supabase/functions/asaas-nfse/index.ts`
**Linhas:** 793-801 (emit) e 1017-1024 (emit_standalone)

Ambos devem usar a mesma logica:
1. Se tem `municipalServiceId` resolvido --> usar `municipalServiceId`
2. Se nao tem --> rejeitar com erro claro (MISSING_MUNICIPAL_SERVICE_CODE)

Nao usar `municipalServiceExternalId` nem `municipalServiceCode` como fallback -- esses campos causam rejeicao silenciosa pela API Asaas.

### Correcao 5: Salvar `codigo_tributacao` no `nfse_history` para o fluxo `emit` (MEDIO)
**Arquivo:** `supabase/functions/asaas-nfse/index.ts`
**Linha:** ~743 (dentro do insert de nfse_history no emit)

Adicionar `codigo_tributacao: effectiveServiceCode || null` ao insert, garantindo que retries futuros possam resolver o codigo via historico.

### Correcao 6: Retry incluir faturas avulsas (MEDIO)
**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`
**Linha:** 661

Remover `.not("contract_id", "is", null)` e ajustar a logica de retry para:
- Se tem `contract_id` --> buscar codigo do contrato (logica atual)
- Se nao tem `contract_id` --> buscar codigo do `processing_metadata` ou do `nfse_history.codigo_tributacao`

### Correcao 7: `banco-inter` migrar para `Deno.serve` (BAIXO)
**Arquivo:** `supabase/functions/banco-inter/index.ts`
Substituir `serve()` por `Deno.serve()`.

### Correcao 8: `poll-services` migrar para `Deno.serve` (BAIXO)
**Arquivo:** `supabase/functions/poll-services/index.ts`
Substituir `serve()` por `Deno.serve()`.

### Correcao 9: Log de diagnostico quando match falha (BAIXO)
**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Quando `matchedService` for null, logar a lista completa de codigos retornados pela API para facilitar troubleshooting futuro:
```text
log(correlationId, "warn", "Nenhum match encontrado para codigo de servico", {
  codigo_enviado: effectiveServiceCode,
  codigos_disponiveis: services.map(s => s.code).slice(0, 20),
});
```

---

## Resumo de Arquivos Alterados

| Arquivo | Correcoes |
|---------|-----------|
| `supabase/functions/asaas-nfse/index.ts` | #1 (normalizar match), #4 (padronizar payload), #5 (salvar codigo_tributacao), #9 (log diagnostico) |
| `supabase/functions/generate-monthly-invoices/index.ts` | #2 (boleto_status), #6 (retry avulsas) |
| `supabase/functions/poll-services/index.ts` | #3 (query orfaos), #8 (Deno.serve) |
| `supabase/functions/banco-inter/index.ts` | #7 (Deno.serve) |

## Cobertura de Cenarios

| Cenario | Coberto? |
|---------|----------|
| NFS-e de contrato -- emissao | Sim (correcoes 1, 4, 5, 9) |
| NFS-e avulsa -- emissao | Sim (correcoes 1, 4, 9) |
| NFS-e de contrato -- retry | Sim (correcoes 1, 5) |
| NFS-e avulsa -- retry | Sim (correcao 6) |
| Boleto de contrato -- emissao | Sim (correcao 2) |
| Boleto de contrato -- polling | Sim (correcao 3) |
| Boleto avulso -- polling | Sim (correcao 3) |
| Boleto com status overdue -- polling | Sim (correcao 3) |
| Diagnostico de erros futuros | Sim (correcao 9) |

