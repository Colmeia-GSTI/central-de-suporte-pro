-- ============================================================================
-- Bloqueio do signup público + fluxo de convite admin (Opção A)
-- ============================================================================
-- Causa-raiz do bug dos 10 órfãos: signup público criava auth.users + role
-- sem vínculo em client_contacts. Agora, todo novo usuário precisa de convite
-- pendente válido em `pending_invites` ANTES do auth.users ser criado.
-- Bootstrap pelo service_role (admin SDK em edge functions) continua livre.
-- ============================================================================

-- 1. Tabela de convites pendentes
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Convite de cliente exige client_id; staff não pode ter client_id
  CONSTRAINT chk_client_role CHECK (
    (role IN ('client', 'client_master') AND client_id IS NOT NULL)
    OR
    (role IN ('admin', 'manager', 'technician', 'financial') AND client_id IS NULL)
  )
);

CREATE INDEX idx_pending_invites_token ON public.pending_invites(token);
CREATE INDEX idx_pending_invites_email_active
  ON public.pending_invites(lower(email))
  WHERE accepted_at IS NULL;
CREATE INDEX idx_pending_invites_client ON public.pending_invites(client_id);

COMMENT ON TABLE public.pending_invites IS
  'Convites pendentes — qualquer auth.users novo precisa de uma linha aqui (não expirada/não aceita), exceto inserts via service_role.';

-- 2. RLS
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê todos os convites"
  ON public.pending_invites FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff cria convites"
  ON public.pending_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND invited_by = auth.uid()
  );

CREATE POLICY "Staff revoga/edita convites"
  ON public.pending_invites FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff deleta convites antigos"
  ON public.pending_invites FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 3. Função utilitária para validar convite (usada pelo trigger e pela RPC)
CREATE OR REPLACE FUNCTION public.find_valid_invite(p_email text)
RETURNS public.pending_invites
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.pending_invites
  WHERE lower(email) = lower(p_email)
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- 4. Trigger: bloquear auth.users INSERT sem convite válido
-- Não bloqueia se a sessão é service_role (admin SDK em edge functions).
CREATE OR REPLACE FUNCTION public.enforce_invite_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_invite public.pending_invites%ROWTYPE;
BEGIN
  -- Bypass para service_role (admin SDK em edge functions cria com privilégio elevado)
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Caso contrário, exige convite válido
  SELECT * INTO v_invite FROM public.find_valid_invite(NEW.email);

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro público desabilitado. Solicite acesso ao administrador.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invite_on_signup ON auth.users;
CREATE TRIGGER trg_enforce_invite_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_on_signup();

-- 5. RPC: aceitar convite (chamada após signUp do Supabase)
-- Vincula o usuário recém-criado ao client_contacts/user_roles conforme o convite.
CREATE OR REPLACE FUNCTION public.accept_invite(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.pending_invites%ROWTYPE;
  v_user_id uuid;
  v_user_email text;
  v_contact_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada' USING ERRCODE = 'P0001';
  END IF;

  -- Carrega email do usuário corrente
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Busca convite pelo token + valida
  SELECT * INTO v_invite
  FROM public.pending_invites
  WHERE token = p_token
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Convite não encontrado ou inválido.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este convite já foi utilizado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite expirado. Solicite um novo ao administrador.' USING ERRCODE = 'P0001';
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'O email do convite não corresponde à conta atual.' USING ERRCODE = 'P0001';
  END IF;

  -- Limpa role default 'client' inserida pelo trigger handle_new_user
  -- caso o convite seja para staff (admin/manager/technician/financial)
  IF v_invite.role NOT IN ('client', 'client_master') THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'client';
  END IF;

  -- Cria role do convite
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_invite.role)
  ON CONFLICT DO NOTHING;

  -- Se for client_master, também remove role 'client' duplicada
  -- (client_master engloba client; ter ambas confunde a lógica)
  IF v_invite.role = 'client_master' THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'client';
  END IF;

  -- Se é cliente, cria client_contacts vinculado
  IF v_invite.role IN ('client', 'client_master') THEN
    INSERT INTO public.client_contacts (
      client_id, user_id, name, email, is_active, is_primary
    )
    VALUES (
      v_invite.client_id, v_user_id,
      coalesce(v_invite.full_name, split_part(v_user_email, '@', 1)),
      v_user_email, true, false
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_contact_id;
  END IF;

  -- Cria perfil se ainda não existe
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (v_user_id, coalesce(v_invite.full_name, split_part(v_user_email, '@', 1)), v_user_email)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = coalesce(EXCLUDED.full_name, public.profiles.full_name),
    email = EXCLUDED.email;

  -- Marca como aceito
  UPDATE public.pending_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'role', v_invite.role,
    'client_id', v_invite.client_id,
    'contact_id', v_contact_id,
    'redirect', CASE
      WHEN v_invite.role IN ('client', 'client_master') THEN '/portal'
      ELSE '/'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_invite IS
  'Aceita um convite após o signUp do Supabase. Vincula user_roles + client_contacts + profile e marca o convite como aceito.';

-- 6. Função pública (anônima) para buscar info do convite na tela /setup-account
-- Permite mostrar nome do cliente / role antes do usuário criar a senha.
CREATE OR REPLACE FUNCTION public.get_invite_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.pending_invites%ROWTYPE;
  v_client_name text;
BEGIN
  SELECT * INTO v_invite
  FROM public.pending_invites
  WHERE token = p_token
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'already_used');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF v_invite.client_id IS NOT NULL THEN
    SELECT name INTO v_client_name FROM public.clients WHERE id = v_invite.client_id;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'email', v_invite.email,
    'full_name', v_invite.full_name,
    'role', v_invite.role,
    'client_name', v_client_name,
    'expires_at', v_invite.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_info(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_invite_info IS
  'Retorna informações públicas (não-sensíveis) do convite para a tela /setup-account. Não revela tokens nem dados internos.';
