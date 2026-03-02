
# Causa Raiz: NFS-e autorizada mas fatura continua "processando"

## Problema

O webhook do Asaas (`webhook-asaas-nfse`) atualiza corretamente a tabela `nfse_history` quando a NFS-e e autorizada (status "autorizada"), mas **nao sincroniza** o campo `invoices.nfse_status`. Isso significa que:

1. A Edge Function `asaas-nfse` emite a NFS-e e define `invoices.nfse_status = "processando"`
2. O Asaas processa e envia webhook com `AUTHORIZED`
3. O webhook atualiza `nfse_history.status = "autorizada"` -- OK
4. **Mas `invoices.nfse_status` permanece como "processando"** -- BUG

Resultado: os indicadores visuais na listagem de faturas nao refletem que a NFS-e foi autorizada.

## Evidencia

- A busca por `nfse_status` no arquivo `webhook-asaas-nfse/index.ts` retorna **zero resultados**
- A funcao `processInvoiceWebhook` atualiza apenas `nfse_history`, nunca `invoices`
- Dados reais confirmam: NFS-e #120 esta "autorizada" em `nfse_history`, mas a fatura correspondente ainda mostra indicador de NFS-e pendente

## Solucao

### Arquivo: `supabase/functions/webhook-asaas-nfse/index.ts`

Na funcao `processInvoiceWebhook`, apos atualizar `nfse_history` com sucesso, sincronizar `invoices.nfse_status`:

1. **Quando status = AUTHORIZED**: Atualizar `invoices.nfse_status = "gerada"` e `invoices.nfse_error_msg = null`
2. **Quando status = ERROR ou CANCELLATION_DENIED**: Atualizar `invoices.nfse_status = "erro"` e `invoices.nfse_error_msg` com a descricao do erro
3. **Quando status = CANCELED**: Atualizar `invoices.nfse_status = null` (limpar)

A sincronizacao usara o campo `nfseRecord.invoice_id` que ja esta disponivel na query existente.

### Codigo a adicionar (apos o bloco de update do nfse_history):

```text
// Sincronizar invoices.nfse_status
if (nfseRecord.invoice_id) {
  const invoiceUpdate = {};
  if (invoiceStatus === "AUTHORIZED") {
    invoiceUpdate.nfse_status = "gerada";
    invoiceUpdate.nfse_error_msg = null;
    invoiceUpdate.nfse_generated_at = new Date().toISOString();
  } else if (invoiceStatus === "ERROR" || invoiceStatus === "CANCELLATION_DENIED") {
    invoiceUpdate.nfse_status = "erro";
    invoiceUpdate.nfse_error_msg = errorDescription;
  } else if (invoiceStatus === "CANCELED") {
    invoiceUpdate.nfse_status = null;
    invoiceUpdate.nfse_error_msg = null;
  }
  await supabase.from("invoices").update(invoiceUpdate).eq("id", nfseRecord.invoice_id);
}
```

### Impacto

- Corrige a dessincronia entre `nfse_history` e `invoices`
- Os indicadores visuais (badges NFS-e) na listagem de faturas passarao a refletir o estado real
- Notas autorizadas via webhook mostrarao status correto imediatamente

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/webhook-asaas-nfse/index.ts` | Adicionar sincronizacao de `invoices.nfse_status` na funcao `processInvoiceWebhook` |
