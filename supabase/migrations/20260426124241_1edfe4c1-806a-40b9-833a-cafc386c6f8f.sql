-- 1) sanitize_jsonb: redacta recursivamente chaves sensíveis
CREATE OR REPLACE FUNCTION public.sanitize_jsonb(input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v jsonb;
  out_obj jsonb := '{}'::jsonb;
  out_arr jsonb := '[]'::jsonb;
  sensitive_prefixes text[] := ARRAY[
    'api_key','api_secret','webhook_secret','password',
    'token','private_key','client_secret','secret'
  ];
  is_sensitive boolean;
  p text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(input) = 'object' THEN
    FOR k, v IN SELECT * FROM jsonb_each(input) LOOP
      is_sensitive := false;
      FOREACH p IN ARRAY sensitive_prefixes LOOP
        IF lower(k) LIKE p || '%' THEN
          is_sensitive := true;
          EXIT;
        END IF;
      END LOOP;

      IF is_sensitive THEN
        out_obj := out_obj || jsonb_build_object(k, '[REDACTED]'::text);
      ELSIF jsonb_typeof(v) IN ('object','array') THEN
        out_obj := out_obj || jsonb_build_object(k, public.sanitize_jsonb(v));
      ELSE
        out_obj := out_obj || jsonb_build_object(k, v);
      END IF;
    END LOOP;
    RETURN out_obj;
  ELSIF jsonb_typeof(input) = 'array' THEN
    FOR v IN SELECT * FROM jsonb_array_elements(input) LOOP
      IF jsonb_typeof(v) IN ('object','array') THEN
        out_arr := out_arr || jsonb_build_array(public.sanitize_jsonb(v));
      ELSE
        out_arr := out_arr || jsonb_build_array(v);
      END IF;
    END LOOP;
    RETURN out_arr;
  ELSE
    RETURN input;
  END IF;
END;
$$;

-- 2) audit_changes: trigger genérica
CREATE OR REPLACE FUNCTION public.audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_record_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'integration_settings' THEN
    v_old := public.sanitize_jsonb(v_old);
    v_new := public.sanitize_jsonb(v_new);
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, auth.uid(), v_old, v_new);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[audit_changes] failed for %: %', TG_TABLE_NAME, SQLERRM;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Drop triggers/funções antigas (verificado: sem outras dependências)
DROP TRIGGER IF EXISTS audit_user_roles_trigger ON public.user_roles;
DROP TRIGGER IF EXISTS audit_integration_settings ON public.integration_settings;
DROP FUNCTION IF EXISTS public.audit_user_roles() CASCADE;
DROP FUNCTION IF EXISTS public.log_integration_settings_changes() CASCADE;

-- 4) Aplicar trigger genérico nas 6 tabelas
CREATE TRIGGER audit_user_roles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

CREATE TRIGGER audit_invoices_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

CREATE TRIGGER audit_contracts_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

CREATE TRIGGER audit_clients_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

CREATE TRIGGER audit_bank_accounts_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

CREATE TRIGGER audit_integration_settings_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

-- 5) RPC: list_audit_logs_with_user (paginação real + join profiles)
CREATE OR REPLACE FUNCTION public.list_audit_logs_with_user(
  p_tables text[] DEFAULT NULL,
  p_actions text[] DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  table_name text,
  action text,
  record_id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  old_data jsonb,
  new_data jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can read audit logs';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      al.id, al.created_at, al.table_name, al.action, al.record_id,
      al.user_id, p.email AS user_email, p.full_name AS user_name,
      al.old_data, al.new_data
    FROM public.audit_logs al
    LEFT JOIN public.profiles p ON p.user_id = al.user_id
    WHERE (p_tables IS NULL OR al.table_name = ANY(p_tables))
      AND (p_actions IS NULL OR al.action = ANY(p_actions))
      AND (p_user_id IS NULL OR al.user_id = p_user_id)
      AND (p_date_from IS NULL OR al.created_at >= p_date_from)
      AND (p_date_to IS NULL OR al.created_at <= p_date_to)
      AND (
        p_search IS NULL OR p_search = '' OR
        p.email ILIKE '%' || p_search || '%' OR
        p.full_name ILIKE '%' || p_search || '%'
      )
  ), counted AS (
    SELECT count(*)::bigint AS c FROM filtered
  )
  SELECT f.id, f.created_at, f.table_name, f.action, f.record_id,
         f.user_id, f.user_email, f.user_name, f.old_data, f.new_data,
         (SELECT c FROM counted) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;