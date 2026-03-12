
-- =============================================
-- Phase 1: UniFi Integration - Database Schema
-- =============================================

-- 1. unifi_controllers
CREATE TABLE public.unifi_controllers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  connection_method TEXT NOT NULL DEFAULT 'direct' CHECK (connection_method IN ('direct', 'cloud')),
  -- Direct method fields
  url TEXT,
  username TEXT,
  password_encrypted TEXT,
  ddns_hostname TEXT,
  -- Cloud method fields
  cloud_api_key_encrypted TEXT,
  cloud_host_id TEXT,
  -- Common fields
  is_active BOOLEAN NOT NULL DEFAULT true,
  sync_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK (sync_interval_hours IN (3, 6, 12)),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. network_sites
CREATE TABLE public.network_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  controller_id UUID NOT NULL REFERENCES public.unifi_controllers(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  site_code TEXT NOT NULL,
  site_name TEXT NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  client_count INTEGER NOT NULL DEFAULT 0,
  health_status JSONB,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(controller_id, site_code)
);

-- 3. network_topology
CREATE TABLE public.network_topology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.network_sites(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  device_mac TEXT NOT NULL,
  device_name TEXT,
  device_port TEXT,
  neighbor_mac TEXT NOT NULL,
  neighbor_name TEXT,
  neighbor_port TEXT,
  connection_type TEXT NOT NULL DEFAULT 'ethernet' CHECK (connection_type IN ('ethernet', 'wireless')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. unifi_sync_logs
CREATE TABLE public.unifi_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  controller_id UUID NOT NULL REFERENCES public.unifi_controllers(id) ON DELETE CASCADE,
  sync_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  devices_synced INTEGER NOT NULL DEFAULT 0,
  alarms_collected INTEGER NOT NULL DEFAULT 0,
  alarms_new INTEGER NOT NULL DEFAULT 0,
  alerts_posted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'partial')),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Expand monitored_devices with network fields
ALTER TABLE public.monitored_devices
  ADD COLUMN IF NOT EXISTS mac_address TEXT,
  ADD COLUMN IF NOT EXISTS firmware_version TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.network_sites(id) ON DELETE SET NULL;

-- =============================================
-- Indices
-- =============================================
CREATE INDEX idx_unifi_controllers_client_id ON public.unifi_controllers(client_id);
CREATE INDEX idx_unifi_controllers_active ON public.unifi_controllers(is_active) WHERE is_active = true;
CREATE INDEX idx_network_sites_controller ON public.network_sites(controller_id);
CREATE INDEX idx_network_sites_client ON public.network_sites(client_id);
CREATE INDEX idx_network_topology_site ON public.network_topology(site_id);
CREATE INDEX idx_network_topology_client ON public.network_topology(client_id);
CREATE INDEX idx_unifi_sync_logs_controller ON public.unifi_sync_logs(controller_id);
CREATE INDEX idx_unifi_sync_logs_timestamp ON public.unifi_sync_logs(sync_timestamp DESC);
CREATE INDEX idx_monitored_devices_mac ON public.monitored_devices(mac_address) WHERE mac_address IS NOT NULL;
CREATE INDEX idx_monitored_devices_site ON public.monitored_devices(site_id) WHERE site_id IS NOT NULL;

-- =============================================
-- Updated_at triggers
-- =============================================
CREATE TRIGGER set_updated_at_unifi_controllers
  BEFORE UPDATE ON public.unifi_controllers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_network_sites
  BEFORE UPDATE ON public.network_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_network_topology
  BEFORE UPDATE ON public.network_topology
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS Policies (is_staff only)
-- =============================================
ALTER TABLE public.unifi_controllers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_topology ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unifi_sync_logs ENABLE ROW LEVEL SECURITY;

-- unifi_controllers
CREATE POLICY "Staff can view unifi_controllers"
  ON public.unifi_controllers FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert unifi_controllers"
  ON public.unifi_controllers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update unifi_controllers"
  ON public.unifi_controllers FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete unifi_controllers"
  ON public.unifi_controllers FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- network_sites
CREATE POLICY "Staff can view network_sites"
  ON public.network_sites FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert network_sites"
  ON public.network_sites FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update network_sites"
  ON public.network_sites FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete network_sites"
  ON public.network_sites FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- network_topology
CREATE POLICY "Staff can view network_topology"
  ON public.network_topology FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert network_topology"
  ON public.network_topology FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update network_topology"
  ON public.network_topology FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete network_topology"
  ON public.network_topology FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- unifi_sync_logs
CREATE POLICY "Staff can view unifi_sync_logs"
  ON public.unifi_sync_logs FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert unifi_sync_logs"
  ON public.unifi_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Service role bypass for edge functions (sync inserts)
CREATE POLICY "Service role full access unifi_controllers"
  ON public.unifi_controllers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access network_sites"
  ON public.network_sites FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access network_topology"
  ON public.network_topology FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access unifi_sync_logs"
  ON public.unifi_sync_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
