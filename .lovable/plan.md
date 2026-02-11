

# Refatoracao Completa do Sistema de Faturamento

## Problemas Identificados

### BUG CRITICO 1: Menu de Acoes (Popover) NAO abre
O botao de tres pontos (Menu) na tabela de faturas nao abre o menu de acoes. O componente `InvoiceActionsPopover` usa `Popover` do Radix, mas o trigger com `<button>` nativo nao esta funcionando corretamente no ambiente atual. O clique e registrado mas o popover nao renderiza.

### BUG CRITICO 2: "Nova Fatura" crasha a aplicacao
Ao clicar em "Nova Fatura", o app inteiro crasha com erro:
```
A <Select.Item /> must have a value prop that is not an empty string.
```
**Causa**: Linha 240 do `InvoiceForm.tsx` tem `<SelectItem value="">Padrao do contrato</SelectItem>`. O Radix Select nao aceita `value=""`.

### FUNCIONALIDADES OK (confirmadas via teste):
- Checkbox de selecao funciona
- Barra de selecao amarela aparece corretamente
- Cards de resumo financeiro mostram valores corretos do backend
- Busca e filtro de status funcionam
- Badge de NFS-e na coluna Status funciona
- Indicadores de acoes (Boleto/NFS-e/Email) renderizam

---

## Plano de Correcoes

### 1. Corrigir `InvoiceForm.tsx` - Bug do SelectItem vazio

**Problema**: `<SelectItem value="">` causa crash fatal.
**Solucao**: Trocar `value=""` por `value="default"` e ajustar a logica de submit para tratar "default" como null.

### 2. Reescrever `InvoiceActionsPopover.tsx` - Menu que nao abre

**Problema**: O Popover do Radix com trigger `<button>` nativo nao esta abrindo.
**Solucao**: Substituir o Popover por um `DropdownMenu` simplificado do Shadcn, OU trocar o trigger para usar `<Button>` do Shadcn com `asChild`. A abordagem sera usar `DropdownMenu` pois e o componente semanticamente correto para menus de acoes e nao sofre do mesmo problema de eventos do Popover.

**Nota importante**: Se o `DropdownMenu` tambem apresentar o bug global mencionado nos memorandos, a solucao alternativa sera manter o `Popover` mas corrigir o trigger usando o componente `Button` do Shadcn em vez de `<button>` nativo, e adicionar `modal={false}` ao Popover.

### 3. Preservar todas as integracoes backend

Todos os handlers e edge functions permanecem intactos:
- `useInvoiceActions` hook (handleGeneratePayment, handleEmitComplete, handleResendNotification, markAsPaidMutation)
- `generate-monthly-invoices` edge function
- `batch-collection-notification` edge function
- `banco-inter` edge function (gerar boleto, cancelar boleto)
- `asaas-nfse` edge function (gerar pagamento, emitir NFS-e, cancelar NFS-e)
- `manual-payment` edge function
- `generate-second-copy` edge function
- `renegotiate-invoice` edge function
- `calculate-invoice-penalties` edge function
- `resend-payment-notification` edge function
- `batch-process-invoices` edge function

Todos os dialogs (ManualPaymentDialog, SecondCopyDialog, RenegotiateInvoiceDialog, CancelNfseDialog, BillingBatchProcessing, EmitNfseDialog, EmitNfseAvulsaDialog, PixCodeDialog, InvoiceProcessingHistory) permanecem intactos.

---

## Detalhes Tecnicos

### Arquivo 1: `src/components/financial/InvoiceForm.tsx`

**Mudancas**:
- Linha 33: Trocar `z.enum(["", "banco_inter", "asaas"])` por `z.enum(["default", "banco_inter", "asaas"])`
- Linha 55: Trocar `billing_provider: ""` por `billing_provider: "default"`
- Linha 100: Trocar `data.billing_provider || null` por `data.billing_provider === "default" ? null : (data.billing_provider || null)`
- Linha 240: Trocar `<SelectItem value="">` por `<SelectItem value="default">`

### Arquivo 2: `src/components/billing/InvoiceActionsPopover.tsx`

**Mudancas**:
- Substituir `Popover`/`PopoverTrigger`/`PopoverContent` por `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator` do Shadcn
- Substituir os `MenuButton` customizados por `DropdownMenuItem`
- Substituir `MenuSeparator` customizado por `DropdownMenuSeparator`
- Manter toda a logica de negocio (sub-menus de provedor, condicoes de status, handlers)
- Usar `DropdownMenuSub`/`DropdownMenuSubTrigger`/`DropdownMenuSubContent` para os sub-menus de selecao de provedor (Boleto/PIX)
- O trigger usara `<Button variant="outline" size="icon">` do Shadcn

Se o DropdownMenu tambem nao funcionar (bug global), a abordagem alternativa sera:
- Manter Popover mas usar `<Button asChild>` como trigger em vez de `<button>` nativo
- Adicionar `modal={false}` no Popover Root
- Testar e iterar

### Arquivo 3: `src/components/billing/BillingInvoicesTab.tsx`

**Mudancas minimas** (apenas se necessario para compatibilidade):
- Ajustar a passagem de props ao novo componente de menu, caso a interface mude

---

## Mapeamento Frontend-Backend Validado

| Botao/Acao | Edge Function | Status |
|---|---|---|
| Gerar Faturas Mensais | `generate-monthly-invoices` | OK |
| Cobranca em Lote | `batch-collection-notification` | OK |
| Processar Selecionados | `batch-process-invoices` | OK |
| Emitir Completo | `banco-inter` + `asaas-nfse` + `resend-payment-notification` | OK |
| Gerar Boleto (Inter) | `banco-inter` | OK |
| Gerar Boleto (Asaas) | `asaas-nfse` (action: create_payment) | OK |
| Gerar PIX (Inter) | `banco-inter` | OK |
| Gerar PIX (Asaas) | `asaas-nfse` (action: create_payment) | OK |
| Marcar como Pago | Supabase direct update (invoices) | OK |
| Baixa Manual | `manual-payment` | OK |
| Segunda Via | `generate-second-copy` | OK |
| Renegociar | `renegotiate-invoice` | OK |
| Cancelar Boleto | `banco-inter` (action: cancel) | OK |
| Cancelar NFS-e | `asaas-nfse` (action: cancel) | OK |
| Emitir NFS-e Manual | Dialog EmitNfseDialog → `asaas-nfse` | OK |
| NFS-e Avulsa | Dialog EmitNfseAvulsaDialog | OK |
| Enviar Email | `resend-payment-notification` | OK |
| Enviar WhatsApp | `resend-payment-notification` | OK |
| Nova Fatura | Supabase direct insert (invoices) | **CRASH** - corrigir |

