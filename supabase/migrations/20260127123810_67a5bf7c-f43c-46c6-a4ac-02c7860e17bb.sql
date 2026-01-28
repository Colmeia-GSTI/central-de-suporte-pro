-- Fix: Convert views from SECURITY DEFINER to SECURITY INVOKER

-- Drop and recreate views with SECURITY INVOKER
DROP VIEW IF EXISTS public.software_licenses_safe;
DROP VIEW IF EXISTS public.nfse_history_safe;

-- Recreate software_licenses_safe with SECURITY INVOKER
CREATE VIEW public.software_licenses_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  client_id,
  name,
  vendor,
  total_licenses,
  used_licenses,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN license_key
    ELSE '••••••••••••••••'
  END as license_key,
  purchase_date,
  expire_date,
  purchase_value,
  notes,
  created_at,
  updated_at
FROM public.software_licenses;

-- Recreate nfse_history_safe with SECURITY INVOKER
CREATE VIEW public.nfse_history_safe 
WITH (security_invoker = true)
AS
SELECT 
  id, invoice_id, contract_id, client_id, numero_nfse,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financial'::app_role) 
    THEN chave_acesso
    ELSE NULL
  END as chave_acesso,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financial'::app_role) 
    THEN codigo_verificacao
    ELSE NULL
  END as codigo_verificacao,
  status, data_emissao, data_autorizacao, data_cancelamento,
  valor_servico, valor_iss, aliquota, descricao_servico,
  pdf_url, xml_url, danfse_url,
  provider, ambiente, created_at, updated_at
FROM public.nfse_history;