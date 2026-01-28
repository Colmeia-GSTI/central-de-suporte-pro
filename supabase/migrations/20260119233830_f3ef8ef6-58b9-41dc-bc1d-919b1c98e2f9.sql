-- Criar tabela de configurações da empresa (Emitente NFSE)
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados Cadastrais
  razao_social text NOT NULL DEFAULT 'TAUFFER SPERANDIO INFORMATICA LTDA',
  nome_fantasia text,
  cnpj text NOT NULL DEFAULT '',
  inscricao_municipal text,
  inscricao_estadual text,
  
  -- Endereço
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text DEFAULT 'SC',
  endereco_cep text,
  endereco_codigo_ibge text,
  
  -- Contato
  telefone text,
  email text,
  
  -- Configurações NFSE Nacional
  nfse_ambiente text DEFAULT 'producao_restrita',
  nfse_regime_tributario text DEFAULT 'simples_nacional',
  nfse_optante_simples boolean DEFAULT true,
  nfse_incentivador_cultural boolean DEFAULT false,
  nfse_aliquota_padrao numeric(5,2) DEFAULT 6.00,
  nfse_codigo_tributacao_padrao text DEFAULT '010701',
  nfse_cnae_padrao text,
  nfse_descricao_servico_padrao text,
  
  -- Certificado Digital
  certificado_tipo text DEFAULT 'A1',
  certificado_validade date,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company settings"
  ON public.company_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view company settings"
  ON public.company_settings FOR SELECT
  USING (is_staff(auth.uid()));

-- Inserir registro inicial (Tauffer Sperandio)
INSERT INTO public.company_settings (razao_social, cnpj) 
VALUES ('TAUFFER SPERANDIO INFORMATICA LTDA', '');

-- Criar tabela de códigos de serviço NFSE (LC 116/2003)
CREATE TABLE public.nfse_service_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_tributacao text NOT NULL UNIQUE,
  descricao text NOT NULL,
  item_lista text,
  subitem_lista text,
  cnae_principal text,
  aliquota_sugerida numeric(5,2),
  categoria text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Índices para busca rápida
CREATE INDEX idx_nfse_service_codes_codigo ON public.nfse_service_codes(codigo_tributacao);
CREATE INDEX idx_nfse_service_codes_descricao ON public.nfse_service_codes USING gin(to_tsvector('portuguese', descricao));
CREATE INDEX idx_nfse_service_codes_categoria ON public.nfse_service_codes(categoria);

-- RLS
ALTER TABLE public.nfse_service_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view service codes"
  ON public.nfse_service_codes FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage service codes"
  ON public.nfse_service_codes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Inserir códigos mais comuns para TI
INSERT INTO public.nfse_service_codes (codigo_tributacao, descricao, item_lista, subitem_lista, cnae_principal, aliquota_sugerida, categoria) VALUES
('010501', 'Licenciamento ou cessão de direito de uso de programas de computação', '1', '05.01', '6201500', 5.00, 'informatica'),
('010502', 'Planejamento, confecção, manutenção e atualização de páginas eletrônicas', '1', '05.02', '6201501', 5.00, 'informatica'),
('010503', 'Hospedagem de sites', '1', '05.03', '6311900', 5.00, 'informatica'),
('010504', 'Disponibilização de conteúdos de áudio, vídeo, imagem e texto por meio de internet', '1', '05.04', '6311900', 5.00, 'informatica'),
('010505', 'Fornecimento de informações on-line', '1', '05.05', '6311900', 5.00, 'informatica'),
('010601', 'Assessoria e consultoria em informática', '1', '06.01', '6204000', 5.00, 'informatica'),
('010602', 'Elaboração de programas de computadores', '1', '06.02', '6201501', 5.00, 'informatica'),
('010603', 'Licenciamento ou cessão de direito de uso de banco de dados', '1', '06.03', '6311900', 5.00, 'informatica'),
('010604', 'Análise e desenvolvimento de sistemas', '1', '06.04', '6201501', 5.00, 'informatica'),
('010701', 'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados', '1', '07.01', '6209100', 6.00, 'informatica'),
('010702', 'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados (por hora)', '1', '07.02', '6209100', 6.00, 'informatica'),
('140501', 'Restauração, recondicionamento, acondicionamento, pintura, beneficiamento, lavagem, secagem, tingimento, galvanoplastia, anodização, corte, recorte, plastificação, costura, acabamento, polimento e congêneres de objetos quaisquer', '14', '05.01', '9529199', 5.00, 'manutencao'),
('140601', 'Instalação e montagem de aparelhos, máquinas e equipamentos', '14', '06.01', '3321000', 5.00, 'manutencao'),
('140901', 'Manutenção e conservação de máquinas, aparelhos, equipamentos (exceto aviação)', '14', '09.01', '3311200', 5.00, 'manutencao'),
('170101', 'Assessoria ou consultoria de qualquer natureza', '17', '01.01', '7020400', 5.00, 'consultoria'),
('170201', 'Análise, inclusive de sistemas, exames, pesquisas e informações', '17', '02.01', '7490199', 5.00, 'consultoria'),
('080201', 'Instrução, treinamento, orientação pedagógica e educacional', '8', '02.01', '8599603', 5.00, 'treinamento');

-- Adicionar campos NFSE na tabela contracts
ALTER TABLE public.contracts
ADD COLUMN nfse_enabled boolean DEFAULT true,
ADD COLUMN nfse_service_code_id uuid REFERENCES public.nfse_service_codes(id),
ADD COLUMN nfse_service_code text DEFAULT '010701',
ADD COLUMN nfse_descricao_customizada text,
ADD COLUMN nfse_cnae text;

COMMENT ON COLUMN public.contracts.nfse_enabled IS 'Se o contrato deve gerar NFS-e';
COMMENT ON COLUMN public.contracts.nfse_service_code_id IS 'Referência ao código de serviço';
COMMENT ON COLUMN public.contracts.nfse_service_code IS 'Código tributação nacional';
COMMENT ON COLUMN public.contracts.nfse_descricao_customizada IS 'Descrição customizada para NFS-e';