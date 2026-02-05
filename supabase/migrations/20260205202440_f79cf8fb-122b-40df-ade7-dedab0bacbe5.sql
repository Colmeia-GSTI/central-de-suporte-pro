
-- Recriar apenas o que falhou (tabela invoice_notification_logs já existe parcialmente)
-- Garantir constraint unique e index existam
CREATE INDEX IF NOT EXISTS idx_invoice_notification_logs_invoice ON invoice_notification_logs(invoice_id);

-- Adicionar constraint unique se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_invoice_notification'
  ) THEN
    ALTER TABLE invoice_notification_logs 
      ADD CONSTRAINT uq_invoice_notification UNIQUE (invoice_id, notification_type, channel);
  END IF;
END $$;
