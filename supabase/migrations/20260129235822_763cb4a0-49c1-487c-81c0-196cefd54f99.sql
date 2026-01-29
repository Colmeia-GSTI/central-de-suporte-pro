
-- 1. Create secure view for software licenses (hide license_key)
DROP VIEW IF EXISTS software_licenses_safe;
CREATE VIEW software_licenses_safe AS
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
  -- Hide the actual key, show only last 4 chars
  CASE 
    WHEN license_key IS NOT NULL THEN '****' || RIGHT(license_key, 4)
    ELSE NULL
  END AS license_key_masked
FROM software_licenses;

-- Grant access to authenticated users
GRANT SELECT ON software_licenses_safe TO authenticated;

-- 2. Create secure view for nfse_history (hide sensitive verification codes)
DROP VIEW IF EXISTS nfse_history_safe;
CREATE VIEW nfse_history_safe AS
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
  -- Mask verification code
  CASE 
    WHEN codigo_verificacao IS NOT NULL THEN LEFT(codigo_verificacao, 4) || '****'
    ELSE NULL
  END AS codigo_verificacao_masked
FROM nfse_history;

-- Grant access to authenticated users
GRANT SELECT ON nfse_history_safe TO authenticated;

-- 3. Create secure function to access certificate password with audit
CREATE OR REPLACE FUNCTION public.get_certificate_password(cert_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  password_hash TEXT;
BEGIN
  -- Only admins and financial can access certificate passwords
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financial')) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin or financial roles can access certificate passwords';
  END IF;
  
  SELECT senha_hash INTO password_hash
  FROM certificates
  WHERE id = cert_id;
  
  -- Log the access for audit
  INSERT INTO audit_logs (table_name, record_id, action, user_id, new_data)
  VALUES ('certificates', cert_id, 'PASSWORD_ACCESS', auth.uid(), jsonb_build_object('accessed_at', now()));
  
  RETURN password_hash;
END;
$$;

-- 4. Create secure function for company certificate password
CREATE OR REPLACE FUNCTION public.get_company_certificate_password()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  password_hash TEXT;
  company_id UUID;
BEGIN
  -- Only admins and financial can access
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financial')) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin or financial roles can access certificate passwords';
  END IF;
  
  SELECT id, certificado_senha_hash INTO company_id, password_hash
  FROM company_settings
  LIMIT 1;
  
  -- Log the access for audit
  INSERT INTO audit_logs (table_name, record_id, action, user_id, new_data)
  VALUES ('company_settings', company_id, 'CERTIFICATE_PASSWORD_ACCESS', auth.uid(), jsonb_build_object('accessed_at', now()));
  
  RETURN password_hash;
END;
$$;

-- 5. Create secure function for license keys with audit
CREATE OR REPLACE FUNCTION public.get_license_key(license_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key TEXT;
BEGIN
  -- Only admins can access full license keys
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admin can access full license keys';
  END IF;
  
  SELECT license_key INTO key
  FROM software_licenses
  WHERE id = license_id;
  
  -- Log the access for audit
  INSERT INTO audit_logs (table_name, record_id, action, user_id, new_data)
  VALUES ('software_licenses', license_id, 'LICENSE_KEY_ACCESS', auth.uid(), jsonb_build_object('accessed_at', now()));
  
  RETURN key;
END;
$$;

-- 6. Create secure function for Google Calendar tokens (only user's own)
CREATE OR REPLACE FUNCTION public.get_calendar_tokens(user_uuid UUID)
RETURNS TABLE(access_token TEXT, refresh_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Users can only get their own tokens
  IF auth.uid() != user_uuid THEN
    RAISE EXCEPTION 'Unauthorized: Can only access your own calendar tokens';
  END IF;
  
  RETURN QUERY
  SELECT g.access_token, g.refresh_token
  FROM google_calendar_integrations g
  WHERE g.user_id = user_uuid;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_certificate_password IS 
'Secure function to access certificate passwords with audit logging. Only admin/financial roles allowed.';

COMMENT ON FUNCTION public.get_license_key IS 
'Secure function to access full license keys with audit logging. Only admin role allowed.';

COMMENT ON VIEW software_licenses_safe IS 
'Secure view that masks license keys for general staff access.';

COMMENT ON VIEW nfse_history_safe IS 
'Secure view that masks verification codes for general access.';
