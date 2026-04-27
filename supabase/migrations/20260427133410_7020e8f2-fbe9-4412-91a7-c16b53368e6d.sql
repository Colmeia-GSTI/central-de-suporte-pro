-- PR #4 Seção 4.5.1: branch_id em CMDB de rede
-- Tabelas vazias hoje, sem necessidade de backfill.

ALTER TABLE public.doc_vlans
  ADD COLUMN branch_id uuid REFERENCES public.client_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_vlans_branch_id ON public.doc_vlans(branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN public.doc_vlans.branch_id IS 'Filial física onde este recurso de rede opera. NULLABLE.';

ALTER TABLE public.doc_vpn
  ADD COLUMN branch_id uuid REFERENCES public.client_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_vpn_branch_id ON public.doc_vpn(branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN public.doc_vpn.branch_id IS 'Filial física onde este recurso de rede opera. NULLABLE.';

ALTER TABLE public.doc_firewall_rules
  ADD COLUMN branch_id uuid REFERENCES public.client_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_firewall_rules_branch_id ON public.doc_firewall_rules(branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN public.doc_firewall_rules.branch_id IS 'Filial física onde este recurso de rede opera. NULLABLE.';

ALTER TABLE public.doc_access_policies
  ADD COLUMN branch_id uuid REFERENCES public.client_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_access_policies_branch_id ON public.doc_access_policies(branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN public.doc_access_policies.branch_id IS 'Filial física onde este recurso de rede opera. NULLABLE.';

ALTER TABLE public.doc_internet_links
  ADD COLUMN branch_id uuid REFERENCES public.client_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_internet_links_branch_id ON public.doc_internet_links(branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN public.doc_internet_links.branch_id IS 'Filial física onde este recurso de rede opera. NULLABLE.';

ALTER TABLE public.doc_infrastructure
  ADD COLUMN branch_id uuid REFERENCES public.client_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_infrastructure_branch_id ON public.doc_infrastructure(branch_id) WHERE branch_id IS NOT NULL;
COMMENT ON COLUMN public.doc_infrastructure.branch_id IS 'Filial física onde este recurso de rede opera. NULLABLE.';