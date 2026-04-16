

# Plan: WhatsApp Notification Fixes

## Audit Answers

1. **Campo `whatsapp` na tabela `clients`?** — **SIM**, já existe (`whatsapp text NULL`, `whatsapp_validated boolean`, `whatsapp_validated_at timestamp`).
2. **Formulário de cliente já tem campo WhatsApp?** — **SIM**, `ClientForm.tsx` já inclui campo WhatsApp com validação via Evolution API, auto-validação com debounce, e badges de status.
3. **Evolution API já tem botão de teste?** — **SIM**, `EvolutionApiConfigForm.tsx` (linhas 213-229) já tem input de número + botão "Testar" que chama `send-whatsapp`. Correção 5 já está implementada.
4. **`applyNotificationMessageText` existe em `_shared/email-helpers.ts`?** — **NÃO**, não existe. Precisa ser criada.

## Corrections Needed (3 of 5 — two already done)

**Correção 1 — SKIP.** Campo `whatsapp` já existe na tabela e no formulário.

**Correção 5 — SKIP.** Botão de teste WhatsApp já existe no `EvolutionApiConfigForm.tsx`.

### Correção 2 — Fix WhatsApp parameters

**`notify-due-invoices/index.ts`** (line ~241):
- Add `userId`, `relatedType`, `relatedId` to the `send-whatsapp` invoke body.

**`batch-collection-notification/index.ts`** (line ~187):
- Change `phone` → `to` in the body.
- Add `userId`, `relatedType`, `relatedId`.

### Correção 3 — Add `applyNotificationMessageText` to shared helpers

**`_shared/email-helpers.ts`:**
- Add new exported function `applyNotificationMessageText(baseMessage, notificationMessage, variables)` for plain-text WhatsApp messages.

**`resend-payment-notification/index.ts`:**
- Import and apply `applyNotificationMessageText` to the WhatsApp message using the already-fetched `contractData`.

**`notify-due-invoices/index.ts`:**
- Fetch `notification_message` from the invoice's contract.
- Apply `applyNotificationMessageText` to the WhatsApp reminder.

**`batch-collection-notification/index.ts`:**
- Same pattern — fetch contract's `notification_message` and apply.

### Correção 4 — WhatsApp logging in `notify-due-invoices`

After successful WhatsApp send, insert into `message_logs` with channel, recipient, message, status, related_type, related_id.

## Files Modified

| File | Action |
|------|--------|
| `supabase/functions/_shared/email-helpers.ts` | Add `applyNotificationMessageText` |
| `supabase/functions/notify-due-invoices/index.ts` | Fix params + add logging + apply custom message |
| `supabase/functions/batch-collection-notification/index.ts` | Fix `phone`→`to` + add params + apply custom message |
| `supabase/functions/resend-payment-notification/index.ts` | Apply custom message to WhatsApp |

No database migrations needed. No new files. ~4 files touched.

