

# Plan: Consolidate Email Helpers + PDF Attachments

## Summary

Two independent improvements: (1) extract duplicated email utility functions from 6 Edge Functions into `_shared/email-helpers.ts`, and (2) add PDF attachment support to billing emails via Resend's `attachments` API.

## Audit Results

**Duplicated code found in 6 Edge Functions:**
- `resend-payment-notification` — `replaceVariables`, `wrapInEmailLayout`, `EmailSettings`, `EmailTemplate`
- `notify-due-invoices` — same 4 items
- `batch-collection-notification` — same 4 items
- `send-nfse-notification` — same 4 items
- `send-ticket-notification` — same 4 items (+ extra CSS for ticket styles)
- `send-welcome-email` — inline HTML layout (not using the function, but same pattern)

**`InvoiceActionsPopover` vs `InvoiceInlineActions`:** These are NOT redundant. `InvoiceInlineActions` renders inline icon buttons in the table row. `InvoiceActionsPopover` renders a `...` dropdown menu with text actions. They serve different purposes and both are used in `BillingInvoicesTab.tsx`. No consolidation needed.

---

## Part 1 — Create `_shared/email-helpers.ts`

Create a shared module with:
- `EmailLayoutOptions` interface
- `getEmailSettings(supabase)` — fetches from `email_settings` + `company_settings`
- `wrapInEmailLayout(content, options)` — the consolidated HTML layout (using the richest version from `send-nfse-notification` which includes `blockquote` and `code` styles)
- `replaceVariables(template, data)` — mustache-style variable replacement with conditional blocks
- `formatCurrencyBRL(value)` and `formatDateBR(date)` — formatting helpers
- `corsHeaders` constant
- Re-export `applyNotificationMessage` from existing `notification-helpers.ts`

**Updated Edge Functions** (remove local duplicates, import from shared):
1. `resend-payment-notification/index.ts` — remove ~50 lines
2. `notify-due-invoices/index.ts` — remove ~50 lines
3. `batch-collection-notification/index.ts` — remove ~50 lines
4. `send-nfse-notification/index.ts` — remove ~55 lines
5. `send-ticket-notification/index.ts` — remove ~55 lines (keep extra ticket CSS via options parameter)
6. `send-welcome-email/index.ts` — refactor to use `wrapInEmailLayout` + `getEmailSettings`

**Estimated lines removed:** ~260 lines of duplicated code across 6 files.

---

## Part 2 — PDF Attachments in Billing Emails

### Step A: Update `send-email-resend`
- Add `attachments` field to `EmailRequest` interface
- Pass `attachments` array through to the Resend API body (Resend supports `{ filename, path }` where `path` is a URL)

### Step B: Update `resend-payment-notification`
- After generating signed URLs for boleto and NFS-e PDFs, build an `attachments` array
- Pass to `send-email-resend` alongside existing HTML (links remain in the body as fallback)

### Step C: Update `send-nfse-notification`
- Attach NFS-e PDF and XML via signed URLs

### Step D: Update `notify-due-invoices`
- Attach boleto PDF only (no NFS-e for reminders to avoid confusion)

---

## Part 3 — Cleanup

- Merge `_shared/notification-helpers.ts` into `_shared/email-helpers.ts` (single shared file)
- Delete `_shared/notification-helpers.ts`
- Update all imports from `notification-helpers.ts` to `email-helpers.ts`
- Verify no unused imports in all modified files

---

## Files Modified

| File | Action |
|------|--------|
| `supabase/functions/_shared/email-helpers.ts` | **Create** — consolidated helpers |
| `supabase/functions/_shared/notification-helpers.ts` | **Delete** — merged into email-helpers |
| `supabase/functions/send-email-resend/index.ts` | Add attachments passthrough |
| `supabase/functions/resend-payment-notification/index.ts` | Use shared helpers + add attachments |
| `supabase/functions/notify-due-invoices/index.ts` | Use shared helpers + add boleto attachment |
| `supabase/functions/batch-collection-notification/index.ts` | Use shared helpers |
| `supabase/functions/send-nfse-notification/index.ts` | Use shared helpers + add PDF/XML attachments |
| `supabase/functions/send-ticket-notification/index.ts` | Use shared helpers |
| `supabase/functions/send-welcome-email/index.ts` | Use shared helpers |

All 8 affected Edge Functions will be redeployed after changes.

