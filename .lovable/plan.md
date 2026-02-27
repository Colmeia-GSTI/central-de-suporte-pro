
# Correção: Cancelamento de Faturas - Fluxo Completo

## Problema

Ao cancelar uma fatura da Viapiana, ela continua aparecendo como "em atraso" (overdue). Isso ocorre porque **não existe uma ação "Cancelar Fatura" no sistema**. Existem apenas:

- "Cancelar Boleto" - limpa dados do boleto mas **não altera o status da fatura**
- "Cancelar NFS-e" - cancela a nota fiscal mas **não altera o status da fatura**
- "Excluir Fatura" - remove o registro do banco (destrutivo)

Além disso, o CRON job diário (03h) marca automaticamente faturas `pending` como `overdue` quando a data de vencimento passa, mas não há proteção para faturas que deveriam ser canceladas.

## Causa Raiz

1. **Sem ação "Cancelar Fatura"**: Nenhum menu do sistema oferece a opção de mudar o status para `cancelled`
2. **"Cancelar Boleto" incompleto**: A Edge Function `banco-inter` (action `cancel`) apenas limpa `boleto_barcode`, `boleto_url` e `payment_method` mas mantém o status da fatura inalterado
3. **CRON job sem proteção**: O job `UPDATE invoices SET status = 'overdue' WHERE status = 'pending' AND due_date < CURRENT_DATE` é correto em si, mas como não há forma de cancelar faturas, elas ficam presas no ciclo pending -> overdue

## Correções

### 1. Adicionar ação "Cancelar Fatura" no `useInvoiceActions`

Adicionar mutation `cancelInvoiceMutation` ao hook centralizado que:
- Atualiza o status para `cancelled`
- Registra no `audit_logs` com justificativa
- Invalida queries relevantes
- Exibe toast de confirmação

### 2. Adicionar "Cancelar Fatura" no menu `InvoiceActionsPopover`

Novo item de menu com `AlertDialog` de confirmação (ação destrutiva), visível para faturas `pending` e `overdue`. Requer justificativa obrigatória.

### 3. Adicionar "Cancelar Fatura" no menu `ContractInvoiceActionsMenu`

Mesmo padrão do item anterior para o menu de ações de faturas dentro de contratos.

### 4. Atualizar `ContractInvoicesSheet` para mostrar faturas canceladas

Atualmente o sheet filtra `.not("status", "in", "(cancelled,renegotiated)")`. Manter o filtro mas adicionar um toggle para "Mostrar canceladas" e exibir o badge correto.

### 5. Atualizar `useBillingCounters` para excluir canceladas

O contador de faturas em atraso já filtra corretamente por status (`overdue` ou `pending` com data passada), então faturas canceladas não seriam contadas. Sem alteração necessária.

## Detalhes Tecnico

### Arquivo: `src/hooks/useInvoiceActions.ts`

Adicionar:

```typescript
const cancelInvoiceMutation = useMutation({
  mutationFn: async ({ invoiceId, reason }: { invoiceId: string; reason: string }) => {
    const { error } = await supabase
      .from("invoices")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (error) throw error;

    // Registrar auditoria
    await supabase.from("audit_logs").insert({
      table_name: "invoices",
      record_id: invoiceId,
      action: "CANCEL",
      new_data: { reason, cancelled_at: new Date().toISOString() },
      user_id: (await supabase.auth.getUser()).data.user?.id,
    });
  },
  onSuccess: () => {
    invalidateAll();
    toast.success("Fatura cancelada com sucesso");
  },
  onError: (error: unknown) => {
    toast.error("Erro ao cancelar fatura", { description: getErrorMessage(error) });
  },
});
```

### Arquivo: `src/components/billing/InvoiceActionsPopover.tsx`

Adicionar prop `onCancelInvoice` e novo item de menu:

```typescript
// Cancelar Fatura (acao destrutiva com confirmacao)
{isPendingOrOverdue && (
  <DropdownMenuItem
    onClick={onCancelInvoice}
    className="text-destructive focus:text-destructive"
  >
    <Trash2 className="mr-2 h-4 w-4" />
    Cancelar Fatura
  </DropdownMenuItem>
)}
```

### Arquivo: `src/components/billing/BillingInvoicesTab.tsx`

Adicionar estado para dialog de confirmacao de cancelamento com campo de justificativa obrigatoria (`AlertDialog` com textarea). Conectar ao `cancelInvoiceMutation` do `useInvoiceActions`.

### Arquivo: `src/components/contracts/ContractInvoiceActionsMenu.tsx`

Adicionar "Cancelar Fatura" com mesmo dialog de confirmacao.

### Arquivo: `src/components/contracts/ContractInvoicesSheet.tsx`

- Remover filtro que esconde faturas canceladas
- Adicionar badge `cancelled` no `statusConfig`
- Excluir canceladas dos totais financeiros

## Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/hooks/useInvoiceActions.ts` | Adicionar `cancelInvoiceMutation` com auditoria |
| `src/components/billing/InvoiceActionsPopover.tsx` | Adicionar prop e menu "Cancelar Fatura" |
| `src/components/billing/BillingInvoicesTab.tsx` | Dialog de confirmacao com justificativa + conectar mutation |
| `src/components/contracts/ContractInvoiceActionsMenu.tsx` | Adicionar "Cancelar Fatura" com confirmacao |
| `src/components/contracts/ContractInvoicesSheet.tsx` | Mostrar faturas canceladas, badge correto, excluir de totais |

## Impacto

| Cenario | Antes | Depois |
|---|---|---|
| Fatura gerada por erro | Fica como pending/overdue para sempre | Pode ser cancelada com justificativa |
| Cancelar boleto | Status da fatura nao muda | Boleto cancelado, fatura pode ser cancelada separadamente |
| CRON de overdue | Marca tudo como overdue | Faturas canceladas nao sao afetadas (ja filtrado) |
| Historico de faturas do contrato | Canceladas ficam ocultas | Canceladas visiveis com badge cinza |
| Auditoria | Sem registro de cancelamento | Registro com justificativa e usuario |
