-- Criar bucket invoice-documents para armazenamento de PDFs de boletos
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-documents', 'invoice-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies para o bucket invoice-documents
CREATE POLICY "Staff can view invoice documents storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'invoice-documents' AND EXISTS (
  SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'financial', 'manager')
));

CREATE POLICY "Service role can upload invoice documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoice-documents');

CREATE POLICY "Service role can update invoice documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'invoice-documents');

-- Limpar boleto_error_msg das faturas resetadas (#14 e #15)
UPDATE invoices
SET boleto_error_msg = NULL,
    updated_at = now()
WHERE boleto_error_msg LIKE '%Resetado%';

-- Limpar registros de nfse_history órfãos com erro de municipalServiceId para reprocessamento
UPDATE nfse_history
SET status = 'pendente',
    mensagem_retorno = NULL,
    codigo_retorno = NULL,
    asaas_invoice_id = NULL,
    asaas_status = NULL,
    updated_at = now()
WHERE status = 'erro'
  AND (codigo_retorno = 'invalid_municipalServiceExternalId' 
       OR codigo_retorno = 'MISSING_MUNICIPAL_SERVICE_CODE'
       OR mensagem_retorno LIKE '%invalid_municipalServiceExternalId%'
       OR mensagem_retorno LIKE '%Código de serviço municipal%');
