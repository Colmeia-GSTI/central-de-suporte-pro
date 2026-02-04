-- NFS-e Nacional 2026: Campos de retenção ISS
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS iss_retido BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS valor_iss_retido NUMERIC(15,2) DEFAULT 0;

-- NFS-e Nacional 2026: Tributos federais retidos
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS valor_pis NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_cofins NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_csll NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_irrf NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) DEFAULT 0;

-- NFS-e Nacional 2026: Valores calculados (obrigatórios)
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS valor_deducoes NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(15,2) DEFAULT 0;

-- Reforma Tributária 2026: IBS/CBS (fase calibragem)
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS valor_ibs NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_cbs NUMERIC(15,2) DEFAULT 0;

-- Cadastrar código de serviço 1.07 (Suporte técnico em informática)
INSERT INTO nfse_service_codes (
  codigo_tributacao, descricao, item_lista, subitem_lista, 
  cnae_principal, aliquota_sugerida, categoria
)
VALUES (
  '010701',
  'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados.',
  '1', '07', '6209100', 2.00, 'informatica'
) ON CONFLICT (codigo_tributacao) DO NOTHING;