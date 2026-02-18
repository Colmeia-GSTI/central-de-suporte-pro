
-- 1. Tabela bank_accounts
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_name text,
  agency text,
  account_number text,
  account_type text DEFAULT 'corrente',
  initial_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- RLS: admin/financial podem gerenciar
CREATE POLICY "Admin and financial can manage bank accounts"
  ON public.bank_accounts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financial'::app_role));

-- RLS: staff pode visualizar
CREATE POLICY "Staff can view bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (is_staff(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. FK bank_account_id em bank_reconciliation
ALTER TABLE public.bank_reconciliation
  ADD COLUMN bank_account_id uuid REFERENCES public.bank_accounts(id);

-- 3. View accounts_receivable
CREATE OR REPLACE VIEW public.accounts_receivable AS
SELECT
  i.id,
  i.invoice_number,
  i.client_id,
  c.name as client_name,
  i.contract_id,
  i.amount,
  i.due_date,
  i.paid_date,
  i.paid_amount,
  CASE i.status::text
    WHEN 'pending' THEN 'em_aberto'
    WHEN 'overdue' THEN 'atrasado'
    WHEN 'paid' THEN 'pago'
    WHEN 'renegotiated' THEN 'renegociado'
    WHEN 'lost' THEN 'perdido'
    WHEN 'cancelled' THEN 'cancelado'
    ELSE i.status::text
  END as ar_status,
  GREATEST(0, CURRENT_DATE - i.due_date) as days_overdue,
  (i.status::text = 'overdue' OR (i.status::text = 'pending' AND i.due_date < CURRENT_DATE)) as is_overdue
FROM invoices i
LEFT JOIN clients c ON c.id = i.client_id
WHERE i.status::text NOT IN ('cancelled');

-- 4. Trigger conciliacao irreversivel
CREATE OR REPLACE FUNCTION public.prevent_reconciliation_reversal()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'matched' AND NEW.status IS DISTINCT FROM 'matched' THEN
    RAISE EXCEPTION 'Conciliacao e irreversivel. Nao e possivel reverter status matched.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER enforce_reconciliation_immutability
  BEFORE UPDATE ON public.bank_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.prevent_reconciliation_reversal();
