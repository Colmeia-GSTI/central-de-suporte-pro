-- Criar tabela para gerenciar múltiplos certificados digitais
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.company_settings(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'A1',
  arquivo_url TEXT,
  senha_hash TEXT,
  validade DATE,
  titular TEXT,
  emissor TEXT,
  numero_serie TEXT,
  is_primary BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para busca rápida
CREATE INDEX idx_certificates_company ON public.certificates(company_id);
CREATE INDEX idx_certificates_validade ON public.certificates(validade);
CREATE INDEX idx_certificates_primary ON public.certificates(is_primary) WHERE is_primary = true;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Staff pode visualizar certificados" 
  ON public.certificates FOR SELECT 
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins podem gerenciar certificados" 
  ON public.certificates FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Financial podem gerenciar certificados" 
  ON public.certificates FOR ALL 
  USING (has_role(auth.uid(), 'financial'::app_role));

-- Função para garantir apenas um certificado principal por empresa
CREATE OR REPLACE FUNCTION public.ensure_single_primary_certificate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.certificates 
    SET is_primary = false 
    WHERE company_id = NEW.company_id 
      AND id != NEW.id 
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER ensure_single_primary_certificate_trigger
  BEFORE INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION public.ensure_single_primary_certificate();

-- Habilitar realtime para a tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.certificates;