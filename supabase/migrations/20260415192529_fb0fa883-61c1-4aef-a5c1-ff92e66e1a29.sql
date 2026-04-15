
-- =============================================
-- 1. doc_credentials (created first, referenced by others)
-- =============================================
CREATE TABLE public.doc_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  access_type text,
  system_name text,
  username text,
  password_encrypted text,
  url text,
  port text,
  mfa_enabled boolean DEFAULT false,
  mfa_type text,
  mfa_backup_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_credentials ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_credentials_client_id ON public.doc_credentials(client_id);
CREATE POLICY "Staff full access on doc_credentials" ON public.doc_credentials FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_credentials_updated_at BEFORE UPDATE ON public.doc_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. doc_infrastructure
-- =============================================
CREATE TABLE public.doc_infrastructure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  server_type text,
  cloud_provider text,
  file_server text,
  active_directory text,
  ad_location text,
  unifi_console_model text,
  unifi_console_ip text,
  unifi_firmware text,
  unifi_uptime text,
  unifi_admin_credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  gateway_model text,
  gateway_ip_wan text,
  gateway_ip_lan text,
  gateway_firmware text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_infrastructure ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_infrastructure_client_id ON public.doc_infrastructure(client_id);
CREATE POLICY "Staff full access on doc_infrastructure" ON public.doc_infrastructure FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_infrastructure_updated_at BEFORE UPDATE ON public.doc_infrastructure FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3. doc_internet_links
-- =============================================
CREATE TABLE public.doc_internet_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text,
  provider text,
  link_type text,
  plan_speed text,
  public_ip text,
  support_phone text,
  contract_expiry date,
  alert_days int DEFAULT 30,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_internet_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_internet_links_client_id ON public.doc_internet_links(client_id);
CREATE POLICY "Staff full access on doc_internet_links" ON public.doc_internet_links FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_internet_links_updated_at BEFORE UPDATE ON public.doc_internet_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 4. doc_telephony
-- =============================================
CREATE TABLE public.doc_telephony (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text,
  provider text,
  system text,
  extensions_count int,
  support_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_telephony ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_telephony_client_id ON public.doc_telephony(client_id);
CREATE POLICY "Staff full access on doc_telephony" ON public.doc_telephony FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_telephony_updated_at BEFORE UPDATE ON public.doc_telephony FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 5. doc_devices
-- =============================================
CREATE TABLE public.doc_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  device_type text,
  name text,
  brand_model text,
  serial_number text,
  os text,
  cpu text,
  ram text,
  disks text,
  ip_local text,
  mac_address text,
  firmware text,
  status text,
  last_seen timestamptz,
  primary_user text,
  physical_location text,
  connection_type text,
  consumable text,
  integrated_software text,
  reading_type text,
  usage text,
  ssids text,
  connected_clients int,
  port_count int,
  vlans text,
  trmm_agent_id text,
  unifi_device_id text,
  data_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_devices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_devices_client_id ON public.doc_devices(client_id);
CREATE POLICY "Staff full access on doc_devices" ON public.doc_devices FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_devices_updated_at BEFORE UPDATE ON public.doc_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 6. doc_cftv
-- =============================================
CREATE TABLE public.doc_cftv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  device_type text,
  name text,
  brand_model text,
  ip text,
  physical_location text,
  resolution text,
  camera_type text,
  power_type text,
  nvr_id uuid REFERENCES public.doc_cftv(id) ON DELETE SET NULL,
  nvr_channel int,
  channels int,
  storage_size text,
  retention_days int,
  remote_access text,
  credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_cftv ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_cftv_client_id ON public.doc_cftv(client_id);
CREATE POLICY "Staff full access on doc_cftv" ON public.doc_cftv FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_cftv_updated_at BEFORE UPDATE ON public.doc_cftv FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 7. doc_licenses
-- =============================================
CREATE TABLE public.doc_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  license_type text,
  product_name text,
  license_model text,
  quantity_total int,
  quantity_in_use int,
  key text,
  linked_email text,
  linked_device text,
  devices_covered int,
  months_contracted int,
  start_date date,
  expiry_date date,
  alert_days int DEFAULT 30,
  cloud_console_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_licenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_licenses_client_id ON public.doc_licenses(client_id);
CREATE POLICY "Staff full access on doc_licenses" ON public.doc_licenses FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_licenses_updated_at BEFORE UPDATE ON public.doc_licenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 8. doc_software_erp
-- =============================================
CREATE TABLE public.doc_software_erp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text,
  category text,
  version text,
  vendor text,
  vendor_phone text,
  vendor_email text,
  support_hours text,
  support_contract text,
  support_expiry date,
  access_url text,
  credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  trmm_software_match text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_software_erp ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_software_erp_client_id ON public.doc_software_erp(client_id);
CREATE POLICY "Staff full access on doc_software_erp" ON public.doc_software_erp FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_software_erp_updated_at BEFORE UPDATE ON public.doc_software_erp FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 9. doc_domains
-- =============================================
CREATE TABLE public.doc_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  domain text,
  registrar text,
  dns_provider text,
  registrar_panel_url text,
  registrar_credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  dns_panel_url text,
  dns_credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  expiry_date date,
  alert_days int DEFAULT 60,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_domains ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_domains_client_id ON public.doc_domains(client_id);
CREATE POLICY "Staff full access on doc_domains" ON public.doc_domains FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_domains_updated_at BEFORE UPDATE ON public.doc_domains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 10. doc_contacts
-- =============================================
CREATE TABLE public.doc_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text,
  role text,
  phone text,
  whatsapp text,
  email text,
  availability text,
  is_emergency boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_contacts_client_id ON public.doc_contacts(client_id);
CREATE POLICY "Staff full access on doc_contacts" ON public.doc_contacts FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_contacts_updated_at BEFORE UPDATE ON public.doc_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 11. doc_support_hours
-- =============================================
CREATE TABLE public.doc_support_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  business_hours text,
  has_oncall boolean DEFAULT false,
  oncall_phone text,
  sla_critical text,
  sla_normal text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_support_hours ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_support_hours_client_id ON public.doc_support_hours(client_id);
CREATE UNIQUE INDEX idx_doc_support_hours_unique_client ON public.doc_support_hours(client_id);
CREATE POLICY "Staff full access on doc_support_hours" ON public.doc_support_hours FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_support_hours_updated_at BEFORE UPDATE ON public.doc_support_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 12. doc_vlans
-- =============================================
CREATE TABLE public.doc_vlans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  vlan_id int,
  name text,
  purpose text,
  ip_range text,
  gateway text,
  dhcp_enabled boolean,
  isolated boolean DEFAULT false,
  unifi_network_id text,
  data_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_vlans ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_vlans_client_id ON public.doc_vlans(client_id);
CREATE POLICY "Staff full access on doc_vlans" ON public.doc_vlans FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_vlans_updated_at BEFORE UPDATE ON public.doc_vlans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 13. doc_firewall_rules
-- =============================================
CREATE TABLE public.doc_firewall_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rule_type text,
  name text,
  source text,
  destination text,
  port text,
  protocol text,
  action text,
  context text,
  unifi_rule_id text,
  data_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_firewall_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_firewall_rules_client_id ON public.doc_firewall_rules(client_id);
CREATE POLICY "Staff full access on doc_firewall_rules" ON public.doc_firewall_rules FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_firewall_rules_updated_at BEFORE UPDATE ON public.doc_firewall_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 14. doc_access_policies
-- =============================================
CREATE TABLE public.doc_access_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  policy_type text,
  target text,
  affected_group text,
  reason text,
  exceptions text,
  configured_via text,
  unifi_rule_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_access_policies ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_access_policies_client_id ON public.doc_access_policies(client_id);
CREATE POLICY "Staff full access on doc_access_policies" ON public.doc_access_policies FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_access_policies_updated_at BEFORE UPDATE ON public.doc_access_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 15. doc_vpn
-- =============================================
CREATE TABLE public.doc_vpn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text,
  vpn_type text,
  server text,
  port text,
  protocol text,
  users_configured text,
  unifi_vpn_id text,
  data_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_vpn ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_vpn_client_id ON public.doc_vpn(client_id);
CREATE POLICY "Staff full access on doc_vpn" ON public.doc_vpn FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_vpn_updated_at BEFORE UPDATE ON public.doc_vpn FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 16. doc_backup_solutions
-- =============================================
CREATE TABLE public.doc_backup_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  backup_type text,
  solution text,
  destination text,
  frequency text,
  retention text,
  last_verified date,
  credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_backup_solutions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_backup_solutions_client_id ON public.doc_backup_solutions(client_id);
CREATE POLICY "Staff full access on doc_backup_solutions" ON public.doc_backup_solutions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_backup_solutions_updated_at BEFORE UPDATE ON public.doc_backup_solutions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 17. doc_antivirus_solutions
-- =============================================
CREATE TABLE public.doc_antivirus_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  solution text,
  scope text,
  console_url text,
  version text,
  credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_antivirus_solutions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_antivirus_solutions_client_id ON public.doc_antivirus_solutions(client_id);
CREATE POLICY "Staff full access on doc_antivirus_solutions" ON public.doc_antivirus_solutions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_antivirus_solutions_updated_at BEFORE UPDATE ON public.doc_antivirus_solutions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 18. doc_external_providers
-- =============================================
CREATE TABLE public.doc_external_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_name text,
  service_type text,
  contact_name text,
  contact_phone text,
  contact_email text,
  support_hours text,
  contract_type text,
  contract_expiry date,
  panel_url text,
  credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_external_providers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_external_providers_client_id ON public.doc_external_providers(client_id);
CREATE POLICY "Staff full access on doc_external_providers" ON public.doc_external_providers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_external_providers_updated_at BEFORE UPDATE ON public.doc_external_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 19. doc_routines
-- =============================================
CREATE TABLE public.doc_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text,
  frequency text,
  responsible text,
  procedure text,
  last_executed date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_routines ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_routines_client_id ON public.doc_routines(client_id);
CREATE POLICY "Staff full access on doc_routines" ON public.doc_routines FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER update_doc_routines_updated_at BEFORE UPDATE ON public.doc_routines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
