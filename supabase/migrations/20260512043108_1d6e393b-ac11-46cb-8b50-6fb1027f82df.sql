-- =========================================================================
-- PARTE A — Correção RLS de tickets para portal do cliente + RPC central
-- =========================================================================

-- 1) Remover policies antigas conflitantes:
--    "Users can create tickets": só validava created_by = auth.uid()
--    "Client users can create tickets": só validava role, não validava vínculo
DROP POLICY IF EXISTS "Users can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "Client users can create tickets" ON public.tickets;

-- 2) Policy INSERT consolidada e estrita: staff sempre pode; cliente só
--    consegue inserir se o requester_contact_id pertence ao próprio user,
--    ao client_id alvo e está ativo, e a origem é 'portal'.
CREATE POLICY "Tickets INSERT consolidated" ON public.tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff(auth.uid())
    OR (
      (has_role(auth.uid(), 'client'::app_role) OR has_role(auth.uid(), 'client_master'::app_role))
      AND requester_contact_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.client_contacts cc
        WHERE cc.id = tickets.requester_contact_id
          AND cc.user_id = auth.uid()
          AND cc.client_id = tickets.client_id
          AND cc.is_active = true
      )
      AND origin = 'portal'::ticket_origin
    )
  );

-- 3) RPC SECURITY DEFINER: abre o chamado pelo portal de forma centralizada,
--    com validações de tamanho, telefone e vínculo. Retorna o id criado.
CREATE OR REPLACE FUNCTION public.open_client_portal_ticket(
  p_title text,
  p_description text,
  p_priority ticket_priority,
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
  v_phone_digits text;
  v_ticket_id uuid;
BEGIN
  -- Carrega contato ativo vinculado ao usuário logado
  SELECT id, client_id INTO v_contact_id, v_client_id
  FROM public.client_contacts
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RAISE EXCEPTION 'Contato do cliente não encontrado ou inativo'
      USING ERRCODE = 'P0001';
  END IF;

  -- Valida role
  IF NOT (has_role(auth.uid(), 'client'::app_role) OR has_role(auth.uid(), 'client_master'::app_role)) THEN
    RAISE EXCEPTION 'Usuário sem permissão de cliente' USING ERRCODE = 'P0001';
  END IF;

  -- Validações de tamanho
  IF p_title IS NULL OR length(p_title) < 5 OR length(p_title) > 255 THEN
    RAISE EXCEPTION 'Título deve ter entre 5 e 255 caracteres' USING ERRCODE = 'P0001';
  END IF;

  IF p_description IS NULL OR length(p_description) < 20 OR length(p_description) > 10000 THEN
    RAISE EXCEPTION 'Descrição deve ter entre 20 e 10000 caracteres' USING ERRCODE = 'P0001';
  END IF;

  v_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  IF length(v_phone_digits) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone inválido' USING ERRCODE = 'P0001';
  END IF;

  -- XOR device/hostname (defesa em profundidade; também garantido por CHECK)
  IF p_monitored_device_id IS NOT NULL AND p_device_hostname_text IS NOT NULL
     AND length(trim(p_device_hostname_text)) > 0 THEN
    RAISE EXCEPTION 'Informe apenas dispositivo monitorado OU hostname livre' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tickets (
    title, description, priority, status, origin,
    client_id, requester_contact_id, created_by,
    contact_phone, contact_phone_is_whatsapp,
    category_id, asset_id, asset_description,
    monitored_device_id, device_hostname_text
  ) VALUES (
    p_title, p_description, p_priority, 'open'::ticket_status, 'portal'::ticket_origin,
    v_client_id, v_contact_id, auth.uid(),
    v_phone_digits, coalesce(p_contact_phone_is_whatsapp, false),
    p_category_id, p_asset_id, p_asset_description,
    p_monitored_device_id, nullif(trim(coalesce(p_device_hostname_text, '')), '')
  ) RETURNING id INTO v_ticket_id;

  -- Histórico inicial
  INSERT INTO public.ticket_history (ticket_id, user_id, old_status, new_status, comment)
  VALUES (v_ticket_id, auth.uid(), NULL, 'open'::ticket_status, 'Chamado criado via portal');

  RETURN v_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_client_portal_ticket(
  text, text, ticket_priority, text, boolean, uuid, uuid, text, uuid, text
) TO authenticated;