-- A) Refactor handle_new_user com application_logs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Log success
  INSERT INTO public.application_logs (level, module, action, message, context, user_id)
  VALUES (
    'info', 'auth', 'handle_new_user_success',
    'Profile and default role created for new user',
    jsonb_build_object('user_id', NEW.id, 'email', NEW.email),
    NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log failure but DO NOT block signup
  BEGIN
    INSERT INTO public.application_logs (level, module, action, message, context, user_id)
    VALUES (
      'error', 'auth', 'handle_new_user_failure',
      SQLERRM,
      jsonb_build_object('user_id', NEW.id, 'email', NEW.email, 'sqlstate', SQLSTATE),
      NEW.id
    );
  EXCEPTION WHEN OTHERS THEN
    -- Last resort: don't break signup if logging itself fails
    RAISE WARNING '[handle_new_user] failed and could not log: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- B) Audit trigger para user_roles
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
    VALUES ('user_roles', NEW.id, 'INSERT', auth.uid(), NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
    VALUES ('user_roles', NEW.id, 'UPDATE', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
    VALUES ('user_roles', OLD.id, 'DELETE', auth.uid(), to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_roles_trigger ON public.user_roles;
CREATE TRIGGER audit_user_roles_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

-- C) UNIQUE on client_contacts.username — already exists (idx_client_contacts_username + idx_client_contacts_username_lower). No-op.

-- D) RLS append-only em audit_logs
DROP POLICY IF EXISTS "Block update audit logs" ON public.audit_logs;
CREATE POLICY "Block update audit logs"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Block delete audit logs" ON public.audit_logs;
CREATE POLICY "Block delete audit logs"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);

-- Schedule detect-auth-anomalies daily at 11 UTC (8h Brasília)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('detect-auth-anomalies-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-auth-anomalies-daily');
  END IF;
END $$;