-- Criar tabela de histórico de NFS-e emitidas
CREATE TABLE public.nfse_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamentos
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  
  -- Dados da NFS-e
  numero_nfse text,
  chave_acesso text,
  codigo_verificacao text,
  serie text DEFAULT '900',
  
  -- Competência e valores
  competencia date NOT NULL,
  valor_servico numeric(15,2) NOT NULL,
  valor_iss numeric(15,2),
  aliquota numeric(5,4),
  
  -- Código de serviço
  codigo_tributacao text,
  cnae text,
  descricao_servico text,
  
  -- Status da nota
  status text NOT NULL DEFAULT 'pendente',
  -- pendente, processando, autorizada, rejeitada, cancelada, substituida
  
  -- Datas
  data_emissao timestamptz,
  data_autorizacao timestamptz,
  data_cancelamento timestamptz,
  
  -- Ambiente
  ambiente text DEFAULT 'producao_restrita',
  
  -- Arquivos (URLs para storage, NÃO armazenar binário)
  xml_url text,
  pdf_url text,
  danfse_url text,
  
  -- Protocolo e retorno da prefeitura
  protocolo text,
  numero_lote text,
  mensagem_retorno text,
  codigo_retorno text,
  
  -- Cancelamento/Substituição
  motivo_cancelamento text,
  nfse_substituta_id uuid REFERENCES public.nfse_history(id),
  
  -- Metadados
  emitido_por uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX idx_nfse_history_contract ON public.nfse_history(contract_id);
CREATE INDEX idx_nfse_history_invoice ON public.nfse_history(invoice_id);
CREATE INDEX idx_nfse_history_client ON public.nfse_history(client_id);
CREATE INDEX idx_nfse_history_chave ON public.nfse_history(chave_acesso);
CREATE INDEX idx_nfse_history_numero ON public.nfse_history(numero_nfse);
CREATE INDEX idx_nfse_history_competencia ON public.nfse_history(competencia);
CREATE INDEX idx_nfse_history_status ON public.nfse_history(status);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_nfse_history_updated_at
  BEFORE UPDATE ON public.nfse_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE public.nfse_history ENABLE ROW LEVEL SECURITY;

-- Staff pode visualizar todas as notas
CREATE POLICY "Staff can view nfse history"
  ON public.nfse_history FOR SELECT
  USING (is_staff(auth.uid()));

-- Admins e financeiro podem gerenciar notas
CREATE POLICY "Financial can manage nfse history"
  ON public.nfse_history FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'financial'::app_role)
  );

-- Comentários na tabela
COMMENT ON TABLE public.nfse_history IS 'Histórico de NFS-e emitidas pelo sistema';
COMMENT ON COLUMN public.nfse_history.chave_acesso IS 'Chave de acesso de 50 caracteres da NFS-e';
COMMENT ON COLUMN public.nfse_history.xml_url IS 'URL do XML da nota no storage (não armazenar binário)';
COMMENT ON COLUMN public.nfse_history.pdf_url IS 'URL do PDF da nota no storage (não armazenar binário)';
COMMENT ON COLUMN public.nfse_history.status IS 'pendente, processando, autorizada, rejeitada, cancelada, substituida';