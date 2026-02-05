
-- =====================================================
-- FASE 3: Melhorias Operacionais
-- =====================================================

-- 1. Campos para multa e juros na tabela invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fine_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_with_penalties numeric GENERATED ALWAYS AS (amount + COALESCE(fine_amount, 0) + COALESCE(interest_amount, 0)) STORED,
  ADD COLUMN IF NOT EXISTS paid_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric,
  ADD COLUMN IF NOT EXISTS manual_payment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS auto_nfse_emitted boolean DEFAULT false;

-- 2. Tabela para histórico de índices econômicos (IGPM, IPCA, INPC)
CREATE TABLE IF NOT EXISTS public.economic_indices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  index_type text NOT NULL, -- 'IGPM', 'IPCA', 'INPC'
  reference_date date NOT NULL,
  value numeric NOT NULL,
  accumulated_12m numeric,
  source text DEFAULT 'BCB',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (index_type, reference_date)
);

ALTER TABLE public.economic_indices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view economic indices"
  ON public.economic_indices FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/financial can manage economic indices"
  ON public.economic_indices FOR ALL
  USING (public.is_financial_admin(auth.uid()));

-- 3. Tabela para conciliação bancária
CREATE TABLE IF NOT EXISTS public.bank_reconciliation (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_date date NOT NULL,
  bank_description text NOT NULL,
  bank_amount numeric NOT NULL,
  bank_reference text,
  invoice_id uuid REFERENCES public.invoices(id),
  financial_entry_id uuid REFERENCES public.financial_entries(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched', 'ignored')),
  matched_at timestamptz,
  matched_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view reconciliation"
  ON public.bank_reconciliation FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin/financial can manage reconciliation"
  ON public.bank_reconciliation FOR ALL
  USING (public.is_financial_admin(auth.uid()));

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_status ON public.bank_reconciliation(status);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_bank_date ON public.bank_reconciliation(bank_date);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_invoice_id ON public.bank_reconciliation(invoice_id);
CREATE INDEX IF NOT EXISTS idx_economic_indices_type_date ON public.economic_indices(index_type, reference_date DESC);

-- 4. Função para calcular multa e juros
CREATE OR REPLACE FUNCTION public.calculate_penalties(
  p_amount numeric,
  p_due_date date,
  p_fine_pct numeric DEFAULT 2.0,
  p_monthly_interest_pct numeric DEFAULT 1.0
)
RETURNS TABLE(fine numeric, interest numeric, total numeric, days_overdue integer)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
  v_fine numeric;
  v_interest numeric;
BEGIN
  v_days := GREATEST(0, CURRENT_DATE - p_due_date);
  
  IF v_days <= 0 THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, p_amount, 0;
    RETURN;
  END IF;
  
  -- Multa fixa (2% sobre o valor)
  v_fine := ROUND(p_amount * (p_fine_pct / 100.0), 2);
  
  -- Juros pro-rata (1% a.m. = ~0.0333% ao dia)
  v_interest := ROUND(p_amount * (p_monthly_interest_pct / 100.0) * (v_days::numeric / 30.0), 2);
  
  RETURN QUERY SELECT v_fine, v_interest, p_amount + v_fine + v_interest, v_days;
END;
$$;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_bank_reconciliation_updated_at
  BEFORE UPDATE ON public.bank_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_economic_indices_updated_at
  BEFORE UPDATE ON public.economic_indices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
