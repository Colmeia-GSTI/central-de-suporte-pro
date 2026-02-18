

# Fix: Baixa Automatica Completa + Icone de Pagamento Visivel

## Problemas Identificados

### 1. Webhook nao cria registro financeiro

Quando o Banco Inter envia o webhook de pagamento (PAGO/RECEBIDO/LIQUIDADO), o `webhook-banco-inter` atualiza:
- `status` -> "paid"
- `paid_date` -> data do pagamento
- `payment_method` -> "boleto"

Mas NAO faz:
- Preencher `paid_amount` (fica null)
- Criar registro em `financial_entries` (como a baixa manual faz)
- Criar `audit_log` de pagamento

Isso significa que a reconciliacao bancaria e os relatorios financeiros ficam incompletos quando o pagamento e automatico.

### 2. Icone $ some quando fatura e paga

O icone `DollarSign` no `InvoiceInlineActions.tsx` (linha 165) so renderiza quando `isPendingOrOverdue`. Quando a fatura e paga (manual ou automaticamente), o icone desaparece. O usuario espera ver um indicador visual de que o pagamento foi confirmado.

---

## Correcoes

### Arquivo 1: `supabase/functions/webhook-banco-inter/index.ts`

No bloco de boleto pago (linhas 127-135), apos marcar como "paid", adicionar:

```typescript
if (payload.situacao === "PAGO" || payload.situacao === "RECEBIDO" || payload.situacao === "LIQUIDADO") {
  updateData.status = "paid";
  updateData.paid_date = payload.dataHoraSituacao || payload.dataSituacao || new Date().toISOString();
  updateData.payment_method = "boleto";
  updateData.paid_amount = payload.valorTotalRecebimento || payload.valorNominal || null;
}
```

E apos o update da fatura (apos linha 147), buscar a fatura atualizada e criar o registro financeiro:

```typescript
// Criar entrada financeira automatica
if (updateData.status === "paid") {
  const { data: updatedInvoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_id, amount")
    .eq("invoice_number", invoiceNumber)
    .single();

  if (updatedInvoice) {
    const paidAmount = updateData.paid_amount || updatedInvoice.amount;

    await supabase.from("financial_entries").insert({
      client_id: updatedInvoice.client_id,
      invoice_id: updatedInvoice.id,
      type: "receita",
      amount: paidAmount,
      description: `Pagamento automático (boleto) - Fatura #${invoiceNumber}`,
      entry_date: updateData.paid_date,
      is_paid: true,
      paid_date: updateData.paid_date,
      payment_method: "boleto",
      notes: `Confirmado via webhook Banco Inter. Origem: ${payload.origemRecebimento || "N/A"}`,
    });

    await supabase.from("audit_logs").insert({
      table_name: "invoices",
      record_id: updatedInvoice.id,
      action: "WEBHOOK_PAYMENT_CONFIRMED",
      new_data: {
        paid_amount: paidAmount,
        paid_date: updateData.paid_date,
        payment_method: "boleto",
        source: "webhook_banco_inter",
        origem_recebimento: payload.origemRecebimento,
      },
    });
  }
}
```

Mesmo tratamento para o bloco PIX (apos linha 168).

### Arquivo 2: `src/components/billing/InvoiceInlineActions.tsx`

Alterar o icone `$` para ser visivel em todos os estados, mudando cor conforme o status:

**Antes (linha 164-179):**
```tsx
{isPendingOrOverdue && (
  <Tooltip>
    ...
    <DollarSign className={`${iconClass} text-muted-foreground`} />
    ...
    <TooltipContent>Baixa Manual</TooltipContent>
  </Tooltip>
)}
```

**Depois:**
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="sm"
      onClick={isPendingOrOverdue ? onManualPayment : undefined}
      disabled={!isPendingOrOverdue}
      className="h-7 w-7 p-0 hover:bg-muted"
    >
      <DollarSign className={`${iconClass} ${
        invoice.status === "paid"
          ? "text-emerald-500"
          : "text-muted-foreground"
      }`} />
    </Button>
  </TooltipTrigger>
  <TooltipContent side="top">
    {invoice.status === "paid"
      ? `Pago${invoice.status === "paid" && invoice.boleto_url ? " (automático)" : ""}`
      : "Baixa Manual"}
  </TooltipContent>
</Tooltip>
```

Isso faz:
- Fatura pendente/vencida: icone cinza, clicavel para baixa manual
- Fatura paga: icone verde, nao clicavel, tooltip "Pago"

### Arquivo 3: `src/utils/invoiceIndicators.ts`

Adicionar uma funcao `getPaymentIndicator` para centralizar a logica (opcional, para manter o padrao dos demais indicadores):

```typescript
export function getPaymentIndicator(invoice: { status: string; manual_payment?: boolean }): IndicatorResult {
  if (invoice.status === "paid") {
    return {
      color: "text-emerald-500",
      tooltip: invoice.manual_payment ? "Pago (baixa manual)" : "Pago (automático)",
      level: "success",
    };
  }
  return { color: "text-muted-foreground", tooltip: "Baixa Manual", level: "pending" };
}
```

---

## Resumo do Impacto

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Webhook paga fatura | Atualiza status apenas | Atualiza status + cria financial_entry + audit_log |
| `paid_amount` no webhook | null | Preenchido com valor recebido |
| Icone $ com fatura paga | Desaparece | Fica verde com tooltip "Pago" |
| Icone $ com fatura pendente | Cinza, clicavel | Sem alteracao |
| Relatorios financeiros | Incompletos para pagamentos automaticos | Completos |

## Arquivos afetados

1. `supabase/functions/webhook-banco-inter/index.ts` -- registrar financial_entry e paid_amount
2. `src/components/billing/InvoiceInlineActions.tsx` -- icone $ sempre visivel
3. `src/utils/invoiceIndicators.ts` -- funcao getPaymentIndicator (opcional)
