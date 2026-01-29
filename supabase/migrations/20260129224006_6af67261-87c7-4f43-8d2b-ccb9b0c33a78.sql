-- =====================================================
-- FASE 1: Reestruturação do Sistema de Faturamento
-- =====================================================

-- 1. Adicionar novos campos na tabela contracts
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS days_before_due INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS adjustment_percentage NUMERIC,
ADD COLUMN IF NOT EXISTS notification_message TEXT;

COMMENT ON COLUMN contracts.adjustment_date IS 
'Data do próximo reajuste anual (geralmente aniversário do contrato)';

COMMENT ON COLUMN contracts.adjustment_index IS 
'Índice de reajuste: IGPM, IPCA, INPC, FIXO';

COMMENT ON COLUMN contracts.adjustment_percentage IS 
'Percentual fixo de reajuste (usado quando adjustment_index = FIXO)';

COMMENT ON COLUMN contracts.days_before_due IS 
'Quantos dias antes do vencimento a fatura deve ser gerada automaticamente';

COMMENT ON COLUMN contracts.notification_message IS 
'Mensagem personalizada incluída nas cobranças deste contrato. Variáveis: {cliente}, {valor}, {vencimento}, {fatura}';

-- 2. Criar tabela de valores adicionais pontuais
CREATE TABLE IF NOT EXISTS contract_additional_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reference_month TEXT NOT NULL, -- Formato: YYYY-MM
  applied BOOLEAN DEFAULT false,
  applied_invoice_id UUID REFERENCES invoices(id),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_additional_charges_contract_month 
ON contract_additional_charges(contract_id, reference_month);

CREATE INDEX IF NOT EXISTS idx_additional_charges_pending 
ON contract_additional_charges(contract_id) 
WHERE applied = false;

ALTER TABLE contract_additional_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage additional charges" 
ON contract_additional_charges
FOR ALL USING (is_staff(auth.uid()));

COMMENT ON TABLE contract_additional_charges IS 
'Valores adicionais pontuais a serem cobrados em um mês específico';

-- 3. Criar tabela de histórico de alterações de serviços
CREATE TABLE IF NOT EXISTS contract_service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id),
  service_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('added', 'removed', 'updated')),
  old_value JSONB,
  new_value JSONB,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_history_contract 
ON contract_service_history(contract_id, created_at DESC);

ALTER TABLE contract_service_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view service history" 
ON contract_service_history
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert service history" 
ON contract_service_history
FOR INSERT WITH CHECK (is_staff(auth.uid()));

COMMENT ON TABLE contract_service_history IS 
'Histórico de quando serviços foram adicionados, removidos ou alterados em contratos';

-- 4. Criar tabela de histórico de reajustes
CREATE TABLE IF NOT EXISTS contract_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  adjustment_date DATE NOT NULL,
  index_used TEXT NOT NULL,
  index_value NUMERIC NOT NULL,
  old_monthly_value NUMERIC NOT NULL,
  new_monthly_value NUMERIC NOT NULL,
  applied_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adjustments_contract 
ON contract_adjustments(contract_id, adjustment_date DESC);

ALTER TABLE contract_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view adjustments" 
ON contract_adjustments
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Financial can manage adjustments" 
ON contract_adjustments
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financial'::app_role));

COMMENT ON TABLE contract_adjustments IS 
'Histórico de reajustes anuais aplicados aos contratos';

-- 5. Adicionar campo de competência na tabela invoices
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS reference_month TEXT;

COMMENT ON COLUMN invoices.reference_month IS 
'Mês de competência da fatura no formato YYYY-MM';

-- 6. Criar índice único para evitar duplicidade de faturas
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_contract_month_unique
ON invoices(contract_id, reference_month) 
WHERE contract_id IS NOT NULL 
  AND reference_month IS NOT NULL 
  AND status NOT IN ('cancelled');

-- 7. Trigger para atualizar updated_at em contract_additional_charges
CREATE OR REPLACE TRIGGER update_additional_charges_updated_at
BEFORE UPDATE ON contract_additional_charges
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();