-- =====================================================================
-- RPCs administrativas de gestão de usuários
-- =====================================================================

-- 1) Alteração atômica de papel
CREATE OR REPLACE FUNCTION public.change_user_role(
  target_user_id uuid,
  new_role public.app_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_roles text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can change user roles';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id é obrigatório';
  END IF;

  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
    INTO v_old_roles
    FROM public.user_roles
   WHERE user_id = target_user_id;

  -- Atômico dentro da função: trigger audit_user_roles registra cada operação
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, new_role);

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', target_user_id,
    'new_role', new_role,
    'old_roles', v_old_roles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_role(uuid, public.app_role) TO authenticated;

-- 2) Listagem de usuários com status (apenas admin)
CREATE OR REPLACE FUNCTION public.list_users_for_admin()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  roles text[],
  client_id uuid,
  client_name text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can list users';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    p.email,
    p.phone,
    COALESCE(
      (SELECT array_agg(ur.role::text ORDER BY ur.role::text)
         FROM public.user_roles ur WHERE ur.user_id = p.user_id),
      ARRAY[]::text[]
    ) AS roles,
    cc.client_id,
    c.name AS client_name,
    au.email_confirmed_at,
    au.banned_until,
    au.last_sign_in_at,
    p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT cc1.client_id
      FROM public.client_contacts cc1
     WHERE cc1.user_id = p.user_id AND cc1.is_active = true
     ORDER BY cc1.created_at DESC
     LIMIT 1
  ) cc ON true
  LEFT JOIN public.clients c ON c.id = cc.client_id
  ORDER BY p.full_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_users_for_admin() TO authenticated;