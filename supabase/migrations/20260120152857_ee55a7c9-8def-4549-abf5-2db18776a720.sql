-- Adicionar colunas de parcelamento na tabela invoices
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS installment_number INTEGER,
ADD COLUMN IF NOT EXISTS total_installments INTEGER,
ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Indices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_invoices_parent_id ON invoices(parent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ticket_id ON invoices(ticket_id);
CREATE INDEX IF NOT EXISTS idx_invoices_service_id ON invoices(service_id);

-- Adicionar tipo 'billing_reminder' ao enum event_type
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'billing_reminder';

-- Adicionar coluna invoice_id na tabela calendar_events para vincular lembretes a faturas
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_invoice_id ON calendar_events(invoice_id);

-- Tabela para rastrear notificacoes de faturas enviadas (evitar duplicatas)
CREATE TABLE IF NOT EXISTS invoice_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'reminder_7d', 'reminder_5d', 'reminder_3d', 'overdue', 'batch_collection'
  channel TEXT NOT NULL, -- 'email', 'whatsapp', 'calendar'
  sent_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_invoice_notification_logs_invoice ON invoice_notification_logs(invoice_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_invoice_notification_logs_sent ON invoice_notification_logs(sent_at);

-- RLS para a nova tabela
ALTER TABLE invoice_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view notification logs" ON invoice_notification_logs
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert notification logs" ON invoice_notification_logs
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- Comentarios para documentacao
COMMENT ON COLUMN invoices.parent_invoice_id IS 'ID da fatura original (para parcelas)';
COMMENT ON COLUMN invoices.installment_number IS 'Numero da parcela (1, 2, 3...)';
COMMENT ON COLUMN invoices.total_installments IS 'Total de parcelas';
COMMENT ON COLUMN invoices.ticket_id IS 'Vinculo opcional com ticket de suporte';
COMMENT ON COLUMN invoices.description IS 'Descricao da fatura avulsa';
COMMENT ON COLUMN invoices.service_id IS 'Servico vinculado para dados fiscais';
COMMENT ON COLUMN calendar_events.invoice_id IS 'Fatura vinculada para lembretes de cobranca';