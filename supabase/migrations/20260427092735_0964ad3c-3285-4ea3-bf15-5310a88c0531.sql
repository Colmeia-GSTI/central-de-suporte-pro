CREATE OR REPLACE FUNCTION public.merge_clients(source_id uuid, target_id uuid, field_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Migrar filiais (client_branches) do source para o target.
  -- Resolver conflito de Sede única (uniq_client_branches_main_per_client):
  -- se ambos os clientes têm Sede, rebaixa a Sede do source para filial comum.
  UPDATE public.client_branches AS src
     SET is_main = false,
         notes = COALESCE(src.notes || E'\n', '') || 'Sede secundária migrada de cliente mesclado'
   WHERE src.client_id = source_id
     AND src.is_main = true
     AND EXISTS (
       SELECT 1 FROM public.client_branches AS tgt
        WHERE tgt.client_id = target_id AND tgt.is_main = true
     );

  -- Resolver conflito de nome (uniq_client_branches_name_per_client):
  -- se houver filial homônima no target, anexa " (migrada)" no nome do source.
  UPDATE public.client_branches AS src
     SET name = src.name || ' (migrada)'
   WHERE src.client_id = source_id
     AND EXISTS (
       SELECT 1 FROM public.client_branches AS tgt
        WHERE tgt.client_id = target_id
          AND lower(tgt.name) = lower(src.name)
     );

  -- Reapontar filiais do source para o target.
  UPDATE public.client_branches SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_refs := v_refs || jsonb_build_object('client_branches', v_count);

  -- Deletar source
  DELETE FROM public.clients WHERE id = source_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_id', target_id,
    'references_migrated', v_refs,
    'fields_updated', v_fields_updated
  );
END;
$function$;