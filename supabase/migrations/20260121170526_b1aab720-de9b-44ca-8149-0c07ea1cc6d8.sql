-- Backfill: Insert 'Chamado criado' for tickets that have no history entries
INSERT INTO public.ticket_history (ticket_id, user_id, old_status, new_status, comment, created_at)
SELECT 
  t.id as ticket_id,
  t.created_by as user_id,
  NULL as old_status,
  'open'::ticket_status as new_status,
  'Chamado criado' as comment,
  t.created_at as created_at
FROM public.tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_history th WHERE th.ticket_id = t.id
);

-- Create trigger function to automatically record status changes
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.ticket_history (
      ticket_id,
      user_id,
      old_status,
      new_status,
      comment,
      created_at
    ) VALUES (
      NEW.id,
      auth.uid(),
      OLD.status,
      NEW.status,
      'Alteração automática de status',
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on tickets table for status changes
DROP TRIGGER IF EXISTS trigger_log_ticket_status_change ON public.tickets;
CREATE TRIGGER trigger_log_ticket_status_change
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ticket_status_change();