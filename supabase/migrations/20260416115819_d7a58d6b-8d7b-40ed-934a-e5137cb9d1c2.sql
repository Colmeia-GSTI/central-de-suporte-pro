
-- Trigger function to send welcome email on client creation
CREATE OR REPLACE FUNCTION public.trigger_send_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := jsonb_build_object(
      'client_id', NEW.id,
      'client_name', COALESCE(NEW.trade_name, NEW.name),
      'client_email', NEW.email
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[trigger_send_welcome_email] Failed for client %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger: only fires when client has email
CREATE TRIGGER on_client_created_welcome_email
  AFTER INSERT ON public.clients
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL)
  EXECUTE FUNCTION public.trigger_send_welcome_email();
