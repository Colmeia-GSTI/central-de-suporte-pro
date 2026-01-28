-- Corrigir vulnerabilidade: tv_dashboard_config expõe tokens publicamente
-- Remover política SELECT pública e restringir a staff

-- Primeiro verificar se a tabela existe e tem política pública
DROP POLICY IF EXISTS "Anyone can view tv dashboard config" ON public.tv_dashboard_config;
DROP POLICY IF EXISTS "Public can view tv dashboard config" ON public.tv_dashboard_config;

-- Criar política restritiva para staff
CREATE POLICY "Staff can view tv dashboard config" 
ON public.tv_dashboard_config 
FOR SELECT 
USING (is_staff(auth.uid()));

-- Corrigir vulnerabilidade: nfse_service_codes também precisa restringir
DROP POLICY IF EXISTS "Anyone can view service codes" ON public.nfse_service_codes;

-- Criar política restritiva para staff
CREATE POLICY "Staff can view service codes" 
ON public.nfse_service_codes 
FOR SELECT 
USING (is_staff(auth.uid()));

-- Criar índices para melhorar performance de queries frequentes
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON public.tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date ON public.invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_status ON public.monitoring_alerts(status, created_at DESC);