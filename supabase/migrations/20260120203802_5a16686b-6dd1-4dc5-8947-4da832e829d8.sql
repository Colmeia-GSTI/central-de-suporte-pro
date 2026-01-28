-- Adicionar colunas na tabela nfse_history para suporte ao Asaas
ALTER TABLE public.nfse_history 
ADD COLUMN IF NOT EXISTS asaas_invoice_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_status TEXT,
ADD COLUMN IF NOT EXISTS municipal_service_id TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'nacional';

-- Adicionar coluna na tabela clients para ID do cliente no Asaas
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

-- Indexes para busca eficiente
CREATE INDEX IF NOT EXISTS idx_nfse_history_asaas_invoice_id 
ON public.nfse_history(asaas_invoice_id) WHERE asaas_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nfse_history_provider_status_updated 
ON public.nfse_history(provider, status, updated_at) 
WHERE provider = 'asaas' AND status = 'processando';

CREATE INDEX IF NOT EXISTS idx_clients_asaas_customer_id 
ON public.clients(asaas_customer_id) WHERE asaas_customer_id IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.nfse_history.asaas_invoice_id IS 'ID da invoice no Asaas (ex: inv_000123)';
COMMENT ON COLUMN public.nfse_history.asaas_payment_id IS 'ID do pagamento vinculado no Asaas (ex: pay_000123)';
COMMENT ON COLUMN public.nfse_history.asaas_status IS 'Status original retornado pelo Asaas';
COMMENT ON COLUMN public.nfse_history.municipal_service_id IS 'ID do serviço municipal no Asaas';
COMMENT ON COLUMN public.nfse_history.provider IS 'Provedor usado: asaas ou nacional';
COMMENT ON COLUMN public.clients.asaas_customer_id IS 'ID do cliente no Asaas (ex: cus_000123)';