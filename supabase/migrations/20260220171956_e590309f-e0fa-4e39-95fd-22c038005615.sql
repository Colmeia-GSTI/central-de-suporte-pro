-- =============================================
-- FASE 1: Correção das políticas RLS do Portal
-- =============================================

-- 1. Corrigir policy de SELECT de tickets para clientes
-- client_master vê todos os chamados da empresa, client vê apenas os próprios
DROP POLICY IF EXISTS "Client users can view own tickets" ON tickets;
CREATE POLICY "Client users can view own tickets" ON tickets FOR SELECT
USING (
  is_staff(auth.uid())
  OR (
    has_role(auth.uid(), 'client_master') AND client_owns_record(auth.uid(), client_id)
  )
  OR (
    has_role(auth.uid(), 'client') AND EXISTS (
      SELECT 1 FROM client_contacts
      WHERE client_contacts.user_id = auth.uid()
        AND client_contacts.id = tickets.requester_contact_id
    )
  )
);

-- 2. Corrigir policy de SELECT de comentários para clientes
-- Clientes veem comentários não-internos de tickets onde são requester OU client_master da empresa
DROP POLICY IF EXISTS "Users can view non-internal comments" ON ticket_comments;
CREATE POLICY "Users can view non-internal comments" ON ticket_comments FOR SELECT
USING (
  NOT is_internal AND (
    EXISTS (
      SELECT 1 FROM tickets t
      JOIN client_contacts cc ON cc.user_id = auth.uid()
      WHERE t.id = ticket_comments.ticket_id
        AND (
          cc.id = t.requester_contact_id
          OR (has_role(auth.uid(), 'client_master') AND client_owns_record(auth.uid(), t.client_id))
        )
    )
  )
);

-- 3. Corrigir policy de INSERT de comentários para clientes
-- Clientes podem adicionar comentários não-internos em tickets onde são requester OU client_master
DROP POLICY IF EXISTS "Users can add comments" ON ticket_comments;
CREATE POLICY "Users can add comments" ON ticket_comments FOR INSERT
WITH CHECK (
  NOT is_internal AND (
    EXISTS (
      SELECT 1 FROM tickets t
      JOIN client_contacts cc ON cc.user_id = auth.uid()
      WHERE t.id = ticket_comments.ticket_id
        AND (
          cc.id = t.requester_contact_id
          OR (has_role(auth.uid(), 'client_master') AND client_owns_record(auth.uid(), t.client_id))
        )
    )
  )
);

-- =============================================
-- FASE 3: RPC get_client_management_report
-- =============================================

CREATE OR REPLACE FUNCTION public.get_client_management_report(
  p_client_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_tickets JSON;
  v_sla JSON;
  v_time JSON;
  v_financial JSON;
  v_assets JSON;
  v_trend JSON;
BEGIN
  -- Verificação de segurança: staff ou cliente dono
  IF NOT (is_staff(auth.uid()) OR client_owns_record(auth.uid(), p_client_id)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Chamados
  SELECT json_build_object(
    'total', COUNT(*),
    'open', COUNT(*) FILTER (WHERE status = 'open'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'closed', COUNT(*) FILTER (WHERE status = 'closed'),
    'avg_resolution_hours', ROUND(COALESCE(
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL),
      0
    )::numeric, 1),
    'by_priority', json_build_object(
      'low', COUNT(*) FILTER (WHERE priority = 'low'),
      'medium', COUNT(*) FILTER (WHERE priority = 'medium'),
      'high', COUNT(*) FILTER (WHERE priority = 'high'),
      'critical', COUNT(*) FILTER (WHERE priority = 'critical')
    )
  ) INTO v_tickets
  FROM tickets
  WHERE client_id = p_client_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;

  -- SLA
  SELECT json_build_object(
    'total_with_deadline', COUNT(*) FILTER (WHERE sla_deadline IS NOT NULL),
    'met', COUNT(*) FILTER (WHERE sla_deadline IS NOT NULL AND (
      (resolved_at IS NOT NULL AND resolved_at <= sla_deadline)
      OR (resolved_at IS NULL AND status NOT IN ('resolved', 'closed') AND now() <= sla_deadline)
    )),
    'percentage', CASE
      WHEN COUNT(*) FILTER (WHERE sla_deadline IS NOT NULL) = 0 THEN 100
      ELSE ROUND(
        (COUNT(*) FILTER (WHERE sla_deadline IS NOT NULL AND (
          (resolved_at IS NOT NULL AND resolved_at <= sla_deadline)
          OR (resolved_at IS NULL AND status NOT IN ('resolved', 'closed') AND now() <= sla_deadline)
        ))::numeric / NULLIF(COUNT(*) FILTER (WHERE sla_deadline IS NOT NULL), 0)::numeric) * 100,
        1
      )
    END
  ) INTO v_sla
  FROM tickets
  WHERE client_id = p_client_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;

  -- Horas trabalhadas
  SELECT json_build_object(
    'total_minutes', COALESCE(SUM(tte.duration_minutes), 0),
    'billable_minutes', COALESCE(SUM(tte.duration_minutes) FILTER (WHERE tte.is_billable = true), 0),
    'non_billable_minutes', COALESCE(SUM(tte.duration_minutes) FILTER (WHERE tte.is_billable = false), 0)
  ) INTO v_time
  FROM ticket_time_entries tte
  JOIN tickets t ON t.id = tte.ticket_id
  WHERE t.client_id = p_client_id
    AND tte.created_at >= p_start_date
    AND tte.created_at <= p_end_date;

  -- Financeiro
  SELECT json_build_object(
    'total_billed', COALESCE(SUM(amount), 0),
    'total_paid', COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
    'total_pending', COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0),
    'total_overdue', COALESCE(SUM(amount) FILTER (WHERE status = 'overdue'), 0)
  ) INTO v_financial
  FROM invoices
  WHERE client_id = p_client_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;

  -- Ativos
  SELECT json_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (WHERE status = 'active'),
    'inactive', COUNT(*) FILTER (WHERE status = 'inactive'),
    'maintenance', COUNT(*) FILTER (WHERE status = 'maintenance')
  ) INTO v_assets
  FROM assets
  WHERE client_id = p_client_id;

  -- Tendência mensal (últimos 6 meses dentro do período)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_trend
  FROM (
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
      COUNT(*) AS opened,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
    FROM tickets
    WHERE client_id = p_client_id
      AND created_at >= p_start_date
      AND created_at <= p_end_date
    GROUP BY date_trunc('month', created_at)
    ORDER BY date_trunc('month', created_at)
  ) t;

  -- Montar resultado final
  v_result := json_build_object(
    'tickets', v_tickets,
    'sla', v_sla,
    'time', v_time,
    'financial', v_financial,
    'assets', v_assets,
    'monthly_trend', v_trend
  );

  RETURN v_result;
END;
$$;