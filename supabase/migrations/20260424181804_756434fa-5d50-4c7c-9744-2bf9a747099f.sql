DO $$
DECLARE
  v_user_ids uuid[];
  v_roles_deleted integer := 0;
  v_profiles_deleted integer := 0;
  v_users_deleted integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_user_ids
  FROM auth.users
  WHERE email IN (
    'teste.final.fluxo@testlovable.com',
    'teste.trigger.auto@testlovable.com'
  );

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RAISE NOTICE '[cleanup_orphan_test_users] No test users found';
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = ANY(v_user_ids);
  GET DIAGNOSTICS v_roles_deleted = ROW_COUNT;

  DELETE FROM public.profiles WHERE user_id = ANY(v_user_ids);
  GET DIAGNOSTICS v_profiles_deleted = ROW_COUNT;

  DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

  RAISE NOTICE '[cleanup_orphan_test_users] Deleted: % roles, % profiles, % auth users',
    v_roles_deleted, v_profiles_deleted, v_users_deleted;
END $$;