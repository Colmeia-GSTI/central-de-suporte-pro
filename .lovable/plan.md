

# Correção: Erro "Cannot read properties of undefined (reading 'length')" ao Faturar Agora

## Causa Raiz

O componente `BillingBatchProcessing` espera as props:
- `selectedInvoiceIds: string[]`
- `selectedInvoiceCount: number`

Mas o `BillingInvoicesTab` passa:
- `selectedInvoices={selectedInvoicesData}` (prop inexistente no componente)

Resultado: `selectedInvoiceIds` fica `undefined`, e ao acessar `.length` (linha 75 do BillingBatchProcessing), o erro ocorre.

## Correção

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linha 693-694)

Alterar a chamada do componente para passar as props corretas:

```text
// DE:
<BillingBatchProcessing
  selectedInvoices={selectedInvoicesData}
  open={isBatchProcessingOpen}
  onOpenChange={setIsBatchProcessingOpen}
/>

// PARA:
<BillingBatchProcessing
  selectedInvoiceIds={selectedInvoicesData.map(inv => inv.id)}
  selectedInvoiceCount={selectedInvoicesData.length}
  open={isBatchProcessingOpen}
  onOpenChange={setIsBatchProcessingOpen}
  onProcessingComplete={() => {
    setSelectedInvoices(new Set());
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }}
/>
```

## Detalhes Tecnicos

Apenas 1 arquivo precisa ser alterado. A correção mapeia os objetos de fatura para seus IDs (como a interface `BatchProcessingDialogProps` exige) e passa a contagem corretamente. Também conecta o callback `onProcessingComplete` para limpar a seleção e atualizar os dados após o processamento.

