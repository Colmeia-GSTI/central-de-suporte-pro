-- =============================================================================
-- Hermes Bot: usuário técnico de IA + 3 RPCs atômicas
-- =============================================================================

-- PARTE A: Profile + role do Hermes Bot (idempotente)
-- Pré-requisito manual: criar o usuário 'hermes@colmeiagsti.com.br' em
-- Authentication > Users > Add user (Auto Confirm = true). Em seguida,
-- re-executar esta migração para garantir profile + role 'technician'.
DO $$
DECLARE
  v_hermes_id uuid;
BEGIN
  SELECT id INTO v_hermes_id
  FROM auth.users
  WHERE email = 'hermes@colmeiagsti.com.br'
  LIMIT 1;

  IF v_hermes_id IS NULL THEN
    RAISE NOTICE '[Hermes] Auth user nao encontrado. Crie hermes@colmeiagsti.com.br no painel Authentication > Users (Auto Confirm = true) e RE-EXECUTE esta migracao.';
  ELSE
    -- Garante profile
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (v_hermes_id, 'Hermes Bot', 'hermes@colmeiagsti.com.br')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          email     = EXCLUDED.email;

    -- Remove role 'client' criado pelo trigger handle_new_user
    DELETE FROM public.user_roles
    WHERE user_id = v_hermes_id AND role = 'client';

    -- Garante role 'technician' (exatamente esse)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_hermes_id, 'technician')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE '[Hermes] Auth user encontrado (id=%). Profile garantido e role technician aplicada.', v_hermes_id;
  END IF;
END $$;


-- =============================================================================
-- PARTE B: RPCs SECURITY DEFINER (search_path = public)
-- =============================================================================

-- 1) hermes_comment_ticket
CREATE OR REPLACE FUNCTION public.hermes_comment_ticket(
  p_ticket_id uuid,
  p_comment   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  IF p_comment IS NULL OR length(p_comment) < 1 OR length(p_comment) > 10000 THEN
    RAISE EXCEPTION 'Comentario invalido (1..10000 caracteres)' USING ERRCODE='P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id = p_ticket_id) THEN
    RAISE EXCEPTION 'Chamado nao encontrado' USING ERRCODE='P0001';
  END IF;

  INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal)
  VALUES (p_ticket_id, auth.uid(), p_comment, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.hermes_comment_ticket(uuid, text)
IS 'Uso exclusivo do agente Hermes Bot - insere comentario publico em ticket.';


-- 2) hermes_take_ticket
CREATE OR REPLACE FUNCTION public.hermes_take_ticket(
  p_ticket_id uuid,
  p_comment   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  UPDATE tickets
     SET assigned_to       = auth.uid(),
         status            = 'in_progress',
         started_at        = COALESCE(started_at, now()),
         first_response_at = COALESCE(first_response_at, now())
   WHERE id = p_ticket_id
     AND assigned_to IS NULL
     AND status = 'open';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Chamado ja assumido ou nao esta aberto' USING ERRCODE='P0001';
  END IF;

  UPDATE ticket_attendance_sessions
     SET ended_at = now()
   WHERE ticket_id = p_ticket_id
     AND ended_at IS NULL;

  INSERT INTO ticket_attendance_sessions (ticket_id, started_by, started_at)
  VALUES (p_ticket_id, auth.uid(), now());

  INSERT INTO ticket_history (ticket_id, user_id, old_status, new_status, comment)
  VALUES (p_ticket_id, auth.uid(), 'open', 'in_progress', 'Atendimento iniciado (Hermes)');

  IF p_comment IS NOT NULL AND length(trim(p_comment)) > 0 THEN
    IF length(p_comment) > 10000 THEN
      RAISE EXCEPTION 'Comentario invalido (1..10000 caracteres)' USING ERRCODE='P0001';
    END IF;
    INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal)
    VALUES (p_ticket_id, auth.uid(), p_comment, false);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.hermes_take_ticket(uuid, text)
IS 'Uso exclusivo do agente Hermes Bot - assume ticket aberto atomicamente.';


-- 3) hermes_resolve_ticket
CREATE OR REPLACE FUNCTION public.hermes_resolve_ticket(
  p_ticket_id  uuid,
  p_comment    text,
  p_confidence numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  IF p_confidence IS NULL OR p_confidence < 0.8 THEN
    RAISE EXCEPTION 'Confianca insuficiente para resolucao autonoma (minimo 0.8)' USING ERRCODE='P0001';
  END IF;

  IF p_comment IS NULL OR length(p_comment) < 1 OR length(p_comment) > 10000 THEN
    RAISE EXCEPTION 'Comentario invalido (1..10000 caracteres)' USING ERRCODE='P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tickets
     WHERE id = p_ticket_id
       AND assigned_to = auth.uid()
       AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Chamado nao esta em atendimento por voce' USING ERRCODE='P0001';
  END IF;

  UPDATE ticket_attendance_sessions
     SET ended_at = now()
   WHERE ticket_id = p_ticket_id
     AND ended_at IS NULL;

  UPDATE tickets
     SET status      = 'resolved',
         resolved_at = COALESCE(resolved_at, now())
   WHERE id = p_ticket_id;

  INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal)
  VALUES (p_ticket_id, auth.uid(), p_comment, false);

  INSERT INTO ticket_history (ticket_id, user_id, old_status, new_status, comment, field_changes)
  VALUES (
    p_ticket_id,
    auth.uid(),
    'in_progress',
    'resolved',
    'Resolvido pelo Hermes',
    jsonb_build_object('confidence', p_confidence)
  );
END;
$$;

COMMENT ON FUNCTION public.hermes_resolve_ticket(uuid, text, numeric)
IS 'Uso exclusivo do agente Hermes Bot - resolve ticket com gate de confianca >= 0.8.';


-- =============================================================================
-- PARTE C: GRANTs
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.hermes_comment_ticket(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.hermes_take_ticket(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.hermes_resolve_ticket(uuid, text, numeric) TO authenticated;
