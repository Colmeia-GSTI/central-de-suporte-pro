-- ============================================================
-- TAREFA 1: Corrigir RLS permissivas demais
-- ============================================================

-- 1a. nfse_cancellation_log: Restringir UPDATE a admin/financial
DO $$
BEGIN
  DROP POLICY IF EXISTS "Staff can update cancellation logs" ON public.nfse_cancellation_log;
  DROP POLICY IF EXISTS "Staff can manage cancellation logs" ON public.nfse_cancellation_log;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nfse_cancellation_log') THEN
    EXECUTE 'CREATE POLICY "Only financial_admin can update cancellation logs" ON public.nfse_cancellation_log FOR UPDATE TO authenticated USING (public.is_financial_admin(auth.uid())) WITH CHECK (public.is_financial_admin(auth.uid()))';
  END IF;
END $$;

-- 1b. application_logs: Restringir INSERT a staff only
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can insert logs" ON public.application_logs;
  DROP POLICY IF EXISTS "Authenticated can insert logs" ON public.application_logs;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'application_logs') THEN
    EXECUTE 'CREATE POLICY "Only staff can insert logs" ON public.application_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()))';
  END IF;
END $$;

-- 1c. storage_config: Restringir SELECT apenas a admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'storage_config') THEN
    DROP POLICY IF EXISTS "Financial can view storage config" ON public.storage_config;
    DROP POLICY IF EXISTS "Staff can view storage config" ON public.storage_config;
    DROP POLICY IF EXISTS "Only admin can view storage config" ON public.storage_config;
    EXECUTE 'CREATE POLICY "Only admin can view storage config" ON public.storage_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))';
  END IF;
END $$;

-- ============================================================
-- TAREFA 2: Views seguras para dados sensíveis
-- ============================================================

-- 2a. certificates_safe view (sem senha_hash e arquivo_url)
CREATE OR REPLACE VIEW public.certificates_safe AS
SELECT 
  id,
  nome,
  tipo,
  titular,
  emissor,
  numero_serie,
  validade,
  descricao,
  company_id,
  is_primary,
  uploaded_at,
  created_at,
  updated_at
FROM public.certificates;

-- 2b. company_settings_safe view (sem certificado_senha_hash)
CREATE OR REPLACE VIEW public.company_settings_safe AS
SELECT
  id,
  razao_social,
  nome_fantasia,
  cnpj,
  inscricao_estadual,
  inscricao_municipal,
  email,
  telefone,
  endereco_logradouro,
  endereco_numero,
  endereco_complemento,
  endereco_bairro,
  endereco_cidade,
  endereco_uf,
  endereco_cep,
  endereco_codigo_ibge,
  certificado_tipo,
  certificado_validade,
  certificado_uploaded_at,
  certificado_arquivo_url,
  nfse_ambiente,
  nfse_regime_tributario,
  nfse_optante_simples,
  nfse_incentivador_cultural,
  nfse_cnae_padrao,
  nfse_codigo_tributacao_padrao,
  nfse_aliquota_padrao,
  nfse_descricao_servico_padrao,
  business_hours,
  created_at,
  updated_at
FROM public.company_settings;