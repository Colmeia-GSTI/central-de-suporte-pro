# Correção: Boleto Blend permanece com CNPJ antigo

## O que aconteceu (causa raiz)

Investiguei a fatura #389 da Blend (`pay_kn7v6jd2jv5oudws`) e encontrei **três falhas encadeadas** no fluxo `asaas-nfse → create_payment`:

1. **Reuso cego do boleto antigo.** Quando a fatura já tem `asaas_payment_id`, o código entra no bloco de "idempotência" (linha 2104) e retorna o `boleto_url` salvo no Storage **sem checar se os dados do cliente no Asaas mudaram**. O PDF do boleto é congelado no momento da emissão — alterar o CNPJ no cadastro local NÃO regenera o PDF. Resultado: o boleto continua com o CNPJ antigo.

2. **Não há sincronização do customer no reuso.** O `ensureCustomerForPayment` (PUT no Asaas) só roda quando vai criar boleto novo. No reuso, nem o customer é atualizado.

3. **Pagamento foi DELETADO no Asaas mas ficou registrado no banco.** Os logs mostram `PAYMENT_DELETED` para `pay_kn7v6jd2jv5oudws` (00:46) e depois `O QR Code para cobrança 824548961 está deletado. Restaure a cobrança` (00:48). A fatura ficou apontando para um pagamento morto, mas o banco não foi limpo — então o sistema continua devolvendo a URL velha.

Além disso, **não existe ferramenta de admin** para "regenerar boleto" após mudança de cadastro. O usuário precisa abrir o banco para destravar.

## O que vou corrigir

### 1. Edge Function `asaas-nfse` — bloco `create_payment`
- Antes de reusar, fazer `GET /customers/:id` no Asaas e comparar `cpfCnpj` com `clients.document` local. Se divergir → tratar como drift: cancela o payment antigo, limpa `asaas_payment_id/boleto_url/boleto_barcode/pix_code` e cai no fluxo de criação nova (que já roda o PUT do customer).
- Capturar o webhook `PAYMENT_DELETED` no estado da fatura: se o `GET /payments/:id` devolver 404 ou status `DELETED`, mesmo tratamento (limpa e recria).
- Cobrir o erro `O QR Code ... está deletado` (já aparecendo nos logs) com o mesmo caminho de regeneração em vez de só logar warn.

### 2. Nova action `regenerate_payment`
- Recebe `invoice_id` + `billing_type` + `reason`.
- Cancela `asaas_payment_id` atual via `DELETE /payments/:id` (ignora se já estiver deletado).
- Limpa colunas: `asaas_payment_id`, `asaas_invoice_url`, `boleto_url`, `boleto_barcode`, `pix_code`, `auto_payment_generated=false`.
- Remove o PDF antigo do Storage (`invoice-documents/boletos/{invoice_id}/boleto.pdf`) e a linha em `invoice_documents`.
- Chama o fluxo normal `create_payment` (que vai rodar `ensureCustomerForPayment` → PUT com CNPJ novo → criar boleto novo).
- Audita em `audit_logs` (`action='boleto_regenerated'`, `new_data` com motivo, payment antigo, payment novo).

### 3. Webhook `webhook-asaas-nfse`
- No evento `PAYMENT_DELETED`, além de logar, atualizar a fatura: `boleto_status='cancelado'`, **manter** `asaas_payment_id` para auditoria mas adicionar coluna `asaas_payment_deleted_at` (migration) para o `create_payment` saber que precisa recriar em vez de reutilizar.

### 4. Migration
```sql
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS asaas_payment_deleted_at timestamptz;
```
(Sem `GRANT` extra — herda permissões existentes da tabela.)

### 5. UI — botão "Regerar boleto"
- No `BillingNfseTab` / detalhes da fatura (área de boleto), adicionar botão **"Regerar boleto"** (variant destructive-secondary, com ícone `RefreshCw`).
- Confirmação obrigatória (`AlertDialog`) com campo "Motivo" (≥5 caracteres) — segue padrão do `NfseArchiveDialog`.
- Chama `supabase.functions.invoke('asaas-nfse', { body: { action: 'regenerate_payment', invoice_id, billing_type: 'BOLETO', reason } })`.
- Toast de sucesso e refetch.

### 6. Sincronização proativa quando CNPJ muda
- No componente de edição de cliente (`ClientForm` / hook que faz update do `document`), detectar mudança de `document` e: chamar `asaas-nfse` action `sync_customer` (já existe) para empurrar o PUT imediato; marcar `invoices` em status `pending`/`overdue` do cliente com `asaas_payment_deleted_at = now()` para forçar regeneração na próxima emissão/segunda via. (Sem deletar nada — só sinaliza.)

### 7. Correção pontual do registro atual (Blend #389)
Insert manual para destravar a fatura atual:
```sql
UPDATE invoices SET asaas_payment_id=NULL, boleto_url=NULL, boleto_barcode=NULL,
  pix_code=NULL, auto_payment_generated=false, boleto_status='pendente'
WHERE id='18f0cba4-eb29-4d74-b30b-3480ab16951c';
```
Depois disparar `create_payment` para gerar boleto novo com CNPJ correto. (Vou rodar via insert tool após aprovação.)

### 8. CHANGELOG.md
Documentar: detecção de drift de CNPJ, action `regenerate_payment`, botão na UI, tratamento de `PAYMENT_DELETED`.

## Teste end-to-end que vou executar após implementar
1. Verificar que `GET /customers/cus_000174038336` retorna o CNPJ correto (46.381.469/0001-19) — se não, o PUT vai sincronizar.
2. Rodar `regenerate_payment` para a fatura #389.
3. Confirmar: novo `asaas_payment_id`, novo PDF no Storage, novo `boleto_url`, CNPJ correto no PDF (validação visual via download do PDF gerado).
4. Confirmar `audit_logs` com o evento.
5. Rodar `bunx vitest run` nos testes afetados.

## Arquivos a alterar
- `supabase/functions/asaas-nfse/index.ts` (bloco `create_payment` + nova action `regenerate_payment`)
- `supabase/functions/webhook-asaas-nfse/index.ts` (handler `PAYMENT_DELETED`)
- Nova migration `add_asaas_payment_deleted_at.sql`
- `src/components/billing/BillingNfseTab.tsx` ou componente de detalhes do boleto (botão + dialog)
- Novo `src/components/billing/RegenerateBoletoDialog.tsx`
- Hook/componente de edição de cliente (gatilho ao mudar CNPJ)
- `CHANGELOG.md`

## Skill usada
`/skill:ui-ux-pro-max` para o botão "Regerar boleto" (regras: `destructive-emphasis`, `confirmation-dialogs`, `error-clarity`).
