
CREATE OR REPLACE FUNCTION public.try_bootstrap_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
BEGIN
  -- Lock the user_roles table rows for admin to serialize concurrent attempts
  SELECT count(*) INTO admin_count
  FROM public.user_roles
  WHERE role = 'admin'
  FOR UPDATE;

  IF admin_count > 0 THEN
    RETURN false;
  END IF;

  -- Delete any default roles for this user
  DELETE FROM public.user_roles WHERE user_id = _user_id;

  -- Insert admin role
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'admin');

  RETURN true;
END;
$$;
