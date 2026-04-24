# Plano: Rastreabilidade de Envios de Email

## Diagnóstico

Auditando o código + banco encontrei **a causa raiz** dos sintomas reportados:

1. `message_logs.user_id` é **NOT NULL**. Nenhuma Edge Function passa user_id. Os inserts falham silenciosamente dentro de `try/catch` ⇒ explica os "apenas 2 logs em 30 dias".
2. `invoice_notification_logs` tem `UNIQUE(invoice_id, notification_type, channel)`. `notify-due-invoices` faz `upsert`, então reenvios não geram nova linha.
3. `send-email-resend` grava 3× por email (pending + sent/failed) sem correlação por message_id, sem `related_type/related_id`, sem capturar `external_message_id` do Resend.
4. Em `generate-monthly-invoices` e similares, `email_sent_at` é setado por trigger/UPDATE antes da resposta do Resend.

## Migrações SQL (3)

```sql
-- 1) Permitir logs de jobs automáticos
ALTER TABLE public.message_logs ALTER COLUMN user_id DROP NOT NULL;

-- 2) Permitir histórico real de reenvios
ALTER TABLE public.invoice_notification_logs DROP CONSTRAINT uq_invoice_notification;
-- adicionar coluna recipient para o painel
ALTER TABLE public.invoice_notification_logs
  ADD COLUMN IF NOT EXISTS recipient text;
CREATE INDEX IF NOT EXISTS idx_invoice_notif_logs_invoice_sent
  ON public.invoice_notification_logs (invoice_id, sent_at DESC);

-- 3) Corrigir inconsistência (#120 e similares)
UPDATE public.invoices
   SET email_status = 'enviado'
 WHERE email_sent_at IS NOT NULL AND email_status IS NULL;
-- (linhas afetadas reportadas após execução; auditoria atual: 2 linhas)
```

## Mudanças em Edge Functions

### `send-email-resend/index.ts` (refatoração principal)

- Adicionar ao `EmailRequest`: `related_type`, `related_id`, `user_id`, `notification_type` (este último apenas propagado para o helper invoice — não vai pra `message_logs`).
- **Remover** o insert `pending` (decisão aprovada). Gravar **uma única linha** ao final com:
  - `status: 'sent' | 'failed'`
  - `sent_at: now()` apenas em sucesso
  - `error_message` em falha
  - `related_type`, `related_id`, `user_id` recebidos
  - `external_message_id: resendData.id` em sucesso
- Retornar no JSON de resposta: `{ success, id, error? }` para que o caller saiba se gravar `email_sent_at`.

### Helper compartilhado novo: `_shared/notification-logger.ts`

Função `logInvoiceNotification(supabase, { invoice_id, notification_type, channel, recipient, success, error_message })` — encapsula o insert em `invoice_notification_logs` para evitar duplicação. Usada por todas as funções que enviam notificações de fatura.

### Atualizar callers (passar contexto + gravar log + corrigir email_sent_at)

| Função | related_type | notification_type | Ajuste extra |
|---|---|---|---|
| `resend-payment-notification` | invoice | `payment_resend` | grava log; atualiza invoice só se sucesso |
| `notify-due-invoices` | invoice | `payment_reminder` | trocar `upsert` por `insert`; remover dedup-por-existência (manter dedup só por janela de 24h via `sent_at`) |
| `batch-collection-notification` | invoice | `batch_collection` | passar contexto; já loga, manter |
| `generate-monthly-invoices` | invoice | `invoice_created` | mover UPDATE de `email_sent_at` para **depois** da resposta de `send-email-resend`; gravar log |
| `send-nfse-notification` | nfse | `nfse` | passar contexto; já loga |
| `send-ticket-notification` | ticket | `ticket_<event>` | passar contexto |
| `send-welcome-email` | client | `welcome` | passar contexto |
| `send-alert-notification`, `check-no-contact-tickets`, `send-notification` | (variado) | apenas `related_type/notification_type` quando aplicável | sem log invoice |

## Frontend — Painel de Histórico de Notificações

**Local:** `src/components/billing/InvoiceNotificationHistory.tsx` (componente novo, ≤ 50 linhas).

**Integração:** abrir como `Sheet` (mobile-first) a partir do popover de ações de fatura existente (`ContractInvoiceActionsMenu` / detalhes da fatura). Botão novo: "Histórico de envios".

**Conteúdo:** `Table` shadcn com colunas Data, Canal (Badge), Tipo, Status (Badge verde/vermelho), Destinatário, Erro. Query React Query:

```ts
supabase.from('invoice_notification_logs')
  .select('*').eq('invoice_id', id).order('sent_at', { ascending: false }).limit(50);
```

`Skeleton` no carregamento, empty state padrão. Sem realtime (sob demanda).

## Limpeza

- Remover dedup-por-existência em `notify-due-invoices` (substituída por janela temporal via `sent_at > now() - 24h`).
- Consolidar inserts de `invoice_notification_logs` no novo helper.
- Verificar imports não usados em todas as funções tocadas.
- TypeScript: `bun tsc --noEmit` sem erros.

## Resumo de Arquivos

| Arquivo | Ação |
|---|---|
| migração SQL (3 statements) | Criar |
| `supabase/functions/_shared/notification-logger.ts` | Criar |
| `supabase/functions/send-email-resend/index.ts` | Editar (refatoração) |
| `supabase/functions/resend-payment-notification/index.ts` | Editar |
| `supabase/functions/notify-due-invoices/index.ts` | Editar |
| `supabase/functions/batch-collection-notification/index.ts` | Editar |
| `supabase/functions/generate-monthly-invoices/index.ts` | Editar (corrigir email_sent_at) |
| `supabase/functions/send-nfse-notification/index.ts` | Editar |
| `supabase/functions/send-ticket-notification/index.ts` | Editar |
| `supabase/functions/send-welcome-email/index.ts` | Editar |
| `supabase/functions/send-alert-notification/index.ts` | Editar (contexto apenas) |
| `supabase/functions/check-no-contact-tickets/index.ts` | Editar (contexto apenas) |
| `supabase/functions/send-notification/index.ts` | Editar (contexto apenas) |
| `src/components/billing/InvoiceNotificationHistory.tsx` | Criar |
| `src/components/contracts/ContractInvoiceActionsMenu.tsx` (ou equivalente) | Editar (botão "Histórico") |

## Reporte ao final
1. Lista de arquivos alterados
2. 3 migrações aplicadas + nº de linhas afetadas pelo UPDATE de #120
3. Confirmação `tsc --noEmit` limpo
