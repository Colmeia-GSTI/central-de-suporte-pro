-- Corrigir a função de auditoria para converter UUID para TEXT corretamente
CREATE OR REPLACE FUNCTION public.log_integration_settings_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            NEW.id,
            'INSERT',
            NULL,
            jsonb_build_object(
                'integration_type', NEW.integration_type,
                'is_active', NEW.is_active
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
            NEW.id,
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
            OLD.id,
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
$function$;