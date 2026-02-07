

# Corrigir Menu de Acoes na Aba de Faturas do Contrato

## Problema Identificado

A aba "Faturas" dentro do historico do contrato (`ContractHistorySheet.tsx`) **nao possui menu de acoes**. Ela exibe apenas informacoes basicas da fatura (numero, status, valor, vencimento) sem nenhum botao interativo. Diferente da tela principal de Faturamento (`/billing`), onde existe um dropdown com acoes como "Emitir Completo", "Gerar Boleto", etc.

## Solucao

Adicionar um menu de acoes (dropdown) em cada fatura listada na aba "Faturas" do `ContractHistorySheet`, com as acoes mais comuns:

- **Emitir Completo** (Boleto + PIX + NFS-e + Notificacao)
- **Gerar Boleto** (submenu com Banco Inter / Asaas)
- **Gerar PIX** (submenu com Banco Inter / Asaas)
- **Emitir NFS-e Manual**
- **Enviar por Email / WhatsApp**
- **Marcar como Pago**
- **Ver na aba de Faturamento** (link para `/billing`)

## Detalhes Tecnicos

### Arquivo: `src/components/contracts/ContractHistorySheet.tsx`

1. **Expandir a query de faturas** (linha ~136) para incluir campos necessarios para as acoes:
   - `boleto_url`, `boleto_barcode`, `pix_code`, `client_id`, `contract_id`, `billing_provider`, `boleto_status`, `nfse_status`, `email_status`

2. **Atualizar o tipo `InvoiceEntry`** (linha ~60) para incluir os novos campos

3. **Adicionar imports** necessarios:
   - `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuTrigger` do Radix
   - Icones: `MoreHorizontal`, `Barcode`, `QrCode`, `Zap`, `Mail`, `MessageCircle`, `Send`, `Building2`, `Loader2`, `ExternalLink`, `HandCoins`
   - `useMutation`, `useQueryClient` do React Query
   - `toast` do sonner
   - `supabase` client

4. **Adicionar estados e handlers** para:
   - `generatingPayment`, `processingComplete`, `sendingNotification`
   - `handleGeneratePayment()` - gerar boleto/PIX
   - `handleEmitComplete()` - fluxo completo
   - `handleResendNotification()` - enviar notificacoes
   - `markAsPaid` mutation

5. **Adicionar botao de acoes** em cada card de fatura (dentro do `invoices.map`, apos as informacoes existentes):
   - Botao "..." (MoreHorizontal) que abre dropdown com as acoes
   - Condicional: so exibir para faturas `pending` ou `overdue`
   - Reutilizar a mesma logica de acoes do `BillingInvoicesTab`

6. **Adicionar dialogs necessarios**:
   - `EmitNfseDialog` para emissao manual de NFS-e
   - `PixCodeDialog` para exibir codigo PIX

### Arquivo modificado
- `src/components/contracts/ContractHistorySheet.tsx` (unico arquivo)

### Riscos
- Nenhum risco estrutural - estamos adicionando funcionalidade que ja existe no `BillingInvoicesTab` e reaproveitando a mesma logica
- Os handlers chamam as mesmas edge functions ja existentes (`banco-inter`, `asaas-nfse`, `resend-payment-notification`)
