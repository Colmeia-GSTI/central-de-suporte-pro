-- Adicionar campo billing_provider em contracts
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'banco_inter';

-- Adicionar constraint para valores válidos
ALTER TABLE public.contracts
DROP CONSTRAINT IF EXISTS contracts_billing_provider_check;

ALTER TABLE public.contracts
ADD CONSTRAINT contracts_billing_provider_check 
CHECK (billing_provider IN ('banco_inter', 'asaas'));

COMMENT ON COLUMN public.contracts.billing_provider IS 
  'Provedor de cobrança: banco_inter ou asaas';

-- Adicionar campo billing_provider em invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS billing_provider TEXT;

-- Adicionar constraint para valores válidos
ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_billing_provider_check;

ALTER TABLE public.invoices
ADD CONSTRAINT invoices_billing_provider_check 
CHECK (billing_provider IS NULL OR billing_provider IN ('banco_inter', 'asaas'));

COMMENT ON COLUMN public.invoices.billing_provider IS 
  'Provedor de cobrança usado para esta fatura (herda do contrato se nulo)';

-- Adicionar campos para dados do Asaas na fatura
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_invoice_url TEXT;