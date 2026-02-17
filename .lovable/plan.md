
# Padronizacao Completa do Sistema de Faturamento

Varredura detalhada revelou **8 inconsistencias** entre os componentes de faturamento. O objetivo e unificar todos os padroes para que boletos, NFS-e e notificacoes sigam a mesma logica em todas as telas.

---

## Inconsistencias Descobertas

### 1. Formatacao de moeda: 3 padroes diferentes (MEDIO)

| Componente | Padrao usado |
|------------|-------------|
| `BillingInvoicesTab` | `formatCurrency` local (inline) |
| `BillingErrorsPanel` | `formatCurrency` local (inline) |
| `BillingBoletosTab` | `formatCurrency` local (inline) |
| `BillingNfseTab` | `formatCurrencyBRL` de `@/lib/currency` |
| `BillingServicesTab` | `formatCurrencyBRLWithSymbol` de `@/lib/currency` |
| `SecondCopyDialog` | `formatCurrency` de `@/lib/currency` |

Ja existe `formatCurrency` exportada de `@/lib/currency.ts` que faz exatamente a mesma coisa. Tres componentes redefinem a funcao localmente.

**Correcao:** Remover todas as definicoes locais de `formatCurrency` e importar de `@/lib/currency`.

### 2. Parametro `channel` vs `channels` na notificacao (CRITICO)

A edge function `resend-payment-notification` espera `channels` (array). Porem:
- `InvoiceProcessingHistory.handleResendNotification` envia `channel: "email"` (string singular)
- `BillingErrorsPanel.handleResendNotification` envia `channel` (string singular)

Ambos sao silenciosamente ignorados pelo backend, pois o campo `channels` fica vazio.

**Correcao:** Alterar para `channels: ["email"]` e `channels: [channel]` respectivamente.

### 3. `InvoiceProcessingHistory.handleRegenerateBoleto` nao considera provedor (ALTO)

A funcao sempre chama `banco-inter` com `action: "generate"`, ignorando o `billing_provider` da fatura. Se o boleto foi gerado via Asaas, a regeneracao falhara silenciosamente.

**Correcao:** Verificar `invoice.billing_provider` e rotear para o provedor correto (mesmo padrao do `BillingErrorsPanel.handleRegenerateBoleto`).

### 4. `BillingErrorsPanel.handleRegenerateBoleto` usa actions inconsistentes (MEDIO)

Para Asaas, envia `action: "generate_boleto"`. Para Inter, envia `action: "generate"`. A action correta do Asaas e `create_payment` com `billing_type: "BOLETO"` (padrao do `useInvoiceActions`).

**Correcao:** Alinhar com o padrao do `useInvoiceActions.handleGeneratePayment`.

### 5. `BillingBatchProcessing` e `useBatchProcessing` tem provider hardcoded (MEDIO)

Ambos forcam `billing_provider: "banco_inter"`, ignorando o provedor configurado no contrato/fatura. Se o usuario usa Asaas, o lote processara via Inter.

**Correcao:** Usar o `billing_provider` de cada fatura, ou permitir selecao no dialog de processamento em lote.

### 6. `InvoiceActionsPopover.onCancelBoleto` nao executa acao real (MEDIO)

Na `BillingInvoicesTab` (linha 594), o handler de `onCancelBoleto` apenas exibe `toast.info("Cancelando boleto...")` e seta `setIsCancellingBoleto(true)` mas nunca chama a edge function. O batch cancel (linhas 704-734) funciona, mas o cancelamento individual nao.

**Correcao:** Implementar o cancelamento individual usando o mesmo padrao do `BillingBoletosTab.handleCancelBoleto`.

### 7. `resend-payment-notification` usa `serve()` ao inves de `Deno.serve()` (BAIXO)

Inconsistente com a migracao ja feita em `banco-inter` e `poll-services`.

**Correcao:** Migrar para `Deno.serve()`.

### 8. `InvoiceProcessingHistory.handleReprocessNfse` nao envia dados fiscais (BAIXO)

O reprocessamento no historico envia apenas `invoice_id` e `contract_id`, mas nao envia `client_id`, `value`, `service_description` ou `municipal_service_code`. O padrao correto (usado no `BillingNfseTab` e `BillingErrorsPanel`) inclui todos esses campos.

**Correcao:** Alinhar com o padrao completo.

---

## Plano de Correcoes

### Fase 1: Correcoes criticas de comunicacao

| # | Correcao | Arquivo |
|---|----------|---------|
| 2 | `channel` para `channels` (array) | `InvoiceProcessingHistory.tsx`, `BillingErrorsPanel.tsx` |
| 3 | Regenerar boleto com provedor correto | `InvoiceProcessingHistory.tsx` |
| 4 | Action correta para Asaas (`create_payment`) | `BillingErrorsPanel.tsx` |
| 6 | Implementar cancelamento individual de boleto | `BillingInvoicesTab.tsx` |

### Fase 2: Padronizacao de logica

| # | Correcao | Arquivo |
|---|----------|---------|
| 5 | Respeitar `billing_provider` no batch | `useBatchProcessing.ts`, `BillingBatchProcessing.tsx` |
| 8 | Enviar dados fiscais completos no reprocessamento | `InvoiceProcessingHistory.tsx` |

### Fase 3: Padronizacao de codigo

| # | Correcao | Arquivo |
|---|----------|---------|
| 1 | Unificar `formatCurrency` via import | `BillingInvoicesTab.tsx`, `BillingErrorsPanel.tsx`, `BillingBoletosTab.tsx` |
| 7 | Migrar `serve()` para `Deno.serve()` | `resend-payment-notification/index.ts` |

---

## Resumo de Arquivos Alterados

| Arquivo | Correcoes |
|---------|-----------|
| `src/components/billing/InvoiceProcessingHistory.tsx` | #2 (channels), #3 (provider), #8 (dados fiscais) |
| `src/components/billing/BillingErrorsPanel.tsx` | #2 (channels), #4 (action Asaas) |
| `src/components/billing/BillingInvoicesTab.tsx` | #1 (formatCurrency), #6 (cancel individual) |
| `src/components/billing/BillingBoletosTab.tsx` | #1 (formatCurrency) |
| `src/hooks/useBatchProcessing.ts` | #5 (provider dinamico) |
| `src/components/billing/BillingBatchProcessing.tsx` | #5 (provider dinamico) |
| `supabase/functions/resend-payment-notification/index.ts` | #7 (Deno.serve) |

## Cobertura

| Cenario | Coberto? |
|---------|----------|
| Notificacao via historico da fatura | Sim (#2) |
| Notificacao via painel de erros | Sim (#2) |
| Regeneracao de boleto Inter no historico | Sim (#3) |
| Regeneracao de boleto Asaas no historico | Sim (#3) |
| Regeneracao de boleto Asaas no painel de erros | Sim (#4) |
| Cancelamento individual de boleto | Sim (#6) |
| Processamento em lote multi-provedor | Sim (#5) |
| Reprocessamento NFS-e completo no historico | Sim (#8) |
| Formatacao de moeda consistente | Sim (#1) |
