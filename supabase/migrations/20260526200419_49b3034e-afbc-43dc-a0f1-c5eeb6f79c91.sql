CREATE OR REPLACE FUNCTION public.admin_accept_invite(p_invite_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite public.pending_invites%ROWTYPE;
  v_user_email text;
  v_contact_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id obrigatório' USING ERRCODE = 'P0001';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_invite FROM public.pending_invites WHERE id = p_invite_id LIMIT 1;
  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este convite já foi utilizado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite expirado.' USING ERRCODE = 'P0001';
  END IF;
  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'O email do convite não corresponde ao usuário.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.role NOT IN ('client', 'client_master') THEN
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'client';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, v_invite.role) ON CONFLICT DO NOTHING;

  IF v_invite.role = 'client_master' THEN
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'client';
  END IF;

  IF v_invite.role IN ('client', 'client_master') THEN
    INSERT INTO public.client_contacts (client_id, user_id, name, email, is_active, is_primary)
    VALUES (
      v_invite.client_id, p_user_id,
      coalesce(v_invite.full_name, split_part(v_user_email, '@', 1)),
      v_user_email, true, false
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_contact_id;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (p_user_id, coalesce(v_invite.full_name, split_part(v_user_email, '@', 1)), v_user_email)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = coalesce(EXCLUDED.full_name, public.profiles.full_name),
    email = EXCLUDED.email;

  UPDATE public.pending_invites SET accepted_at = now() WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'role', v_invite.role,
    'client_id', v_invite.client_id,
    'contact_id', v_contact_id,
    'redirect', CASE WHEN v_invite.role IN ('client', 'client_master') THEN '/portal' ELSE '/' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_accept_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_accept_invite(uuid, uuid) TO service_role;