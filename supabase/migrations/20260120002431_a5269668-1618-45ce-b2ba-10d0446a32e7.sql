-- Adicionar billing_day aos contratos (dia do mês para faturamento)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_day integer DEFAULT 10;

-- Adicionar payment_preference aos contratos
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_preference text DEFAULT 'boleto';

-- Adicionar campo para controle de geração automática de pagamento
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS auto_payment_generated boolean DEFAULT false;

-- Tabela para log de geração de faturas (auditoria)
CREATE TABLE IF NOT EXISTS invoice_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  reference_month text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS na tabela de log
ALTER TABLE invoice_generation_log ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para invoice_generation_log (somente staff pode visualizar)
CREATE POLICY "Staff can view invoice generation logs"
ON invoice_generation_log
FOR SELECT
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert invoice generation logs"
ON invoice_generation_log
FOR INSERT
WITH CHECK (public.is_staff(auth.uid()));

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_invoice_generation_log_contract ON invoice_generation_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoice_generation_log_reference_month ON invoice_generation_log(reference_month);

-- Comentários
COMMENT ON COLUMN contracts.billing_day IS 'Dia do mês para faturamento automático (1-28)';
COMMENT ON COLUMN contracts.payment_preference IS 'Preferência de cobrança: boleto, pix ou both';
COMMENT ON COLUMN invoices.auto_payment_generated IS 'Se boleto/PIX foi gerado automaticamente';