-- Enable realtime for monitored_devices (if not already)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'monitored_devices'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.monitored_devices;
    END IF;
END $$;

-- Create function to call edge function when alert is created
CREATE OR REPLACE FUNCTION public.notify_on_monitoring_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Call the edge function to send notifications
    PERFORM net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-alert-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'monitoring_alerts',
            'record', jsonb_build_object(
                'id', NEW.id,
                'device_id', NEW.device_id,
                'level', NEW.level,
                'title', NEW.title,
                'message', NEW.message,
                'status', NEW.status,
                'created_at', NEW.created_at
            ),
            'schema', 'public'
        )
    );
    
    RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_notify_on_alert ON public.monitoring_alerts;

CREATE TRIGGER trigger_notify_on_alert
    AFTER INSERT ON public.monitoring_alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_monitoring_alert();