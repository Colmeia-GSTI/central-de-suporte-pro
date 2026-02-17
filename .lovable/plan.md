
# Padronizacao Completa do Sistema de Faturamento

## Status: ✅ CONCLUÍDO

Todas as 8 inconsistências foram corrigidas.

---

## Correções Aplicadas

### 1. ✅ Formatação de moeda unificada
- Removidas definições locais de `formatCurrency` em `BillingInvoicesTab`, `BillingErrorsPanel`, `BillingBoletosTab`
- Todas importam de `@/lib/currency`

### 2. ✅ `channel` → `channels` (array)
- `InvoiceProcessingHistory.handleResendNotification`: `channels: ["email"]`
- `BillingErrorsPanel.handleResendNotification`: `channels: [channel]`

### 3. ✅ Regenerar boleto com provedor correto
- `InvoiceProcessingHistory.handleRegenerateBoleto` agora verifica `invoice.billing_provider` e roteia para Asaas ou Inter

### 4. ✅ Action correta para Asaas
- `BillingErrorsPanel.handleRegenerateBoleto` usa `create_payment` com `billing_type: "BOLETO"` (alinhado com `useInvoiceActions`)

### 5. ✅ Provider dinâmico no batch
- `useBatchProcessing` aceita `billingProvider` como parâmetro
- `BillingBatchProcessing` já tinha UI de seleção, agora passa o valor para o hook

### 6. ✅ Cancelamento individual de boleto
- `BillingInvoicesTab.onCancelBoleto` agora chama `banco-inter` com `action: "cancel"` de verdade

### 7. ✅ `serve()` → `Deno.serve()`
- `resend-payment-notification/index.ts` migrado

### 8. ✅ Dados fiscais completos no reprocessamento
- `InvoiceProcessingHistory.handleReprocessNfse` agora envia `client_id` e `value`
