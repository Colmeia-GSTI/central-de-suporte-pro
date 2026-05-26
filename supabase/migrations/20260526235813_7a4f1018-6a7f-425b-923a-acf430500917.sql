
CREATE OR REPLACE FUNCTION public.vault_upsert_secret(p_name text, p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR length(p_name) = 0 THEN
    RAISE EXCEPTION 'secret name required';
  END IF;
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RAISE EXCEPTION 'secret value required';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;

  IF v_id IS NULL THEN
    SELECT vault.create_secret(p_secret, p_name) INTO v_id;
  ELSE
    PERFORM vault.update_secret(v_id, p_secret, p_name);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_upsert_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_upsert_secret(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_upsert_secret(text, text) TO service_role;

COMMENT ON FUNCTION public.vault_upsert_secret(text, text) IS
'TEMPORARY: used by edge function setup-hermes-bot to store the Hermes Bot password in Vault. Remove together with the setup-hermes-bot function.';
