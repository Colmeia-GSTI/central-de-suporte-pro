-- =============================================================================
-- Relay UniFi OS — usuário de serviço + RPCs escopadas
-- Padrão idêntico ao Hermes Bot (auth user dedicado + SECURITY DEFINER + is_staff)
--
-- Objetivo: permitir que o worker relay (LXC na tailnet) leia controllers e
-- grave devices/sites/alarmes/logs SEM usar service_role. O relay autentica
-- como usuário 'relay-unifi@colmeiagsti.com.br' (role technician) e só consegue
-- executar exatamente o que estas RPCs permitem.
--
-- PRÉ-REQUISITO MANUAL (igual ao Hermes):
--   1. Criar o usuário 'relay-unifi@colmeiagsti.com.br' no painel
--      Authentication > Users (Auto Confirm = true).
--   2. Guardar a senha no Vault como 'UNIFI_RELAY_PASSWORD'.
--   3. RE-EXECUTAR esta migração para garantir profile + role technician.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PARTE A: garantir profile + role 'technician' para o usuário de serviço
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_relay_id uuid;
BEGIN
  SELECT id INTO v_relay_id
  FROM auth.users
  WHERE email = 'relay-unifi@colmeiagsti.com.br'
  LIMIT 1;

  IF v_relay_id IS NULL THEN
    RAISE NOTICE '[Relay UniFi] Auth user nao encontrado. Crie relay-unifi@colmeiagsti.com.br no painel Authentication > Users (Auto Confirm = true) e RE-EXECUTE esta migracao.';
  ELSE
    -- Profile (handle_new_user pode ja ter criado; garante presenca)
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (v_relay_id, 'Relay UniFi', 'relay-unifi@colmeiagsti.com.br')
    ON CONFLICT (id) DO NOTHING;

    -- Remove role 'client' inserida automaticamente pelo trigger handle_new_user
    DELETE FROM public.user_roles
    WHERE user_id = v_relay_id AND role = 'client';

    -- Garante role 'technician' (aceita por is_staff)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_relay_id, 'technician')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE '[Relay UniFi] Auth user encontrado (id=%). Profile garantido e role technician aplicada.', v_relay_id;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PARTE B: RPCs SECURITY DEFINER escopadas
-- -----------------------------------------------------------------------------

-- 1) Lista controllers 'direct' ativos para o relay processar.
--    Retorna apenas os campos necessarios; nao expoe dados de outros metodos.
CREATE OR REPLACE FUNCTION public.unifi_relay_list_controllers()
RETURNS TABLE (
  id uuid,
  client_id uuid,
  name text,
  url text,
  username text,
  password_encrypted text,
  sync_interval_hours integer,
  last_sync_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  RETURN QUERY
  SELECT c.id, c.client_id, c.name, c.url, c.username,
         c.password_encrypted, c.sync_interval_hours, c.last_sync_at
  FROM public.unifi_controllers c
  WHERE c.is_active = true
    AND c.connection_method = 'direct';
END;
$$;

COMMENT ON FUNCTION public.unifi_relay_list_controllers()
  IS 'Relay UniFi: lista controllers direct ativos (LXC tailnet).';

-- 2) Upsert de site + device. Substitui a logica inline do unifi-sync para
--    o relay, mantendo as mesmas tabelas. Retorna o id do device.
CREATE OR REPLACE FUNCTION public.unifi_relay_upsert_device(
  p_controller_id uuid,
  p_client_id uuid,
  p_site_code text,
  p_site_name text,
  p_site_device_count integer,
  p_site_client_count integer,
  p_mac text,
  p_name text,
  p_hostname text,
  p_ip text,
  p_model text,
  p_firmware text,
  p_is_online boolean,
  p_device_type text,
  p_last_seen timestamptz,
  p_service_data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_id uuid;
  v_device_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  IF p_mac IS NULL OR length(trim(p_mac)) = 0 THEN
    RAISE EXCEPTION 'MAC obrigatorio' USING ERRCODE='P0001';
  END IF;

  -- Upsert do site
  INSERT INTO public.network_sites (
    controller_id, client_id, site_code, site_name,
    device_count, client_count, last_sync_at
  )
  VALUES (
    p_controller_id, p_client_id, p_site_code, p_site_name,
    COALESCE(p_site_device_count, 0), COALESCE(p_site_client_count, 0), now()
  )
  ON CONFLICT (controller_id, site_code) DO UPDATE
    SET site_name = EXCLUDED.site_name,
        device_count = EXCLUDED.device_count,
        client_count = EXCLUDED.client_count,
        last_sync_at = now()
  RETURNING id INTO v_site_id;

  -- Upsert do device (chave: external_id + external_source)
  SELECT id INTO v_device_id
  FROM public.monitored_devices
  WHERE external_id = p_mac AND external_source = 'unifi'
  LIMIT 1;

  IF v_device_id IS NULL THEN
    INSERT INTO public.monitored_devices (
      client_id, name, hostname, ip_address, mac_address, model,
      firmware_version, is_online, device_type, external_id, external_source,
      site_id, last_seen_at, service_data
    )
    VALUES (
      p_client_id, p_name, p_hostname, p_ip, p_mac, p_model,
      p_firmware, p_is_online, p_device_type, p_mac, 'unifi',
      v_site_id, COALESCE(p_last_seen, now()), COALESCE(p_service_data, '{}'::jsonb)
    )
    RETURNING id INTO v_device_id;
  ELSE
    UPDATE public.monitored_devices
    SET name = p_name,
        hostname = p_hostname,
        ip_address = p_ip,
        mac_address = p_mac,
        model = p_model,
        firmware_version = p_firmware,
        is_online = p_is_online,
        device_type = p_device_type,
        site_id = v_site_id,
        last_seen_at = COALESCE(p_last_seen, now()),
        service_data = COALESCE(p_service_data, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_device_id;
  END IF;

  RETURN v_device_id;
END;
$$;

COMMENT ON FUNCTION public.unifi_relay_upsert_device(uuid, uuid, text, text, integer, integer, text, text, text, text, text, text, boolean, text, timestamptz, jsonb)
  IS 'Relay UniFi: upsert de site + device monitorado.';

-- 3) Cria alarme/alerta apenas se nao houver alerta ativo identico.
--    Retorna true se um novo alerta foi criado.
CREATE OR REPLACE FUNCTION public.unifi_relay_post_alert(
  p_device_id uuid,
  p_title text,
  p_message text,
  p_level text,
  p_service_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  IF p_device_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_exists
  FROM public.monitoring_alerts
  WHERE device_id = p_device_id
    AND status = 'active'
    AND service_name = p_service_name
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.monitoring_alerts (device_id, title, message, level, status, service_name)
  VALUES (p_device_id, left(p_title, 200), p_message, p_level::alert_level, 'active', p_service_name);

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.unifi_relay_post_alert(uuid, text, text, text, text)
  IS 'Relay UniFi: cria alerta de monitoramento se nao houver ativo identico.';

-- 4) Registra o resultado do sync e atualiza o controller.
CREATE OR REPLACE FUNCTION public.unifi_relay_log_sync(
  p_controller_id uuid,
  p_devices_synced integer,
  p_alarms_collected integer,
  p_alarms_new integer,
  p_alerts_posted integer,
  p_status text,
  p_error_message text,
  p_duration_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas equipe pode executar' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.unifi_sync_logs (
    controller_id, devices_synced, alarms_collected, alarms_new,
    alerts_posted, status, error_message, duration_ms
  )
  VALUES (
    p_controller_id, COALESCE(p_devices_synced, 0), COALESCE(p_alarms_collected, 0),
    COALESCE(p_alarms_new, 0), COALESCE(p_alerts_posted, 0),
    p_status, p_error_message, p_duration_ms
  );

  UPDATE public.unifi_controllers
  SET last_sync_at = now(),
      last_error = CASE WHEN p_status = 'error' THEN p_error_message ELSE NULL END,
      updated_at = now()
  WHERE id = p_controller_id;
END;
$$;

COMMENT ON FUNCTION public.unifi_relay_log_sync(uuid, integer, integer, integer, integer, text, text, integer)
  IS 'Relay UniFi: registra log de sync e atualiza controller.';
