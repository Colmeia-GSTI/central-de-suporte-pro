-- Adiciona coluna gerada normalized_document para detecção de duplicatas
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS normalized_document text
GENERATED ALWAYS AS (regexp_replace(coalesce(document, ''), '\D', '', 'g')) STORED;

-- Índice NÃO único (UNIQUE será criado em 1.2c após resolver duplicatas existentes
-- AIRDUTO LTDA e VIZU EDITORA. Tentar UNIQUE agora falharia)
CREATE INDEX IF NOT EXISTS idx_clients_normalized_document
ON public.clients (normalized_document)
WHERE normalized_document <> '';

-- =====================================================================
-- detect_duplicate_clients: lista grupos com mesmo CNPJ normalizado
-- =====================================================================
CREATE OR REPLACE FUNCTION public.detect_duplicate_clients()
RETURNS TABLE(
  normalized_document text,
  occurrences bigint,
  clients jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can detect duplicates';
  END IF;

  RETURN QUERY
  WITH groups AS (
    SELECT c.normalized_document AS nd
    FROM public.clients c
    WHERE c.normalized_document <> ''
    GROUP BY c.normalized_document
    HAVING count(*) >= 2
  )
  SELECT
    g.nd,
    count(c.id)::bigint,
    jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'trade_name', c.trade_name,
      'document', c.document,
      'email', c.email,
      'is_active', c.is_active,
      'created_at', c.created_at,
      'contracts_count', (SELECT count(*) FROM public.contracts WHERE client_id = c.id),
      'tickets_count', (SELECT count(*) FROM public.tickets WHERE client_id = c.id),
      'invoices_count', (SELECT count(*) FROM public.invoices WHERE client_id = c.id),
      'contacts_count', (SELECT count(*) FROM public.client_contacts WHERE client_id = c.id)
    ) ORDER BY c.created_at)
  FROM groups g
  JOIN public.clients c ON c.normalized_document = g.nd
  GROUP BY g.nd;
END;
$$;

-- =====================================================================
-- merge_clients: mescla source no target preservando dados
-- Estratégia híbrida: target prevalece; campos NULL no target recebem do source;
-- field_overrides (jsonb) sobrescreve qualquer campo explicitamente
-- =====================================================================
CREATE OR REPLACE FUNCTION public.merge_clients(
  source_id uuid,
  target_id uuid,
  field_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source public.clients%ROWTYPE;
  v_target public.clients%ROWTYPE;
  v_refs jsonb := '{}'::jsonb;
  v_count integer;
  v_new_target jsonb;
  v_fields_updated text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can merge clients';
  END IF;

  IF source_id = target_id THEN
    RAISE EXCEPTION 'source_id e target_id devem ser diferentes';
  END IF;

  SELECT * INTO v_source FROM public.clients WHERE id = source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente source não encontrado: %', source_id; END IF;

  SELECT * INTO v_target FROM public.clients WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente target não encontrado: %', target_id; END IF;

  IF v_source.normalized_document IS DISTINCT FROM v_target.normalized_document
     OR coalesce(v_source.normalized_document, '') = '' THEN
    RAISE EXCEPTION 'Clientes não compartilham mesmo CNPJ normalizado (defesa contra merge incorreto)';
  END IF;

  -- Migrar referências (todas as FKs apontando para clients.id)
  -- SET NULL refs
  UPDATE public.tickets SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('tickets', v_count);

  UPDATE public.calendar_events SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('calendar_events', v_count);

  UPDATE public.financial_entries SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('financial_entries', v_count);

  UPDATE public.nfse_history SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('nfse_history', v_count);

  -- CASCADE refs (migrar antes do delete para não perder dados)
  UPDATE public.contracts SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('contracts', v_count);

  UPDATE public.invoices SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('invoices', v_count);

  UPDATE public.client_contacts SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_contacts', v_count);

  UPDATE public.assets SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('assets', v_count);

  UPDATE public.client_history SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_history', v_count);

  UPDATE public.client_technicians SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_technicians', v_count);

  UPDATE public.client_external_mappings SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_external_mappings', v_count);

  UPDATE public.sla_configs SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('sla_configs', v_count);

  -- Aplicar estratégia híbrida B+A no target
  UPDATE public.clients SET
    name = COALESCE(field_overrides->>'name', v_target.name),
    trade_name = COALESCE(field_overrides->>'trade_name', v_target.trade_name, v_source.trade_name),
    nickname = COALESCE(field_overrides->>'nickname', v_target.nickname, v_source.nickname),
    email = COALESCE(field_overrides->>'email', v_target.email, v_source.email),
    financial_email = COALESCE(field_overrides->>'financial_email', v_target.financial_email, v_source.financial_email),
    phone = COALESCE(field_overrides->>'phone', v_target.phone, v_source.phone),
    whatsapp = COALESCE(field_overrides->>'whatsapp', v_target.whatsapp, v_source.whatsapp),
    address = COALESCE(field_overrides->>'address', v_target.address, v_source.address),
    city = COALESCE(field_overrides->>'city', v_target.city, v_source.city),
    state = COALESCE(field_overrides->>'state', v_target.state, v_source.state),
    zip_code = COALESCE(field_overrides->>'zip_code', v_target.zip_code, v_source.zip_code),
    state_registration = COALESCE(field_overrides->>'state_registration', v_target.state_registration, v_source.state_registration),
    notes = COALESCE(field_overrides->>'notes', v_target.notes, v_source.notes),
    asaas_customer_id = COALESCE(v_target.asaas_customer_id, v_source.asaas_customer_id),
    updated_at = now()
  WHERE id = target_id
  RETURNING to_jsonb(clients.*) INTO v_new_target;

  -- Audit log
  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
  VALUES (
    'clients', target_id, 'MERGE', auth.uid(),
    jsonb_build_object('source', to_jsonb(v_source), 'target_before', to_jsonb(v_target)),
    jsonb_build_object('target_after', v_new_target, 'refs_migrated', v_refs, 'overrides', field_overrides)
  );

  -- Histórico no client_history
  INSERT INTO public.client_history (client_id, user_id, action, comment, changes)
  VALUES (
    target_id, auth.uid(), 'merged',
    format('Mesclado a partir do cliente %s (%s)', v_source.name, source_id),
    jsonb_build_object('source_id', source_id, 'source_name', v_source.name, 'refs_migrated', v_refs)
  );

  -- Deletar source
  DELETE FROM public.clients WHERE id = source_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_id', target_id,
    'references_migrated', v_refs,
    'fields_updated', v_fields_updated
  );
END;
$$;

-- =====================================================================
-- delete_client_safely: bloqueia exclusão se houver vínculos ativos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.delete_client_safely(
  p_client_id uuid,
  p_preview boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active_contracts integer;
  v_open_tickets integer;
  v_pending_invoices integer;
  v_blockers jsonb := '[]'::jsonb;
  v_client public.clients%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can delete clients';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;

  SELECT count(*) INTO v_active_contracts FROM public.contracts WHERE client_id = p_client_id AND status = 'active';
  SELECT count(*) INTO v_open_tickets FROM public.tickets WHERE client_id = p_client_id AND status NOT IN ('resolved','closed');
  SELECT count(*) INTO v_pending_invoices FROM public.invoices WHERE client_id = p_client_id AND status IN ('pending','overdue');

  IF v_active_contracts > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','active_contracts','count',v_active_contracts));
  END IF;
  IF v_open_tickets > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','open_tickets','count',v_open_tickets));
  END IF;
  IF v_pending_invoices > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','pending_invoices','count',v_pending_invoices));
  END IF;

  IF jsonb_array_length(v_blockers) > 0 THEN
    IF p_preview THEN
      RETURN jsonb_build_object('can_delete', false, 'blockers', v_blockers);
    END IF;
    RAISE EXCEPTION 'Não é possível excluir: %', v_blockers::text;
  END IF;

  IF p_preview THEN
    RETURN jsonb_build_object('can_delete', true, 'blockers', '[]'::jsonb);
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data)
  VALUES ('clients', p_client_id, 'DELETE', auth.uid(), to_jsonb(v_client));

  DELETE FROM public.clients WHERE id = p_client_id;

  RETURN jsonb_build_object('success', true, 'deleted_id', p_client_id);
END;
$$;