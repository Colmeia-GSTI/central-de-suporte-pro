-- =============================================
-- ADD INVOICE PROCESSING STATUS TRACKING
-- AND S3 STORAGE CONFIGURATION
-- =============================================

-- 1. CREATE ENUMS FOR STATUS TRACKING
-- =============================================

-- Status de processamento de boleto
CREATE TYPE public.boleto_processing_status AS ENUM ('pendente', 'gerado', 'enviado', 'erro');

-- Status de processamento de NFS-e
CREATE TYPE public.nfse_processing_status AS ENUM ('pendente', 'gerada', 'erro');

-- Status de envio de email
CREATE TYPE public.email_processing_status AS ENUM ('pendente', 'enviado', 'erro');

-- 2. ADD COLUMNS TO INVOICES TABLE
-- =============================================

-- Adicionar coluna para vincular com NFS-e emitida
ALTER TABLE public.invoices
ADD COLUMN nfse_history_id UUID REFERENCES public.nfse_history(id) ON DELETE SET NULL;

-- Status de processamento de boleto
ALTER TABLE public.invoices
ADD COLUMN boleto_status boleto_processing_status DEFAULT 'pendente',
ADD COLUMN boleto_error_msg TEXT,
ADD COLUMN boleto_sent_at TIMESTAMPTZ;

-- Status de processamento de NFS-e
ALTER TABLE public.invoices
ADD COLUMN nfse_status nfse_processing_status DEFAULT 'pendente',
ADD COLUMN nfse_error_msg TEXT,
ADD COLUMN nfse_generated_at TIMESTAMPTZ;

-- Status de envio de email
ALTER TABLE public.invoices
ADD COLUMN email_status email_processing_status DEFAULT 'pendente',
ADD COLUMN email_sent_at TIMESTAMPTZ,
ADD COLUMN email_error_msg TEXT;

-- Timestamp de processamento completo
ALTER TABLE public.invoices
ADD COLUMN processed_at TIMESTAMPTZ;

-- Número de tentativas de processamento
ALTER TABLE public.invoices
ADD COLUMN processing_attempts INTEGER DEFAULT 0;

-- Informações adicionais em JSON
ALTER TABLE public.invoices
ADD COLUMN processing_metadata JSONB;

-- 3. CREATE STORAGE_CONFIG TABLE
-- =============================================

CREATE TABLE public.storage_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificação
    name TEXT NOT NULL,
    description TEXT,

    -- Configuração do Storage
    provider TEXT NOT NULL, -- 'netskope', 's3', 'minio', etc
    endpoint TEXT NOT NULL,
    region TEXT,
    bucket_name TEXT NOT NULL,

    -- Credenciais (criptografadas via Supabase Vault)
    access_key TEXT NOT NULL,
    secret_key TEXT NOT NULL,

    -- Configurações adicionais
    path_prefix TEXT DEFAULT '{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf',
    signed_url_expiry_hours INTEGER DEFAULT 48,
    auto_upload_enabled BOOLEAN DEFAULT false,

    -- Status
    is_active BOOLEAN DEFAULT false,
    last_tested_at TIMESTAMPTZ,
    last_test_result TEXT, -- 'success' ou mensagem de erro

    -- Auditoria
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. CREATE TABLE FOR STORED DOCUMENTS
-- =============================================

CREATE TABLE public.invoice_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,

    -- Tipo de documento
    document_type TEXT NOT NULL, -- 'boleto', 'nfse', 'xml', 'attachment'

    -- Informações do arquivo
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Caminho no S3 ou storage local
    file_size INTEGER,
    mime_type TEXT,

    -- URL de acesso
    storage_config_id UUID REFERENCES public.storage_config(id) ON DELETE SET NULL,
    public_url TEXT,
    signed_url TEXT,
    signed_url_expires_at TIMESTAMPTZ,

    -- Status
    upload_status TEXT DEFAULT 'pending', -- 'pending', 'uploaded', 'error'
    upload_error_msg TEXT,

    -- Auditoria
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CREATE INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_invoices_boleto_status ON public.invoices(boleto_status);
CREATE INDEX idx_invoices_nfse_status ON public.invoices(nfse_status);
CREATE INDEX idx_invoices_email_status ON public.invoices(email_status);
CREATE INDEX idx_invoices_processed_at ON public.invoices(processed_at);
CREATE INDEX idx_invoices_nfse_history_id ON public.invoices(nfse_history_id);

CREATE INDEX idx_storage_config_is_active ON public.storage_config(is_active);
CREATE INDEX idx_storage_config_provider ON public.storage_config(provider);

CREATE INDEX idx_invoice_documents_invoice_id ON public.invoice_documents(invoice_id);
CREATE INDEX idx_invoice_documents_document_type ON public.invoice_documents(document_type);
CREATE INDEX idx_invoice_documents_storage_config_id ON public.invoice_documents(storage_config_id);

-- 6. CREATE FUNCTION TO UPDATE INVOICE STATUS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_invoice_status(
    p_invoice_id UUID,
    p_boleto_status boleto_processing_status DEFAULT NULL,
    p_nfse_status nfse_processing_status DEFAULT NULL,
    p_email_status email_processing_status DEFAULT NULL,
    p_processing_metadata JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE public.invoices
    SET
        boleto_status = COALESCE(p_boleto_status, boleto_status),
        nfse_status = COALESCE(p_nfse_status, nfse_status),
        email_status = COALESCE(p_email_status, email_status),
        processing_metadata = COALESCE(p_processing_metadata, processing_metadata),
        -- Se todos os status forem "enviado/gerada/enviado", marcar como processado
        processed_at = CASE
            WHEN COALESCE(p_boleto_status, boleto_status) = 'enviado'::boleto_processing_status
                 AND COALESCE(p_nfse_status, nfse_status) = 'gerada'::nfse_processing_status
                 AND COALESCE(p_email_status, email_status) = 'enviado'::email_processing_status
            THEN now()
            ELSE processed_at
        END,
        updated_at = now()
    WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- 7. CREATE FUNCTION TO GENERATE SIGNED URLS
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_signed_url(
    p_invoice_document_id UUID,
    p_expiry_hours INTEGER DEFAULT 48
)
RETURNS TEXT AS $$
DECLARE
    v_document RECORD;
    v_config RECORD;
BEGIN
    SELECT * INTO v_document FROM public.invoice_documents WHERE id = p_invoice_document_id;
    SELECT * INTO v_config FROM public.storage_config WHERE id = v_document.storage_config_id;

    -- Aqui seria chamada a função de geração de URL assinada
    -- Para agora, retornamos um placeholder
    -- A implementação real será feita via Edge Function

    UPDATE public.invoice_documents
    SET
        signed_url_expires_at = now() + (p_expiry_hours || ' hours')::INTERVAL,
        updated_at = now()
    WHERE id = p_invoice_document_id;

    RETURN 'https://signed-url-placeholder.example.com';
END;
$$ LANGUAGE plpgsql;
