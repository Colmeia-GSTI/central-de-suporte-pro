-- Corrigir warnings de segurança

-- 1. Atualizar funções com search_path correto
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'technician');
    
    RETURN NEW;
END;
$$;

-- 2. Corrigir política permissiva de audit_logs
DROP POLICY IF EXISTS "System can insert logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert logs" ON public.audit_logs 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);