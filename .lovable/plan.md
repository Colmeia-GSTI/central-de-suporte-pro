
# Correcao Definitiva: Garantir municipal_service_code em TODAS as Emissoes de NFS-e

## Diagnostico Completo

Existem **11 pontos no codigo** que invocam `asaas-nfse` com action `emit`. Desses, **5 NAO passam o `municipal_service_code`**:

| Arquivo | Passa codigo? |
|---------|---------------|
| `generate-monthly-invoices/index.ts` | SIM (corrigido recentemente) |
| `batch-process-invoices/index.ts` | SIM |
| `EmitNfseDialog.tsx` | SIM |
| `NfseDetailsSheet.tsx` | SIM |
| **`manual-payment/index.ts`** | NAO |
| **`webhook-asaas-nfse/index.ts`** | NAO |
| **`useInvoiceActions.ts` (emitComplete)** | NAO |
| **`BillingNfseTab.tsx` (quickReprocess)** | NAO |
| **`NfseActionsMenu.tsx` (resend)** | NAO |

Corrigir cada chamador individualmente e fragil -- qualquer nova chamada no futuro pode repetir o erro. A solucao correta e fazer a funcao `asaas-nfse` resolver o codigo automaticamente a partir do contrato quando nao for fornecido.

## Solucao: Auto-resolve no `asaas-nfse`

### Mudanca 1 (principal): `supabase/functions/asaas-nfse/index.ts`

No bloco `case "emit"`, entre o passo 1 (ensureCustomerSync) e o passo 2 (resolve municipal service ID), adicionar logica de fallback:

```text
// AUTO-RESOLVE: Se municipal_service_code nao foi fornecido,
// buscar do contrato vinculado (contract_id ou via invoice_id)
let effectiveServiceCode = municipal_service_code;

if (!effectiveServiceCode && !municipal_service_id) {
  // Tentar via contract_id direto
  if (contract_id) {
    const { data: contract } = await supabase
      .from("contracts")
      .select("nfse_service_code")
      .eq("id", contract_id)
      .single();
    if (contract?.nfse_service_code) {
      effectiveServiceCode = contract.nfse_service_code;
      log(correlationId, "info", "municipal_service_code resolvido do contrato", {
        contract_id, code: effectiveServiceCode
      });
    }
  }

  // Tentar via invoice -> contract
  if (!effectiveServiceCode && invoice_id) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("contract_id, contracts(nfse_service_code)")
      .eq("id", invoice_id)
      .single();
    if (invoice?.contracts?.nfse_service_code) {
      effectiveServiceCode = invoice.contracts.nfse_service_code;
      log(correlationId, "info", "municipal_service_code resolvido via fatura->contrato", {
        invoice_id, code: effectiveServiceCode
      });
    }
  }

  // Tentar via nfse_history -> contract
  if (!effectiveServiceCode && nfse_history_id) {
    const { data: history } = await supabase
      .from("nfse_history")
      .select("contract_id, codigo_tributacao")
      .eq("id", nfse_history_id)
      .single();
    if (history?.codigo_tributacao) {
      effectiveServiceCode = history.codigo_tributacao;
    } else if (history?.contract_id) {
      const { data: c } = await supabase
        .from("contracts")
        .select("nfse_service_code")
        .eq("id", history.contract_id)
        .single();
      if (c?.nfse_service_code) effectiveServiceCode = c.nfse_service_code;
    }
  }
}
```

Depois, substituir todas as referencias a `municipal_service_code` no restante do bloco por `effectiveServiceCode`.

Isso garante que **qualquer chamador** -- atual ou futuro -- que passe `contract_id`, `invoice_id` ou `nfse_history_id` tera o codigo resolvido automaticamente.

### Mudanca 2 (retry): `supabase/functions/generate-monthly-invoices/index.ts`

Adicionar bloco de retry apos o loop de geracao de faturas:

```text
// RETRY: Reemitir NFS-e para faturas do mes com nfse_status = 'erro'
const { data: failedNfseInvoices } = await supabase
  .from("invoices")
  .select("id, client_id, contract_id, amount, contracts(nfse_service_code, ...)")
  .eq("reference_month", referenceMonth)
  .eq("nfse_status", "erro")
  .not("contract_id", "is", null);

for (const inv of failedNfseInvoices) {
  // Marcar nfse_history antigos sem asaas_invoice_id como 'substituida'
  await supabase.from("nfse_history")
    .update({ status: "substituida" })
    .eq("invoice_id", inv.id)
    .is("asaas_invoice_id", null)
    .eq("status", "erro");

  // Reemitir (o auto-resolve da Mudanca 1 cuida do codigo)
  await supabase.functions.invoke("asaas-nfse", {
    body: {
      action: "emit",
      client_id: inv.client_id,
      invoice_id: inv.id,
      contract_id: inv.contract_id,
      value: inv.amount,
      municipal_service_code: inv.contracts?.nfse_service_code,
    }
  });

  // Atualizar status da fatura
  await supabase.from("invoices")
    .update({ nfse_status: "processando" })
    .eq("id", inv.id);
}
```

### Mudanca 3 (correcao pontual): `supabase/functions/webhook-asaas-nfse/index.ts`

Na auto-emissao de NFS-e apos pagamento (linha 378), adicionar `municipal_service_code`:

```text
// Antes (faltava):
body: {
  action: "emit",
  client_id: ...,
  // sem municipal_service_code
}

// Depois:
body: {
  action: "emit",
  client_id: ...,
  municipal_service_code: contract.nfse_service_code,  // JA buscado na query
}
```

### Mudanca 4 (correcao pontual): `supabase/functions/manual-payment/index.ts`

Adicionar `nfse_service_code` ao select do contrato e passar no body:

```text
// Select: adicionar nfse_service_code
.select("name, description, nfse_descricao_customizada, nfse_service_code")

// Body: adicionar
municipal_service_code: contract?.nfse_service_code,
```

### Mudanca 5 (frontend): `src/hooks/useInvoiceActions.ts`

Adicionar `nfse_service_code` ao select do contrato e passar no body da emissao NFS-e no fluxo "emitComplete".

### Mudanca 6 (frontend): `src/components/nfse/NfseActionsMenu.tsx`

Na mutation de resend, passar `municipal_service_code` usando `nfse.codigo_tributacao`.

### Mudanca 7 (frontend): `src/components/billing/BillingNfseTab.tsx`

No `handleQuickReprocess`, passar `municipal_service_code` a partir do registro de NFS-e ou contrato vinculado.

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/asaas-nfse/index.ts` | Auto-resolve de municipal_service_code via contract/invoice/history |
| `supabase/functions/generate-monthly-invoices/index.ts` | Bloco de retry para NFS-e com erro |
| `supabase/functions/webhook-asaas-nfse/index.ts` | Passar municipal_service_code na auto-emissao |
| `supabase/functions/manual-payment/index.ts` | Passar municipal_service_code |
| `src/hooks/useInvoiceActions.ts` | Passar municipal_service_code no emitComplete |
| `src/components/nfse/NfseActionsMenu.tsx` | Passar codigo_tributacao no resend |
| `src/components/billing/BillingNfseTab.tsx` | Passar codigo no quickReprocess |

## Resultado

| Cenario | Antes | Depois |
|---------|-------|--------|
| Qualquer chamador sem codigo | Erro MISSING_MUNICIPAL_SERVICE_CODE | Auto-resolve do contrato |
| Pagamento manual com NFS-e | Falha silenciosa | Codigo resolvido automaticamente |
| Webhook de pagamento + auto-NFS-e | Codigo nao enviado | Codigo passado do contrato |
| Reprocessamento rapido | Falha por falta de codigo | Resolve via nfse_history ou contrato |
| Notas presas com erro | Ficam presas eternamente | Retry automatico no proximo CRON |
| Futuras chamadas | Precisam lembrar de passar | Auto-resolve como safety net |
