CREATE OR REPLACE FUNCTION public.get_contracts_invoice_summary()
RETURNS TABLE (
  contract_id uuid,
  paid_count bigint,
  paid_total numeric,
  overdue_count bigint,
  overdue_total numeric,
  pending_count bigint,
  total_invoiced numeric
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    i.contract_id,
    COUNT(*) FILTER (WHERE i.status = 'paid') as paid_count,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as paid_total,
    COUNT(*) FILTER (WHERE i.status = 'overdue') as overdue_count,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'overdue'), 0) as overdue_total,
    COUNT(*) FILTER (WHERE i.status = 'pending') as pending_count,
    COALESCE(SUM(i.amount), 0) as total_invoiced
  FROM invoices i
  WHERE i.contract_id IS NOT NULL
    AND i.status NOT IN ('cancelled', 'renegotiated')
  GROUP BY i.contract_id;
$$;