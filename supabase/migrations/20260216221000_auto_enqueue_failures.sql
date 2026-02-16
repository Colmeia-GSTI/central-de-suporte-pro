-- Migration: Auto-Enqueue Failure Triggers
-- Description: Automatically enqueue invoices to retry queue when processing fails

-- FUNCTION: Auto-enqueue on failure
CREATE OR REPLACE FUNCTION public.trigger_auto_enqueue_on_failure()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if boleto processing failed
  IF NEW.boleto_status = 'erro' AND OLD.boleto_status != 'erro' THEN
    PERFORM public.enqueue_invoice_for_processing(
      NEW.id,
      'boleto',
      '{"generate_boleto": true}'::jsonb,
      5
    );
  END IF;

  -- Check if NFS-e processing failed
  IF NEW.nfse_status = 'erro' AND OLD.nfse_status != 'erro' THEN
    PERFORM public.enqueue_invoice_for_processing(
      NEW.id,
      'nfse',
      '{"emit_nfse": true}'::jsonb,
      5
    );
  END IF;

  -- Check if email processing failed
  IF NEW.email_status = 'erro' AND OLD.email_status != 'erro' THEN
    PERFORM public.enqueue_invoice_for_processing(
      NEW.id,
      'email',
      '{"send_email": true}'::jsonb,
      5
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE TRIGGER
DROP TRIGGER IF EXISTS auto_enqueue_on_failure_trigger ON public.invoices;
CREATE TRIGGER auto_enqueue_on_failure_trigger
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_auto_enqueue_on_failure();

-- FUNCTION: Log queue state changes
CREATE OR REPLACE FUNCTION public.log_queue_state_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Persist to application_logs
  INSERT INTO public.application_logs (
    level,
    module,
    action,
    message,
    context,
    execution_id,
    created_at
  )
  VALUES (
    CASE
      WHEN NEW.status = 'failed' THEN 'error'::TEXT
      WHEN NEW.status = 'completed' THEN 'info'::TEXT
      ELSE 'debug'::TEXT
    END,
    'Billing',
    'invoice_processing_' || NEW.process_type,
    'Queue ' || NEW.status || ': invoice ' || NEW.invoice_id || ' (attempt ' || NEW.attempt_number || '/' || NEW.max_attempts || ')',
    jsonb_build_object(
      'invoice_id', NEW.invoice_id,
      'status', NEW.status,
      'attempt_number', NEW.attempt_number,
      'max_attempts', NEW.max_attempts,
      'error_code', NEW.error_code,
      'next_retry_at', NEW.next_retry_at
    ),
    NULL,
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE TRIGGER FOR LOGGING
DROP TRIGGER IF EXISTS log_queue_state_change_trigger ON public.invoice_processing_queue;
CREATE TRIGGER log_queue_state_change_trigger
AFTER INSERT OR UPDATE ON public.invoice_processing_queue
FOR EACH ROW
EXECUTE FUNCTION public.log_queue_state_change();

-- GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.trigger_auto_enqueue_on_failure TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_queue_state_change TO authenticated;
