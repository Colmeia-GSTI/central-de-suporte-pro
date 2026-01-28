-- Create trigger function for integration settings audit
CREATE OR REPLACE FUNCTION public.log_integration_settings_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (
            table_name,
            record_id,
            action,
            old_data,
            new_data,
            user_id
        ) VALUES (
            'integration_settings',
            NEW.id::text,
            'INSERT',
            NULL,
            jsonb_build_object(
                'integration_type', NEW.integration_type,
                'is_active', NEW.is_active,
                'settings_keys', jsonb_object_keys(NEW.settings)
            ),
            auth.uid()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_logs (
            table_name,
            record_id,
            action,
            old_data,
            new_data,
            user_id
        ) VALUES (
            'integration_settings',
            NEW.id::text,
            'UPDATE',
            jsonb_build_object(
                'integration_type', OLD.integration_type,
                'is_active', OLD.is_active
            ),
            jsonb_build_object(
                'integration_type', NEW.integration_type,
                'is_active', NEW.is_active,
                'changed_at', now()
            ),
            auth.uid()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (
            table_name,
            record_id,
            action,
            old_data,
            new_data,
            user_id
        ) VALUES (
            'integration_settings',
            OLD.id::text,
            'DELETE',
            jsonb_build_object(
                'integration_type', OLD.integration_type,
                'is_active', OLD.is_active
            ),
            NULL,
            auth.uid()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Create trigger on integration_settings table
DROP TRIGGER IF EXISTS audit_integration_settings ON public.integration_settings;
CREATE TRIGGER audit_integration_settings
AFTER INSERT OR UPDATE OR DELETE ON public.integration_settings
FOR EACH ROW
EXECUTE FUNCTION public.log_integration_settings_changes();