ALTER TABLE public.message_logs ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.invoice_notification_logs DROP CONSTRAINT IF EXISTS uq_invoice_notification;

ALTER TABLE public.invoice_notification_logs
  ADD COLUMN IF NOT EXISTS recipient text;

CREATE INDEX IF NOT EXISTS idx_invoice_notif_logs_invoice_sent
  ON public.invoice_notification_logs (invoice_id, sent_at DESC);