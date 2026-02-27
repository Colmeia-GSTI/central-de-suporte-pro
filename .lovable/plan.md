
# Plano: Corrigir Geracao de Faturas com Vencimento Retroativo

## Causa Raiz Identificada

O contrato "Cloud BSSoft" (Via Piana) foi criado em **26/02/2026**, com `billing_day = 7` e `days_before_due = 5`. O CRON `generate-invoices-daily` roda **todos os dias as 11:00 UTC** e gera faturas para **todos** os contratos ativos do mes corrente, sem verificar se o vencimento ja passou.

Resultado: fatura criada dia 26/02 com vencimento 07/02 (19 dias no passado), boleto gerado automaticamente e enviado ao cliente com data vencida.

## Problema no Codigo (linha 286-290 de `generate-monthly-invoices`)

```text
const billingDay = contract.billing_day || 10;
const dueDate = `${referenceMonth}-${String(actualBillingDay).padStart(2, "0")}`;
```

Nao existe nenhuma verificacao de:
1. Se o vencimento ja passou
2. Se o `days_before_due` deveria funcionar como gate de quando gerar
3. Se deveria pular para o proximo mes

## Correcao Escolhida: Gerar para o Proximo Mes

Quando o vencimento do mes corrente ja passou, a fatura sera gerada para o **proximo mes** automaticamente.

## Alteracoes

### 1. Edge Function `generate-monthly-invoices`

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`

Apos calcular o `dueDate` (linha 290), adicionar logica de verificacao:

```text
// Apos calcular dueDate
const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

if (dueDate < todayStr) {
  // Vencimento ja passou - gerar para o proximo mes
  let nextMonth = targetMonth + 1;
  let nextYear = targetYear;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const nextReferenceMonth = `${nextYear}-${String(nextMonth).padStart(2,'0')}`;

  // Verificar se ja existe fatura para o proximo mes
  const { data: nextExisting } = await supabase
    .from("invoices")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("reference_month", nextReferenceMonth)
    .not("status", "in", '("cancelled","voided")')
    .limit(1);

  if (nextExisting && nextExisting.length > 0) {
    // Ja existe fatura para o proximo mes, pular
    skipped++;
    continue;
  }

  // Recalcular dueDate para o proximo mes
  referenceMonth = nextReferenceMonth;
  dueDate = `${nextReferenceMonth}-${String(actualBillingDay).padStart(2,'0')}`;
}
```

### 2. Corrigir fatura existente do Via Piana

A fatura #52 (id: `56b31cf1-3fa1-4728-b4b3-8c9470bf7c2b`) foi criada com `reference_month: 2026-02` e vencimento `2026-02-07`. Como o contrato foi criado em 26/02, esta fatura deveria ser de marco. Porem, como envolve cancelamento de boleto ja registrado no Banco Inter, esta acao deve ser feita **manualmente pelo financeiro** (cancelar boleto, cancelar fatura, e gerar nova para marco).

### 3. Log de auditoria para faturas com mes avancado

Adicionar log quando o sistema avanca para o proximo mes, para que o financeiro tenha visibilidade:

```text
console.log(`[GEN-INVOICES] Vencimento ${dueDate} já passou para ${contract.name}. Avançando para ${nextReferenceMonth}`);

await logToDatabase(supabase, "info", "Billing", "generate-monthly-invoices",
  `Vencimento retroativo detectado para ${contract.name}. Fatura avançada para ${nextReferenceMonth}`,
  { contract_id: contract.id, original_due: dueDate, new_reference: nextReferenceMonth },
  undefined, executionId
);
```

## Detalhes Tecnicos

### Arquivo Modificado

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/generate-monthly-invoices/index.ts` | Adicionar verificacao de vencimento retroativo apos linha 290, avancar para proximo mes quando necessario |

### Impacto no Banco

Nenhum. Apenas logica na Edge Function.

### Cenarios Cobertos

| Cenario | Comportamento |
|---|---|
| Contrato criado dia 1, billing_day 10 | Fatura gerada normalmente para o mes corrente |
| Contrato criado dia 26, billing_day 7 | Fatura gerada para o **proximo mes** |
| Contrato criado dia 5, billing_day 5 | Fatura gerada para o mes corrente (vencimento = hoje) |
| CRON roda dia 8, billing_day 7, fatura ja existe | Skipped (check de duplicidade existente ja cobre) |
