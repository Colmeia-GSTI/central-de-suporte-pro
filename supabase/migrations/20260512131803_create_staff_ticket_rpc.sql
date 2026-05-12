-- ============================================================================
-- Migration: create_staff_ticket — RPC SECURITY DEFINER transacional para staff
-- ============================================================================
-- Substitui o caminho de INSERT direto + 3 inserts paralelos no TicketForm.tsx
-- por uma única chamada atômica que:
--   1. Valida permissões (apenas staff)
--   2. Valida campos (tamanhos, telefone, XOR device/hostname)
--   3. Insere o ticket
--   4. Cria registro em ticket_history
--   5. Atribui tags (se fornecidas)
-- Tudo numa só transação — sem race conditions entre tabelas.
--
-- A edge function `send-ticket-notification` continua sendo chamada do client
-- como fire-and-forget após o sucesso da RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_staff_ticket(
  p_ticket_type text,                                  -- 'external' | 'internal' | 'task'
  p_title text,
  p_description text,
  p_priority public.ticket_priority,
  p_origin public.ticket_origin,
  p_client_id uuid DEFAULT NULL,
  p_requester_contact_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_asset_id uuid DEFAULT NULL,
  p_asset_description text DEFAULT NULL,
  p_monitored_device_id uuid DEFAULT NULL,
  p_device_hostname_text text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_phone_is_whatsapp boolean DEFAULT false,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_status public.ticket_status;
  v_is_internal boolean;
  v_phone_digits text;
  v_tag_id uuid;
  v_creation_comment text;
BEGIN
  -- 1. Autorização: apenas staff
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas staff pode criar chamados via esta função'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validações
  IF p_ticket_type NOT IN ('external', 'internal', 'task') THEN
    RAISE EXCEPTION 'Tipo de chamado inválido' USING ERRCODE = 'P0001';
  END IF;

  IF p_title IS NULL OR length(p_title) < 5 OR length(p_title) > 255 THEN
    RAISE EXCEPTION 'Título deve ter entre 5 e 255 caracteres' USING ERRCODE = 'P0001';
  END IF;

  IF p_description IS NULL OR length(p_description) < 20 OR length(p_description) > 10000 THEN
    RAISE EXCEPTION 'Descrição deve ter entre 20 e 10000 caracteres' USING ERRCODE = 'P0001';
  END IF;

  IF p_ticket_type = 'external' AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'Chamado externo exige cliente' USING ERRCODE = 'P0001';
  END IF;

  -- XOR device monitorado / hostname livre
  IF p_monitored_device_id IS NOT NULL
     AND p_device_hostname_text IS NOT NULL
     AND length(trim(p_device_hostname_text)) > 0 THEN
    RAISE EXCEPTION 'Informe apenas dispositivo monitorado OU hostname livre'
      USING ERRCODE = 'P0001';
  END IF;

  -- Telefone: aceita vazio (staff pode omitir), mas se informado deve ser válido
  v_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  IF v_phone_digits <> '' AND length(v_phone_digits) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone inválido' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Derivar status e flags
  v_is_internal := p_ticket_type IN ('internal', 'task');
  v_status := CASE WHEN p_assigned_to IS NOT NULL
                   THEN 'in_progress'::public.ticket_status
                   ELSE 'open'::public.ticket_status
              END;

  v_creation_comment := CASE p_ticket_type
    WHEN 'task'     THEN 'Tarefa criada'
    WHEN 'internal' THEN 'Chamado interno criado'
    ELSE                 'Chamado criado'
  END;
  IF p_assigned_to IS NOT NULL THEN
    v_creation_comment := v_creation_comment || ' e atribuído';
  END IF;

  -- 4. INSERT principal
  INSERT INTO public.tickets (
    title, description, priority, status, origin,
    client_id, requester_contact_id, created_by, assigned_to,
    category_id, subcategory_id,
    asset_id, asset_description,
    monitored_device_id, device_hostname_text,
    contact_phone, contact_phone_is_whatsapp,
    is_internal, first_response_at
  ) VALUES (
    p_title,
    p_description,
    p_priority,
    v_status,
    p_origin,
    CASE WHEN p_ticket_type = 'task' THEN NULL ELSE p_client_id END,
    CASE WHEN p_ticket_type = 'task' THEN NULL ELSE p_requester_contact_id END,
    auth.uid(),
    p_assigned_to,
    p_category_id,
    p_subcategory_id,
    p_asset_id,
    nullif(trim(coalesce(p_asset_description, '')), ''),
    p_monitored_device_id,
    nullif(trim(coalesce(p_device_hostname_text, '')), ''),
    nullif(v_phone_digits, ''),
    coalesce(p_contact_phone_is_whatsapp, false),
    v_is_internal,
    CASE WHEN p_assigned_to IS NOT NULL THEN now() ELSE NULL END
  ) RETURNING id INTO v_ticket_id;

  -- 5. ticket_history (criação)
  INSERT INTO public.ticket_history (
    ticket_id, user_id, old_status, new_status, comment
  ) VALUES (
    v_ticket_id, auth.uid(), NULL, v_status, v_creation_comment
  );

  -- 6. tags
  IF array_length(p_tag_ids, 1) > 0 THEN
    FOREACH v_tag_id IN ARRAY p_tag_ids LOOP
      INSERT INTO public.ticket_tag_assignments (ticket_id, tag_id)
      VALUES (v_ticket_id, v_tag_id);
    END LOOP;
  END IF;

  RETURN v_ticket_id;
END;
$$;

COMMENT ON FUNCTION public.create_staff_ticket IS
  'RPC transacional para criação de chamados pelo staff. Substitui o INSERT direto do TicketForm. Cria ticket + history + tags atomicamente.';

GRANT EXECUTE ON FUNCTION public.create_staff_ticket(
  text, text, text,
  public.ticket_priority, public.ticket_origin,
  uuid, uuid, uuid, uuid, uuid,
  uuid, text, uuid, text,
  text, boolean, uuid[]
) TO authenticated;
