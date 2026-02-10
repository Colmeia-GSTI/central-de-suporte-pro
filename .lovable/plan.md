
# Refazer Layout Completo da Secao de Faturas

## Resumo

Reescrever o JSX do `BillingInvoicesTab.tsx` com o novo layout solicitado, preservando 100% da logica de backend existente (queries, mutations, handlers, dialogs). O componente `InvoiceActionsPopover` (Popover-based) sera mantido como menu de acoes -- ele ja funciona corretamente.

## Estrutura do Novo Layout

1. **Barra de Selecao** (condicional - aparece so com itens selecionados)
   - Background amarelo/dourado translucido (`bg-amber-500/10 border-amber-500/20`)
   - Texto: "X fatura(s) selecionada(s)"
   - Botao "Processar Selecionados" amarelo solido com icone Zap

2. **Acoes Rapidas** (botoes horizontais com scroll)
   - Inadimplencia (Link para `/billing/delinquency`)
   - NFS-e Avulsa
   - Gerar Faturas Mensais (PermissionGate financial/manage)
   - Cobranca em Lote (PermissionGate financial/manage)
   - Nova Fatura (alinhado a direita, PermissionGate financial/create)
   - SEM tooltips nos botoes de acao rapida (botoes tem texto descritivo, nao precisam)

3. **Cards de Resumo Financeiro** (3 cards lado a lado)
   - Card "A Receber" - valor verde, icone Clock
   - Card "Vencido" - valor vermelho, icone AlertTriangle
   - Card "Recebido" - valor verde, icone TrendingUp, botao + amarelo no canto

4. **Busca e Filtros**
   - Input com icone Search: "Buscar por cliente ou numero..."
   - Select de status: Todos, Pendente, Pago, Vencido, Cancelado

5. **Tabela**
   - Colunas: Checkbox, #, Cliente, Competencia, Valor, Vencimento, Status, Acoes, Menu
   - Coluna "Acoes": `InvoiceActionIndicators` (indicadores de boleto/nfse/email)
   - Coluna "Menu": `InvoiceActionsPopover` (menu Popover com todas as acoes)
   - Remover botoes separados "Ver Boleto" e "Ver PIX" que estavam ao lado do menu
   - Skeleton loading, empty state

6. **Dialogs** (todos preservados exatamente como estao)
   - BillingBatchProcessing, EmitNfseDialog, EmitNfseAvulsaDialog, PixCodeDialog
   - InvoiceProcessingHistory, ManualPaymentDialog, SecondCopyDialog
   - RenegotiateInvoiceDialog, CancelNfseDialog, ConfirmDialog (cancel boleto)

## Backend -- Tudo Preservado

Nenhuma logica de backend sera alterada:

- **Queries**: `invoices` (com `.select("*, clients(name), contract_id, billing_provider")`), `nfse-by-invoices`
- **Hook `useInvoiceActions`**: `handleGeneratePayment`, `handleEmitComplete`, `handleResendNotification`, `markAsPaidMutation`
- **Handlers locais**: `handleGenerateMonthlyInvoices` (edge function `generate-monthly-invoices`), `handleBatchNotification` (edge function `batch-collection-notification`)
- **Cancel boleto**: invoca edge function `banco-inter` com `action: "cancel"`
- **Cancel NFS-e**: invoca edge function `asaas-nfse` com `action: "cancel"`
- **Todas as invalidacoes de cache** (`queryClient.invalidateQueries`)

## Detalhes Tecnicos

### Arquivo a modificar
- `src/components/billing/BillingInvoicesTab.tsx` - reescrever apenas o JSX (return), manter todos os imports, estados, queries, handlers e dialogs

### Mudancas especificas no JSX:
1. Barra de selecao: trocar `bg-primary/10` por `bg-amber-500/10 border-amber-500/20`, botao amarelo
2. Cards: trocar de 4 cards para 3 cards (`grid-cols-1 sm:grid-cols-3`), remover card "Total Faturas"
3. Remover botoes "Ver Boleto" e "Ver PIX" da coluna Menu (ja tem indicadores na coluna Acoes)
4. Manter `InvoiceActionsPopover` como menu principal (Popover funcional)
5. Acoes rapidas com `overflow-x-auto` para scroll horizontal em mobile

### O que NAO muda:
- `InvoiceActionsPopover.tsx` - sem alteracoes
- `InvoiceActionIndicators.tsx` - sem alteracoes
- `useInvoiceActions.ts` - sem alteracoes
- Todas as edge functions de backend
- Todos os dialogs e suas integracoes com backend
