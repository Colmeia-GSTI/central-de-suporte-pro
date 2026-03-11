-- P4: Add ip_address to assets for inventory↔monitoring link
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS ip_address text;

-- P7: Add contract_id to sla_configs for per-contract SLA
ALTER TABLE public.sla_configs ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_assets_ip_address ON public.assets(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sla_configs_contract_id ON public.sla_configs(contract_id) WHERE contract_id IS NOT NULL;