-- =====================================================
-- MIGRAÇÃO: Adicionar campos de status de processamento e configuração S3
-- =====================================================

-- 1. CRIAR TIPOS ENUM PARA STATUS
-- =====================================================

-- Enum para status de processamento de boleto
DO $$ BEGIN
    CREATE TYPE boleto_processing_status AS ENUM ('pendente', 'gerado', 'enviado', 'erro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum para status de processamento de NFS-e
DO $$ BEGIN
    CREATE TYPE nfse_processing_status AS ENUM ('pendente', 'gerada', 'erro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum para status de envio de email
DO $$ BEGIN
    CREATE TYPE email_processing_status AS ENUM ('pendente', 'enviado', 'erro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ADICIONAR CAMPOS NA TABELA INVOICES
-- =====================================================

-- Adicionar FK para nfse_history (se não existir)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS nfse_history_id uuid REFERENCES public.nfse_history(id);

-- Campos de status de boleto
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS boleto_status boleto_processing_status DEFAULT 'pendente';

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS boleto_error_msg text;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS boleto_sent_at timestamp with time zone;

-- Campos de status de NFS-e
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS nfse_status nfse_processing_status DEFAULT 'pendente';

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS nfse_error_msg text;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS nfse_generated_at timestamp with time zone;

-- Campos de status de email
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS email_status email_processing_status DEFAULT 'pendente';

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS email_error_msg text;

-- Campos gerais de processamento
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS processing_attempts integer DEFAULT 0;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS processing_metadata jsonb DEFAULT '{}'::jsonb;

-- 3. CRIAR TABELA STORAGE_CONFIG
-- =====================================================

CREATE TABLE IF NOT EXISTS public.storage_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL DEFAULT 'supabase', -- 'supabase', 's3', 'minio', 'netscope'
    bucket_name text NOT NULL,
    endpoint_url text, -- Para S3-compatible (MinIO, etc)
    region text DEFAULT 'us-east-1',
    access_key_encrypted text, -- Chave de acesso encriptada
    secret_key_encrypted text, -- Chave secreta encriptada
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- RLS para storage_config
ALTER TABLE public.storage_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage storage config" ON public.storage_config
    FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Financial can view storage config" ON public.storage_config
    FOR SELECT USING (has_role(auth.uid(), 'financial'));

-- 4. CRIAR TABELA INVOICE_DOCUMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.invoice_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    document_type text NOT NULL, -- 'boleto_pdf', 'nfse_pdf', 'nfse_xml', 'anexo'
    file_path text NOT NULL, -- Caminho no bucket
    file_name text NOT NULL,
    file_size integer,
    mime_type text,
    storage_provider text DEFAULT 'supabase', -- 'supabase', 's3', 'minio'
    bucket_name text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone, -- Para URLs temporárias
    metadata jsonb DEFAULT '{}'::jsonb
);

-- RLS para invoice_documents
ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Financial can manage invoice documents" ON public.invoice_documents
    FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financial'));

CREATE POLICY "Financial can view invoice documents" ON public.invoice_documents
    FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'financial'));

-- 5. CRIAR ÍNDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_invoices_boleto_status ON public.invoices(boleto_status);
CREATE INDEX IF NOT EXISTS idx_invoices_nfse_status ON public.invoices(nfse_status);
CREATE INDEX IF NOT EXISTS idx_invoices_email_status ON public.invoices(email_status);
CREATE INDEX IF NOT EXISTS idx_invoices_processed_at ON public.invoices(processed_at);
CREATE INDEX IF NOT EXISTS idx_invoices_nfse_history_id ON public.invoices(nfse_history_id);
CREATE INDEX IF NOT EXISTS idx_invoice_documents_invoice_id ON public.invoice_documents(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_documents_document_type ON public.invoice_documents(document_type);

-- 6. FUNÇÃO PARA ATUALIZAR STATUS DE FATURA
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_invoice_status(
    p_invoice_id uuid,
    p_boleto_status boleto_processing_status DEFAULT NULL,
    p_boleto_error text DEFAULT NULL,
    p_nfse_status nfse_processing_status DEFAULT NULL,
    p_nfse_error text DEFAULT NULL,
    p_email_status email_processing_status DEFAULT NULL,
    p_email_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE invoices
    SET
        boleto_status = COALESCE(p_boleto_status, boleto_status),
        boleto_error_msg = CASE WHEN p_boleto_status IS NOT NULL THEN p_boleto_error ELSE boleto_error_msg END,
        boleto_sent_at = CASE WHEN p_boleto_status = 'enviado' THEN now() ELSE boleto_sent_at END,
        nfse_status = COALESCE(p_nfse_status, nfse_status),
        nfse_error_msg = CASE WHEN p_nfse_status IS NOT NULL THEN p_nfse_error ELSE nfse_error_msg END,
        nfse_generated_at = CASE WHEN p_nfse_status = 'gerada' THEN now() ELSE nfse_generated_at END,
        email_status = COALESCE(p_email_status, email_status),
        email_error_msg = CASE WHEN p_email_status IS NOT NULL THEN p_email_error ELSE email_error_msg END,
        email_sent_at = CASE WHEN p_email_status = 'enviado' THEN now() ELSE email_sent_at END,
        processing_attempts = processing_attempts + 1,
        updated_at = now()
    WHERE id = p_invoice_id;
END;
$$;

-- 7. FUNÇÃO PARA GERAR URL ASSINADA
-- =====================================================

CREATE OR REPLACE FUNCTION public.generate_signed_url(
    p_bucket text,
    p_path text,
    p_expires_in integer DEFAULT 3600
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
BEGIN
    -- Esta função é um placeholder - a lógica real de assinatura 
    -- será implementada via Edge Function com as credenciais apropriadas
    -- Por ora, retorna o caminho do arquivo para uso com storage.from()
    
    SELECT format('%s/storage/v1/object/sign/%s/%s?token=placeholder&expires_in=%s',
        current_setting('app.settings.supabase_url', true),
        p_bucket,
        p_path,
        p_expires_in
    ) INTO v_url;
    
    RETURN v_url;
END;
$$;