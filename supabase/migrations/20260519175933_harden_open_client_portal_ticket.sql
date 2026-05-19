-- ============================================================================
-- Hardening: open_client_portal_ticket
-- ============================================================================
-- Substitui a versão anterior por uma que:
--   1. Distingue causas de falha (sem contato vs inativo vs role) com mensagens claras
--   2. Aceita telefone com 10-13 dígitos (suporta prefixo +55)
--   3. Valida category_id (existe e está ativa) antes do INSERT
--   4. Valida asset_id (existe E pertence ao cliente)
--   5. Valida monitored_device_id (pertence ao cliente)
--   6. Captura EXCEPTION genérica no final e retorna SQLSTATE+MESSAGE pro toast
--
-- Mantém a mesma assinatura (drop-in replacement).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_client_portal_ticket(
  p_title text,
  p_description text,
  p_priority public.ticket_priority,
  p_contact_phone text,
  p_contact_phone_is_whatsapp boolean,
  p_category_id uuid DEFAULT NULL,
  p_asset_id uuid DEFAULT NULL,
  p_asset_description text DEFAULT NULL,
  p_monitored_device_id uuid DEFAULT NULL,
  p_device_hostname_text text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_client_id uuid;
  v_contact_active boolean;
  v_contact_count int;
  v_has_role boolean;
  v_phone_digits text;
  v_ticket_id uuid;
  v_uid uuid;
  v_err_state text;
  v_err_msg text;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Diagnóstico granular de contato
  SELECT COUNT(*) INTO v_contact_count
  FROM public.client_contacts
  WHERE user_id = v_uid;

  IF v_contact_count = 0 THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhum cliente. Entre em contato com o suporte.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Pega o primeiro contato ATIVO; se não houver, dá mensagem específica
  SELECT id, client_id, is_active
    INTO v_contact_id, v_client_id, v_contact_active
  FROM public.client_contacts
  WHERE user_id = v_uid
  ORDER BY is_active DESC, created_at ASC
  LIMIT 1;

  IF v_contact_id IS NULL OR NOT v_contact_active THEN
    RAISE EXCEPTION 'Seu cadastro de contato está inativo. Entre em contato com o suporte para reativar.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Contato cadastrado mas sem cliente vinculado. Entre em contato com o suporte.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Role
  SELECT (
    public.has_role(v_uid, 'client'::public.app_role)
    OR public.has_role(v_uid, 'client_master'::public.app_role)
  ) INTO v_has_role;

  IF NOT v_has_role THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para abrir chamados no portal.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validações de tamanho
  IF p_title IS NULL OR length(btrim(p_title)) < 5 OR length(p_title) > 255 THEN
    RAISE EXCEPTION 'Título deve ter entre 5 e 255 caracteres.' USING ERRCODE = 'P0001';
  END IF;

  IF p_description IS NULL OR length(btrim(p_description)) < 20 OR length(p_description) > 10000 THEN
    RAISE EXCEPTION 'Descrição deve ter entre 20 e 10000 caracteres.' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Telefone: aceita 10–13 dígitos (10 fixo, 11 celular, 12-13 com +55)
  v_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  -- Strip prefixo 55 se vier (DDI Brasil)
  IF length(v_phone_digits) IN (12, 13) AND substring(v_phone_digits, 1, 2) = '55' THEN
    v_phone_digits := substring(v_phone_digits, 3);
  END IF;
  IF length(v_phone_digits) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone inválido. Use DDD + número (10 ou 11 dígitos).'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. XOR device/hostname
  IF p_monitored_device_id IS NOT NULL
     AND p_device_hostname_text IS NOT NULL
     AND length(btrim(p_device_hostname_text)) > 0 THEN
    RAISE EXCEPTION 'Informe apenas dispositivo monitorado OU hostname livre.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Validar category_id se informado
  IF p_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ticket_categories
      WHERE id = p_category_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Categoria selecionada não está mais disponível. Recarregue a página.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 7. Validar asset_id pertence ao cliente
  IF p_asset_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assets
      WHERE id = p_asset_id AND client_id = v_client_id
    ) THEN
      RAISE EXCEPTION 'Dispositivo selecionado não pertence ao seu cliente. Recarregue a página.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 8. Validar monitored_device_id pertence ao cliente
  IF p_monitored_device_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.monitored_devices
      WHERE id = p_monitored_device_id AND client_id = v_client_id
    ) THEN
      RAISE EXCEPTION 'Computador monitorado selecionado não pertence ao seu cliente.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 9. INSERT (envolto em try/catch para capturar trigger errors)
  BEGIN
    INSERT INTO public.tickets (
      title, description, priority, status, origin,
      client_id, requester_contact_id, created_by,
      contact_phone, contact_phone_is_whatsapp,
      category_id, asset_id, asset_description,
      monitored_device_id, device_hostname_text
    ) VALUES (
      btrim(p_title), btrim(p_description), p_priority,
      'open'::public.ticket_status, 'portal'::public.ticket_origin,
      v_client_id, v_contact_id, v_uid,
      v_phone_digits, coalesce(p_contact_phone_is_whatsapp, false),
      p_category_id, p_asset_id,
      nullif(btrim(coalesce(p_asset_description, '')), ''),
      p_monitored_device_id,
      nullif(btrim(coalesce(p_device_hostname_text, '')), '')
    ) RETURNING id INTO v_ticket_id;

    INSERT INTO public.ticket_history (
      ticket_id, user_id, old_status, new_status, comment
    ) VALUES (
      v_ticket_id, v_uid, NULL, 'open'::public.ticket_status,
      'Chamado criado via portal'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_state = RETURNED_SQLSTATE,
      v_err_msg = MESSAGE_TEXT;
    RAISE EXCEPTION 'Falha ao criar chamado [%]: %', v_err_state, v_err_msg
      USING ERRCODE = 'P0001';
  END;

  RETURN v_ticket_id;
END;
$$;

COMMENT ON FUNCTION public.open_client_portal_ticket IS
  'Abertura de chamado pelo portal. Hardening 2026-05-19: diagnóstico granular de contato/role, telefone 10-13 dígitos, validação de FKs, captura de trigger errors.';
