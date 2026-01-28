-- ========================================
-- 1. RPC para Reports Page - Agregação SQL
-- ========================================

-- Função para estatísticas de tickets agregadas
CREATE OR REPLACE FUNCTION public.get_ticket_report_stats(
  start_date TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'by_status', (
      SELECT json_agg(row_to_json(s))
      FROM (
        SELECT status, COUNT(*)::int as count
        FROM tickets
        WHERE created_at >= start_date
        GROUP BY status
      ) s
    ),
    'by_priority', (
      SELECT json_agg(row_to_json(p))
      FROM (
        SELECT priority, COUNT(*)::int as count
        FROM tickets
        WHERE created_at >= start_date
        GROUP BY priority
      ) p
    ),
    'daily_trend', (
      SELECT json_agg(row_to_json(d) ORDER BY d.date)
      FROM (
        SELECT 
          DATE(created_at) as date,
          COUNT(*)::int as created,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int as resolved
        FROM tickets
        WHERE created_at >= start_date
        GROUP BY DATE(created_at)
      ) d
    ),
    'sla_metrics', (
      SELECT json_build_object(
        'total', COUNT(*)::int,
        'with_response', COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int,
        'resolved', COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int
      )
      FROM tickets
      WHERE created_at >= start_date
    )
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- Função para estatísticas financeiras agregadas
CREATE OR REPLACE FUNCTION public.get_invoice_report_stats(
  start_date TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'pending_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0),
    'paid_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
    'overdue_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'overdue'), 0),
    'total_count', COUNT(*)::int,
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending')::int,
    'paid_count', COUNT(*) FILTER (WHERE status = 'paid')::int,
    'overdue_count', COUNT(*) FILTER (WHERE status = 'overdue')::int
  ) INTO result
  FROM invoices
  WHERE due_date >= start_date;
  
  RETURN result;
END;
$function$;

-- Função para ranking de técnicos
CREATE OR REPLACE FUNCTION public.get_technician_ranking(
  start_date TIMESTAMPTZ,
  limit_count INT DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(r))
  INTO result
  FROM (
    SELECT 
      p.full_name as name,
      COALESCE(SUM(tp.points), 0)::int as points
    FROM technician_points tp
    JOIN profiles p ON p.user_id = tp.user_id
    WHERE tp.created_at >= start_date
    GROUP BY p.full_name
    ORDER BY points DESC
    LIMIT limit_count
  ) r;
  
  RETURN COALESCE(result, '[]'::json);
END;
$function$;

-- ========================================
-- 2. Função consolidada para dados de ticket
-- ========================================

CREATE OR REPLACE FUNCTION public.get_ticket_form_data(
  p_client_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'technicians', (
      SELECT COALESCE(json_agg(json_build_object(
        'user_id', user_id,
        'full_name', full_name
      ) ORDER BY full_name), '[]'::json)
      FROM profiles
    ),
    'categories', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id,
        'name', name
      ) ORDER BY name), '[]'::json)
      FROM ticket_categories
      WHERE is_active = true
    ),
    'assets', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id,
        'name', name,
        'asset_type', asset_type
      ) ORDER BY name), '[]'::json)
      FROM assets
      WHERE (p_client_id IS NULL OR client_id = p_client_id)
        AND status = 'active'
    )
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- ========================================
-- 3. Índices para performance
-- ========================================

-- Tickets - queries frequentes
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_desc 
  ON tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_status_created 
  ON tickets(status, created_at DESC) 
  WHERE status NOT IN ('resolved', 'closed');

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status 
  ON tickets(assigned_to, status) 
  WHERE assigned_to IS NOT NULL;

-- Invoices - queries frequentes
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status 
  ON invoices(due_date, status) 
  WHERE status IN ('pending', 'overdue');

CREATE INDEX IF NOT EXISTS idx_invoices_client_status 
  ON invoices(client_id, status);

-- NFSe History - polling queries
CREATE INDEX IF NOT EXISTS idx_nfse_history_status_created 
  ON nfse_history(status, created_at DESC) 
  WHERE status IN ('processando', 'pendente');

-- Monitoring Alerts - realtime
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_status_level 
  ON monitoring_alerts(status, level, created_at DESC) 
  WHERE status = 'active';

-- Notifications - user queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, is_read, created_at DESC);

-- Message logs - status tracking
CREATE INDEX IF NOT EXISTS idx_message_logs_channel_status 
  ON message_logs(channel, status, created_at DESC);

-- Ticket history - timeline
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_created 
  ON ticket_history(ticket_id, created_at DESC);

-- Contracts - active billing
CREATE INDEX IF NOT EXISTS idx_contracts_status_billing 
  ON contracts(status, billing_day) 
  WHERE status = 'active' AND monthly_value > 0;