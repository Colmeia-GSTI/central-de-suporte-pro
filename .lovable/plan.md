

# Plano: Correção de baixa automática de pagamentos + prevenção futura

## Problema raiz (confirmado)

1. **`manual-payment` insere colunas inexistentes** em `financial_entries`: usa `entry_date`, `is_paid`, `paid_date`, `payment_method`, `notes` — que não existem. A tabela só tem `date`, `category`, `is_reconciled`. O insert falha silenciosamente.
2. **Polling não verifica pagamentos**: `poll-services` só busca boletos SEM barcode. Boletos já emitidos que foram pagos nunca são verificados.
3. **Webhook não registrado**: O Banco Inter nunca recebeu o endpoint do webhook, então pagamentos confirmados não chegam ao sistema.

## Correções

### 1. Corrigir `manual-payment/index.ts` — colunas do `financial_entries`
Trocar o insert para usar as colunas corretas:
```
entry_date → date
is_paid, paid_date, payment_method, notes → REMOVER
category → "pagamento_manual"
```

### 2. Adicionar `pollBoletoPayments` ao `poll-services/index.ts`
Nova função que busca faturas com `boleto_barcode IS NOT NULL` e `status IN ('pending', 'overdue')` criadas há mais de 2h. Para cada uma, consulta a API do Banco Inter via `codigoSolicitacao` (ou busca por `seuNumero`) para verificar se `situacao = PAGO/RECEBIDO/LIQUIDADO`. Se sim:
- Atualiza `invoices.status = 'paid'`, `paid_date`, `paid_amount`
- Cria `financial_entries` com colunas corretas
- Cria `audit_logs`
- Notifica admins

Adicionar `"boleto_payments"` como serviço no handler principal.

### 3. Adicionar ação "Verificar Pagamento" na UI
- **`useInvoiceActions.ts`**: novo handler `handleCheckPaymentStatus(invoiceId)` que chama `poll-services` com `services: ["boleto_payments"]` e `invoice_id` específico
- **`InvoiceActionsPopover.tsx`**: novo item "Verificar Pagamento" para faturas pending/overdue com boleto
- **`InvoiceInlineActions.tsx`**: botão de refresh no indicador de pagamento

### 4. Auto-registro de webhook no `BancoInterConfigForm.tsx`
Após salvar/testar com sucesso, chamar automaticamente `register_webhook` para garantir que o webhook esteja sempre registrado.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/manual-payment/index.ts` | Corrigir colunas `financial_entries` |
| `supabase/functions/poll-services/index.ts` | Adicionar `pollBoletoPayments` |
| `src/hooks/useInvoiceActions.ts` | Adicionar `handleCheckPaymentStatus` |
| `src/components/billing/InvoiceActionsPopover.tsx` | Item "Verificar Pagamento" |
| `src/components/billing/InvoiceInlineActions.tsx` | Botão refresh no DollarSign |
| `src/components/settings/integrations/BancoInterConfigForm.tsx` | Auto-registrar webhook ao salvar |

