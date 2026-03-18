
-- 1. Add field_changes column to ticket_history (fixes PostgREST error)
ALTER TABLE public.ticket_history 
ADD COLUMN IF NOT EXISTS field_changes jsonb DEFAULT NULL;

-- 2. Drop the trigger that creates duplicate "Alteração automática de status" entries
-- All status changes already have manual history inserts with richer context
DROP TRIGGER IF EXISTS trg_log_ticket_status_change ON public.tickets;
