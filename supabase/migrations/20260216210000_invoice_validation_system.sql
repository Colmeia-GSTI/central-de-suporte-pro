-- Migration: Invoice Validation System
-- Description: Add validation triggers and constraints for invoices

-- ADD CHECK CONSTRAINTS
ALTER TABLE public.invoices
ADD CONSTRAINT invoice_amount_positive CHECK (amount > 0),
ADD CONSTRAINT invoice_due_date_not_past CHECK (due_date >= CURRENT_DATE);

-- CREATE INDEX FOR AMOUNT FILTERING
CREATE INDEX idx_invoices_amount ON public.invoices(amount);

-- CREATE INDEX FOR DUE DATE RANGE QUERIES
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date DESC);

-- CREATE TABLE FOR INVOICE VALIDATION LOGS (local tracking before DB persistence)
CREATE TABLE IF NOT EXISTS public.invoice_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('validate', 'create', 'update')),
  is_valid BOOLEAN NOT NULL,
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  errors JSONB,
  warnings JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- CREATE INDEX ON INVOICE VALIDATION LOGS
CREATE INDEX idx_invoice_validation_logs_execution_id ON public.invoice_validation_logs(execution_id);
CREATE INDEX idx_invoice_validation_logs_created_at ON public.invoice_validation_logs(created_at DESC);

-- ENABLE RLS ON VALIDATION LOGS
ALTER TABLE public.invoice_validation_logs ENABLE ROW LEVEL SECURITY;

-- RLS POLICY: Financial staff can manage validation logs
CREATE POLICY "Financial staff can view validation logs" ON public.invoice_validation_logs
  FOR SELECT USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Financial staff can insert validation logs" ON public.invoice_validation_logs
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

-- FUNCTION: Validate invoice items sum (used by trigger)
CREATE OR REPLACE FUNCTION public.validate_invoice_items_sum()
RETURNS TRIGGER AS $$
DECLARE
  v_items_sum NUMERIC(10,2);
  v_item_count INTEGER;
BEGIN
  -- Only validate if invoice has items
  SELECT COUNT(*), COALESCE(SUM(total_value), 0)
  INTO v_item_count, v_items_sum
  FROM public.invoice_items
  WHERE invoice_id = NEW.id;

  -- If items exist, their sum must match invoice amount (within 0.01 tolerance)
  IF v_item_count > 0 AND ABS(v_items_sum - NEW.amount) > 0.01 THEN
    RAISE EXCEPTION 'Invoice amount (%) does not match sum of items (%). Tolerance: 0.01', NEW.amount, v_items_sum;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Validate items sum before insert/update
CREATE TRIGGER validate_invoice_items_sum_trigger
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_items_sum();

-- FUNCTION: Ensure invoice has client
CREATE OR REPLACE FUNCTION public.validate_invoice_has_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'Invoice must have a client';
  END IF;

  -- Verify client exists and is active
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id AND is_active = true) THEN
    RAISE EXCEPTION 'Client does not exist or is inactive';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Validate client before insert/update
CREATE TRIGGER validate_invoice_has_client_trigger
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_has_client();

-- FUNCTION: Log invoice validation operations
CREATE OR REPLACE FUNCTION public.log_invoice_validation()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
  ELSE
    RETURN NEW;
  END IF;

  -- Insert validation log
  INSERT INTO public.invoice_validation_logs (
    execution_id,
    action,
    is_valid,
    error_count,
    warning_count,
    created_by
  ) VALUES (
    'auto_' || gen_random_uuid()::TEXT,
    v_action,
    true,
    0,
    0,
    auth.uid()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Log successful invoice operations
CREATE TRIGGER log_invoice_validation_trigger
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.log_invoice_validation();

-- GRANT PERMISSIONS
GRANT SELECT ON public.invoice_validation_logs TO authenticated;
GRANT INSERT ON public.invoice_validation_logs TO authenticated;
GRANT UPDATE ON public.invoice_validation_logs TO authenticated;
