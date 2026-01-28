-- Adicionar campos que faltam conforme padrão NFS-e Nacional
ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS trib_municipio_recolhimento TEXT DEFAULT 'proprio',
  ADD COLUMN IF NOT EXISTS ind_inc_fisc BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS c_nat_rend TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.services.tax_iss IS 'Alíquota ISS (tribMun/tribISSQN) em %';
COMMENT ON COLUMN public.services.tax_pis IS 'Alíquota PIS (tribFed/pPIS) em %';
COMMENT ON COLUMN public.services.tax_cofins IS 'Alíquota COFINS (tribFed/pCOFINS) em %';
COMMENT ON COLUMN public.services.tax_csll IS 'Alíquota CSLL (tribFed/pCSLL) em %';
COMMENT ON COLUMN public.services.tax_irrf IS 'Alíquota IR (tribFed/pIR) em %';
COMMENT ON COLUMN public.services.tax_inss IS 'Alíquota INSS (tribFed/pINSS) em %';
COMMENT ON COLUMN public.services.trib_municipio_recolhimento IS 'Tipo recolhimento ISS: proprio, retido, isento, imune';
COMMENT ON COLUMN public.services.ind_inc_fisc IS 'Incentivador fiscal cultural (indIncFisc)';
COMMENT ON COLUMN public.services.c_nat_rend IS 'Código natureza rendimento para retenções (cNatRend)';