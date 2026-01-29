
-- Fix security definer views - convert to security invoker
DROP VIEW IF EXISTS software_licenses_safe;
CREATE VIEW software_licenses_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  client_id,
  name,
  vendor,
  total_licenses,
  used_licenses,
  purchase_date,
  expire_date,
  purchase_value,
  notes,
  created_at,
  updated_at,
  CASE 
    WHEN license_key IS NOT NULL THEN '****' || RIGHT(license_key, 4)
    ELSE NULL
  END AS license_key_masked
FROM software_licenses;

GRANT SELECT ON software_licenses_safe TO authenticated;

DROP VIEW IF EXISTS nfse_history_safe;
CREATE VIEW nfse_history_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  contract_id,
  invoice_id,
  client_id,
  numero_nfse,
  chave_acesso,
  serie,
  competencia,
  valor_servico,
  valor_iss,
  aliquota,
  codigo_tributacao,
  cnae,
  descricao_servico,
  status,
  data_emissao,
  data_autorizacao,
  data_cancelamento,
  ambiente,
  xml_url,
  pdf_url,
  danfse_url,
  protocolo,
  numero_lote,
  mensagem_retorno,
  codigo_retorno,
  motivo_cancelamento,
  nfse_substituta_id,
  emitido_por,
  created_at,
  updated_at,
  asaas_invoice_id,
  asaas_payment_id,
  asaas_status,
  municipal_service_id,
  provider,
  CASE 
    WHEN codigo_verificacao IS NOT NULL THEN LEFT(codigo_verificacao, 4) || '****'
    ELSE NULL
  END AS codigo_verificacao_masked
FROM nfse_history;

GRANT SELECT ON nfse_history_safe TO authenticated;
