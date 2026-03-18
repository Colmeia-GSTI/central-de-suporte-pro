-- 1. Drop duplicate trigger (the one without WHEN clause)
DROP TRIGGER IF EXISTS trigger_log_ticket_status_change ON public.tickets;

-- 2. Fix orphan sessions: close all but the latest open session per ticket
WITH ranked AS (
  SELECT id, ticket_id,
    ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY started_at DESC) as rn
  FROM ticket_attendance_sessions
  WHERE ended_at IS NULL
)
UPDATE ticket_attendance_sessions s
SET ended_at = s.started_at
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;