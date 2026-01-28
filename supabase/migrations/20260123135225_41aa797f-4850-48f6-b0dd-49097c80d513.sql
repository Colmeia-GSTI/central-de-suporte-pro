-- Function to get weekly ticket trend in a single query (replaces 14 queries)
CREATE OR REPLACE FUNCTION public.get_weekly_ticket_trend()
RETURNS TABLE (
  day TEXT,
  day_date DATE,
  tickets BIGINT,
  resolved BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day_names TEXT[] := ARRAY['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '6 days',
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date AS d
  ),
  ticket_counts AS (
    SELECT 
      DATE(created_at) AS ticket_date,
      COUNT(*) AS cnt
    FROM tickets
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY DATE(created_at)
  ),
  resolved_counts AS (
    SELECT 
      DATE(resolved_at) AS resolved_date,
      COUNT(*) AS cnt
    FROM tickets
    WHERE resolved_at >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY DATE(resolved_at)
  )
  SELECT 
    day_names[EXTRACT(DOW FROM dates.d)::int + 1],
    dates.d,
    COALESCE(tc.cnt, 0)::BIGINT,
    COALESCE(rc.cnt, 0)::BIGINT
  FROM dates
  LEFT JOIN ticket_counts tc ON tc.ticket_date = dates.d
  LEFT JOIN resolved_counts rc ON rc.resolved_date = dates.d
  ORDER BY dates.d;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_weekly_ticket_trend() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_ticket_trend() TO anon;