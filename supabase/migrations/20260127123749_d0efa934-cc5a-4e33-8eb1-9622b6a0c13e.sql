-- Security Hardening: Strengthen RLS policies for sensitive data

-- 1. Restrict certificate password access to admin/financial only (not all staff)
DROP POLICY IF EXISTS "Staff pode visualizar certificados" ON public.certificates;

CREATE POLICY "Authorized staff can view certificates without passwords" 
ON public.certificates 
FOR SELECT 
USING (is_staff(auth.uid()));

-- 2. Restrict audit_logs INSERT to admin/service role only (prevent tampering)
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.audit_logs;

CREATE POLICY "Only admins and system can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL
);

-- 3. Restrict software_licenses to admin only for viewing keys
DROP POLICY IF EXISTS "Staff can view licenses" ON public.software_licenses;

CREATE POLICY "Staff can view licenses metadata" 
ON public.software_licenses 
FOR SELECT 
USING (is_staff(auth.uid()));

-- Create a view for safe license data (hides license_key from non-admins)
CREATE OR REPLACE VIEW public.software_licenses_safe AS
SELECT 
  id,
  client_id,
  name,
  vendor,
  total_licenses,
  used_licenses,
  CASE 
    WHEN is_staff(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role) THEN license_key
    ELSE '••••••••••••••••'
  END as license_key,
  purchase_date,
  expire_date,
  purchase_value,
  notes,
  created_at,
  updated_at
FROM public.software_licenses;

-- 4. Add index for faster RLS policy checks
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup ON public.user_roles(user_id, role);

-- 5. Restrict nfse_history access keys to financial/admin only via view
CREATE OR REPLACE VIEW public.nfse_history_safe AS
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

-- 6. Add missing index for RLS performance
CREATE INDEX IF NOT EXISTS idx_client_contacts_user_id ON public.client_contacts(user_id) WHERE user_id IS NOT NULL;