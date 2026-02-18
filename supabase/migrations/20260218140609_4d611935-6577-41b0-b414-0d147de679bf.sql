
-- Fix: ensure accounts_receivable view uses SECURITY INVOKER (default, but explicit)
DROP VIEW IF EXISTS public.accounts_receivable;

CREATE VIEW public.accounts_receivable
WITH (security_invoker = true)
AS
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
