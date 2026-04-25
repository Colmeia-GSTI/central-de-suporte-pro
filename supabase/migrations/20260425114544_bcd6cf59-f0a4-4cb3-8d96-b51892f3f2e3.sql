-- Merge legado dos clientes duplicados AIRDUTO e VIZU.
-- Replica logica da RPC merge_clients() executada como service-role.
-- Strategy hibrida B+A: target prevalece; campos NULL no target recebem do source.

DO $$
DECLARE
  v_source clients%ROWTYPE;
  v_target clients%ROWTYPE;
  v_refs jsonb := '{}'::jsonb;
  v_count integer;
  v_new_target jsonb;
  v_source_id uuid := '35207c33-d966-4fa0-8a31-8ccf4757032f';
  v_target_id uuid := '60ba285e-769c-47ec-9694-b8b7df3c1008';
BEGIN
  SELECT * INTO v_source FROM public.clients WHERE id = v_source_id FOR UPDATE;
  SELECT * INTO v_target FROM public.clients WHERE id = v_target_id FOR UPDATE;

  IF v_source.normalized_document IS DISTINCT FROM v_target.normalized_document THEN
    RAISE EXCEPTION 'AIRDUTO normalized_document mismatch';
  END IF;

  UPDATE public.tickets SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('tickets', v_count);
  UPDATE public.calendar_events SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('calendar_events', v_count);
  UPDATE public.financial_entries SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('financial_entries', v_count);
  UPDATE public.nfse_history SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('nfse_history', v_count);
  UPDATE public.contracts SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('contracts', v_count);
  UPDATE public.invoices SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('invoices', v_count);
  UPDATE public.client_contacts SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_contacts', v_count);
  UPDATE public.assets SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('assets', v_count);
  UPDATE public.client_history SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_history', v_count);
  UPDATE public.client_technicians SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_technicians', v_count);
  UPDATE public.client_external_mappings SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_external_mappings', v_count);
  UPDATE public.sla_configs SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('sla_configs', v_count);

  UPDATE public.clients SET
    trade_name = COALESCE(v_target.trade_name, v_source.trade_name),
    nickname = COALESCE(v_target.nickname, v_source.nickname),
    email = COALESCE(v_target.email, v_source.email),
    financial_email = COALESCE(v_target.financial_email, v_source.financial_email),
    phone = COALESCE(v_target.phone, v_source.phone),
    whatsapp = COALESCE(v_target.whatsapp, v_source.whatsapp),
    address = COALESCE(v_target.address, v_source.address),
    city = COALESCE(v_target.city, v_source.city),
    state = COALESCE(v_target.state, v_source.state),
    zip_code = COALESCE(v_target.zip_code, v_source.zip_code),
    state_registration = COALESCE(v_target.state_registration, v_source.state_registration),
    notes = COALESCE(v_target.notes, v_source.notes),
    asaas_customer_id = COALESCE(v_target.asaas_customer_id, v_source.asaas_customer_id),
    updated_at = now()
  WHERE id = v_target_id
  RETURNING to_jsonb(clients.*) INTO v_new_target;

  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
  VALUES ('clients', v_target_id, 'MERGE', NULL,
    jsonb_build_object('source', to_jsonb(v_source), 'target_before', to_jsonb(v_target)),
    jsonb_build_object('target_after', v_new_target, 'refs_migrated', v_refs, 'overrides', '{}'::jsonb,
                       'executed_by', 'migration_1.2c', 'reason', 'Legacy duplicate cleanup'));

  INSERT INTO public.client_history (client_id, user_id, action, comment, changes)
  VALUES (v_target_id, NULL, 'merged',
    format('Mesclado a partir do cliente %s (%s). Target escolhido por concentrar todos os vinculos operacionais (1 contrato ativo, 1 ticket, 2 contatos); source descartado por nao possuir vinculos.', v_source.name, v_source_id),
    jsonb_build_object('source_id', v_source_id, 'source_name', v_source.name, 'refs_migrated', v_refs));

  DELETE FROM public.clients WHERE id = v_source_id;
  RAISE NOTICE 'AIRDUTO merged: %', v_refs;
END $$;

DO $$
DECLARE
  v_source clients%ROWTYPE;
  v_target clients%ROWTYPE;
  v_refs jsonb := '{}'::jsonb;
  v_count integer;
  v_new_target jsonb;
  v_source_id uuid := '8028b947-e668-4e22-95e5-b8dc0a7f69c3';
  v_target_id uuid := 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85';
BEGIN
  SELECT * INTO v_source FROM public.clients WHERE id = v_source_id FOR UPDATE;
  SELECT * INTO v_target FROM public.clients WHERE id = v_target_id FOR UPDATE;

  IF v_source.normalized_document IS DISTINCT FROM v_target.normalized_document THEN
    RAISE EXCEPTION 'VIZU normalized_document mismatch';
  END IF;

  UPDATE public.tickets SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('tickets', v_count);
  UPDATE public.calendar_events SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('calendar_events', v_count);
  UPDATE public.financial_entries SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('financial_entries', v_count);
  UPDATE public.nfse_history SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('nfse_history', v_count);
  UPDATE public.contracts SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('contracts', v_count);
  UPDATE public.invoices SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('invoices', v_count);
  UPDATE public.client_contacts SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_contacts', v_count);
  UPDATE public.assets SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('assets', v_count);
  UPDATE public.client_history SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_history', v_count);
  UPDATE public.client_technicians SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_technicians', v_count);
  UPDATE public.client_external_mappings SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('client_external_mappings', v_count);
  UPDATE public.sla_configs SET client_id = v_target_id WHERE client_id = v_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_refs := v_refs || jsonb_build_object('sla_configs', v_count);

  UPDATE public.clients SET
    trade_name = COALESCE(v_target.trade_name, v_source.trade_name),
    nickname = COALESCE(v_target.nickname, v_source.nickname),
    email = COALESCE(v_target.email, v_source.email),
    financial_email = COALESCE(v_target.financial_email, v_source.financial_email),
    phone = COALESCE(v_target.phone, v_source.phone),
    whatsapp = COALESCE(v_target.whatsapp, v_source.whatsapp),
    address = COALESCE(v_target.address, v_source.address),
    city = COALESCE(v_target.city, v_source.city),
    state = COALESCE(v_target.state, v_source.state),
    zip_code = COALESCE(v_target.zip_code, v_source.zip_code),
    state_registration = COALESCE(v_target.state_registration, v_source.state_registration),
    notes = COALESCE(v_target.notes, v_source.notes),
    asaas_customer_id = COALESCE(v_target.asaas_customer_id, v_source.asaas_customer_id),
    updated_at = now()
  WHERE id = v_target_id
  RETURNING to_jsonb(clients.*) INTO v_new_target;

  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data, new_data)
  VALUES ('clients', v_target_id, 'MERGE', NULL,
    jsonb_build_object('source', to_jsonb(v_source), 'target_before', to_jsonb(v_target)),
    jsonb_build_object('target_after', v_new_target, 'refs_migrated', v_refs, 'overrides', '{}'::jsonb,
                       'executed_by', 'migration_1.2c', 'reason', 'Legacy duplicate cleanup'));

  INSERT INTO public.client_history (client_id, user_id, action, comment, changes)
  VALUES (v_target_id, NULL, 'merged',
    format('Mesclado a partir do cliente %s (%s). merge: target escolhido por possuir 2 contratos ativos, source descartado por ter apenas 1 contato.', v_source.name, v_source_id),
    jsonb_build_object('source_id', v_source_id, 'source_name', v_source.name, 'refs_migrated', v_refs));

  DELETE FROM public.clients WHERE id = v_source_id;
  RAISE NOTICE 'VIZU merged: %', v_refs;
END $$;

-- Tarefa 3: Ativar UNIQUE em normalized_document
DROP INDEX IF EXISTS public.idx_clients_normalized_document;
CREATE UNIQUE INDEX uq_clients_normalized_document
  ON public.clients (normalized_document)
  WHERE normalized_document <> '';