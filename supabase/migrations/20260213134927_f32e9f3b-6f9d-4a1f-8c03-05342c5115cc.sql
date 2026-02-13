
-- ========================================
-- 8. Storage Retention Policies table
-- ========================================
CREATE TABLE public.storage_retention_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_name text NOT NULL UNIQUE,
  retention_days integer NOT NULL DEFAULT 2555, -- 7 years
  backup_enabled boolean NOT NULL DEFAULT false,
  last_audit_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage retention policies"
  ON public.storage_retention_policies FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Financial can view retention policies"
  ON public.storage_retention_policies FOR SELECT
  USING (is_financial_admin(auth.uid()));

-- Insert default policy for nfse-files bucket
INSERT INTO public.storage_retention_policies (bucket_name, retention_days, backup_enabled)
VALUES ('nfse-files', 2555, false);

-- ========================================
-- 10. Additional Charges Report RPC
-- ========================================
CREATE OR REPLACE FUNCTION public.get_additional_charges_report(
  start_date timestamp with time zone,
  end_date timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'by_client', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          c.name as client_name,
          c.id as client_id,
          count(cac.id) as charge_count,
          sum(cac.amount) as total_amount
        FROM contract_additional_charges cac
        JOIN contracts ct ON ct.id = cac.contract_id
        JOIN clients c ON c.id = ct.client_id
        WHERE cac.created_at >= start_date 
          AND cac.created_at <= end_date
        GROUP BY c.id, c.name
        ORDER BY sum(cac.amount) DESC
      ) t
    ),
    'totals', (
      SELECT row_to_json(t)
      FROM (
        SELECT 
          count(*) as total_count,
          coalesce(sum(amount), 0) as total_amount
        FROM contract_additional_charges
        WHERE created_at >= start_date AND created_at <= end_date
      ) t
    ),
    'avulsas', (
      SELECT row_to_json(t)
      FROM (
        SELECT 
          count(*) as total_count,
          coalesce(sum(valor_servico), 0) as total_amount
        FROM nfse_history
        WHERE contract_id IS NULL
          AND created_at >= start_date AND created_at <= end_date
          AND status != 'cancelada'
      ) t
    ),
    'monthly', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          to_char(cac.created_at, 'YYYY-MM') as month,
          sum(cac.amount) as additional_amount,
          (SELECT coalesce(sum(ct2.monthly_value), 0) 
           FROM contracts ct2 
           WHERE ct2.status = 'active') as recurring_amount
        FROM contract_additional_charges cac
        WHERE cac.created_at >= start_date AND cac.created_at <= end_date
        GROUP BY to_char(cac.created_at, 'YYYY-MM')
        ORDER BY month
      ) t
    ),
    'upsell_candidates', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          c.name as client_name,
          c.id as client_id,
          count(nh.id) as avulsa_count,
          sum(nh.valor_servico) as avulsa_total
        FROM nfse_history nh
        JOIN clients c ON c.id = nh.client_id
        WHERE nh.contract_id IS NULL
          AND nh.created_at >= start_date AND nh.created_at <= end_date
          AND nh.status != 'cancelada'
        GROUP BY c.id, c.name
        HAVING count(nh.id) >= 3
        ORDER BY count(nh.id) DESC
      ) t
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- ========================================
-- 12. Financial Incident SLAs table
-- ========================================
CREATE TYPE public.incident_type_enum AS ENUM ('nfse_failure', 'boleto_failure', 'send_failure', 'e0014');

CREATE TABLE public.financial_incident_slas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_type public.incident_type_enum NOT NULL UNIQUE,
  resolution_hours integer NOT NULL,
  escalation_role text NOT NULL DEFAULT 'admin',
  notification_template text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_incident_slas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage incident SLAs"
  ON public.financial_incident_slas FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view incident SLAs"
  ON public.financial_incident_slas FOR SELECT
  USING (is_staff(auth.uid()));

-- Insert default SLAs
INSERT INTO public.financial_incident_slas (incident_type, resolution_hours, escalation_role, notification_template) VALUES
  ('nfse_failure', 4, 'admin', 'Falha na emissão de NFS-e para {{client_name}} - Fatura #{{invoice_number}}'),
  ('boleto_failure', 2, 'admin', 'Falha na geração de boleto para {{client_name}} - Fatura #{{invoice_number}}'),
  ('send_failure', 24, 'financial', 'Falha no envio de cobrança para {{client_name}} - Fatura #{{invoice_number}}'),
  ('e0014', 48, 'admin', 'Erro E0014 (DPS duplicada) para {{client_name}} - NFS-e pendente de vinculação');
