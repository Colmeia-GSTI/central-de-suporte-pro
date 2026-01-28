-- Criar tabela de catálogo de serviços
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_value NUMERIC NOT NULL DEFAULT 0,
  multiplier NUMERIC NOT NULL DEFAULT 1,
  -- Códigos fiscais
  nfse_service_code TEXT,
  nfse_cnae TEXT,
  -- Impostos para NFS-e (em percentual)
  tax_iss NUMERIC DEFAULT 0,
  tax_pis NUMERIC DEFAULT 0,
  tax_cofins NUMERIC DEFAULT 0,
  tax_csll NUMERIC DEFAULT 0,
  tax_irrf NUMERIC DEFAULT 0,
  tax_inss NUMERIC DEFAULT 0,
  -- Controle
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar colunas à tabela contract_services existente
ALTER TABLE public.contract_services 
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_value NUMERIC,
  ADD COLUMN IF NOT EXISTS multiplier_override NUMERIC;

-- Adicionar campo de observações internas na tabela contracts
ALTER TABLE public.contracts 
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_contract_services_service_id ON public.contract_services(service_id);

-- Trigger para updated_at na tabela services
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para services
CREATE POLICY "Admins podem gerenciar serviços"
  ON public.services FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Financial podem gerenciar serviços"
  ON public.services FOR ALL
  USING (public.has_role(auth.uid(), 'financial'));

CREATE POLICY "Staff pode visualizar serviços ativos"
  ON public.services FOR SELECT
  USING (public.is_staff(auth.uid()) AND is_active = true);