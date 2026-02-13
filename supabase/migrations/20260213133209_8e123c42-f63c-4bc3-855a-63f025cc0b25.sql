
-- 1. Unique partial index to prevent duplicate additional charges
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_additional_charge 
ON public.contract_additional_charges (contract_id, reference_month, description) 
WHERE applied = false;

-- 2. Add match_score and match_candidates columns to bank_reconciliation
ALTER TABLE public.bank_reconciliation 
ADD COLUMN IF NOT EXISTS match_score integer,
ADD COLUMN IF NOT EXISTS match_candidates jsonb;

-- 3. RPC: get_integration_health_stats
CREATE OR REPLACE FUNCTION public.get_integration_health_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_stale_boletos integer;
  v_stale_nfse integer;
  v_failure_rate_24h numeric;
  v_avg_bank_return_ms numeric;
  v_failures_by_hour jsonb;
BEGIN
  -- Boletos pending > 1 hour
  SELECT count(*) INTO v_stale_boletos
  FROM invoices
  WHERE boleto_status IN ('pendente', 'processando')
    AND created_at < now() - interval '1 hour';

  -- NFS-e processing > 2 hours
  SELECT count(*) INTO v_stale_nfse
  FROM nfse_history
  WHERE status = 'processando'
    AND created_at < now() - interval '2 hours';

  -- Failure rate last 24h
  SELECT 
    CASE WHEN count(*) = 0 THEN 0
    ELSE round(count(*) FILTER (WHERE level = 'error')::numeric / count(*) * 100, 2)
    END INTO v_failure_rate_24h
  FROM application_logs
  WHERE module IN ('billing', 'nfse', 'banco_inter', 'retry')
    AND created_at > now() - interval '24 hours';

  -- Avg bank return time (in hours) for registered boletos
  SELECT coalesce(
    round(extract(epoch FROM avg(updated_at - created_at)) / 3600, 1),
    0
  ) INTO v_avg_bank_return_ms
  FROM invoices
  WHERE boleto_status = 'registrado'
    AND updated_at > created_at
    AND created_at > now() - interval '30 days';

  -- Failures by hour last 24h
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_failures_by_hour
  FROM (
    SELECT 
      date_trunc('hour', created_at) AS hour,
      count(*) AS count
    FROM application_logs
    WHERE level = 'error'
      AND module IN ('billing', 'nfse', 'banco_inter', 'retry')
      AND created_at > now() - interval '24 hours'
    GROUP BY date_trunc('hour', created_at)
    ORDER BY hour
  ) t;

  result := jsonb_build_object(
    'stale_boletos', v_stale_boletos,
    'stale_nfse', v_stale_nfse,
    'failure_rate_24h', v_failure_rate_24h,
    'avg_bank_return_hours', v_avg_bank_return_ms,
    'failures_by_hour', v_failures_by_hour
  );

  RETURN result;
END;
$$;

-- 4. RPC: auto_reconcile_bank_entries
CREATE OR REPLACE FUNCTION public.auto_reconcile_bank_entries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  inv record;
  best_invoice_id uuid;
  best_score integer;
  candidates jsonb;
  v_matched integer := 0;
  v_suggested integer := 0;
BEGIN
  FOR rec IN
    SELECT id, bank_amount, bank_reference, bank_date, bank_description
    FROM bank_reconciliation
    WHERE status = 'pending'
  LOOP
    best_score := 0;
    best_invoice_id := NULL;
    candidates := '[]'::jsonb;

    FOR inv IN
      SELECT i.id, i.amount, i.invoice_number, i.boleto_barcode, i.due_date,
             c.name AS client_name
      FROM invoices i
      JOIN contracts ct ON i.contract_id = ct.id
      JOIN clients c ON ct.client_id = c.id
      WHERE i.status IN ('pending', 'overdue', 'paid')
        AND i.invoice_id IS NULL  -- not already reconciled by another entry
        AND abs(i.amount - rec.bank_amount) <= 0.01
    LOOP
      DECLARE
        score integer := 0;
      BEGIN
        -- Exact amount match: 50 points
        IF abs(inv.amount - rec.bank_amount) <= 0.01 THEN
          score := score + 50;
        END IF;

        -- Reference match: 40 points
        IF rec.bank_reference IS NOT NULL AND (
          rec.bank_reference ILIKE '%' || inv.invoice_number || '%'
          OR (inv.boleto_barcode IS NOT NULL AND rec.bank_reference ILIKE '%' || inv.boleto_barcode || '%')
          OR rec.bank_description ILIKE '%' || inv.invoice_number || '%'
        ) THEN
          score := score + 40;
        END IF;

        -- Date proximity (within 3 days): 10 points
        IF inv.due_date IS NOT NULL AND abs(rec.bank_date::date - inv.due_date::date) <= 3 THEN
          score := score + 10;
        END IF;

        IF score >= 50 THEN
          candidates := candidates || jsonb_build_array(jsonb_build_object(
            'invoice_id', inv.id,
            'invoice_number', inv.invoice_number,
            'amount', inv.amount,
            'client_name', inv.client_name,
            'score', score
          ));

          IF score > best_score THEN
            best_score := score;
            best_invoice_id := inv.id;
          END IF;
        END IF;
      END;
    END LOOP;

    IF best_score >= 90 THEN
      UPDATE bank_reconciliation
      SET status = 'matched',
          invoice_id = best_invoice_id,
          match_score = best_score,
          match_candidates = candidates,
          matched_at = now(),
          updated_at = now()
      WHERE id = rec.id;
      v_matched := v_matched + 1;
    ELSIF best_score >= 50 THEN
      UPDATE bank_reconciliation
      SET status = 'suggested',
          invoice_id = best_invoice_id,
          match_score = best_score,
          match_candidates = candidates,
          updated_at = now()
      WHERE id = rec.id;
      v_suggested := v_suggested + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'suggested', v_suggested
  );
END;
$$;
