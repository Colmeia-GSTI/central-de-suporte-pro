-- monitored_devices
ALTER TABLE public.monitored_devices
  ADD COLUMN branch_id uuid
    REFERENCES public.client_branches(id) ON DELETE SET NULL;

CREATE INDEX idx_monitored_devices_branch_id
  ON public.monitored_devices(branch_id)
  WHERE branch_id IS NOT NULL;

COMMENT ON COLUMN public.monitored_devices.branch_id IS
  'Filial física onde o device opera. NULLABLE: registros vindos de sync (TRMM/UniFi/CheckMK) ficam NULL até técnico mapear manualmente ou Seção 4.5.3 implementar mapeamento automático por hostname/site_id. NÃO confundir com site_id (FK network_sites = site UniFi, dimensão de rede).';

-- assets
ALTER TABLE public.assets
  ADD COLUMN branch_id uuid
    REFERENCES public.client_branches(id) ON DELETE SET NULL;

CREATE INDEX idx_assets_branch_id
  ON public.assets(branch_id)
  WHERE branch_id IS NOT NULL;

COMMENT ON COLUMN public.assets.branch_id IS
  'Filial física onde o asset reside. NULLABLE. Complementar ao campo location (text livre). Use branch_id para filtros estruturados, location para detalhe (sala, rack, etc).';

-- doc_devices
ALTER TABLE public.doc_devices
  ADD COLUMN branch_id uuid
    REFERENCES public.client_branches(id) ON DELETE SET NULL;

CREATE INDEX idx_doc_devices_branch_id
  ON public.doc_devices(branch_id)
  WHERE branch_id IS NOT NULL;

COMMENT ON COLUMN public.doc_devices.branch_id IS
  'Filial física do device documentado. NULLABLE. Complementar ao physical_location (text livre).';