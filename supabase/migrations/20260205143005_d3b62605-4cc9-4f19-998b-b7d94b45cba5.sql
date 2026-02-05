-- Tabela para logs de aplicação (billing, nfse, auth, etc)
CREATE TABLE IF NOT EXISTS public.application_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  level text NOT NULL,
  module text NOT NULL,
  action text,
  message text NOT NULL,
  context jsonb,
  error_details jsonb,
  execution_id uuid,
  duration_ms integer,
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT app_logs_level_check CHECK (level IN ('error', 'warn', 'info', 'debug'))
);

-- Índices para performance nas queries de logs
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.application_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id ON public.application_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_module_level ON public.application_logs(module, level);
CREATE INDEX IF NOT EXISTS idx_app_logs_execution_id ON public.application_logs(execution_id);

-- RLS
ALTER TABLE public.application_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins e financeiro podem ver logs
CREATE POLICY "Admins and financial can view logs"
  ON public.application_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'financial', 'manager')
    )
  );

-- Sistema pode inserir logs (via service role ou functions)
CREATE POLICY "Service can insert logs"
  ON public.application_logs
  FOR INSERT
  WITH CHECK (true);

-- Cleanup automático de logs antigos (manter últimos 30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_application_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM application_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    INSERT INTO audit_logs (table_name, action, new_data)
    VALUES ('application_logs', 'CLEANUP', jsonb_build_object('deleted_count', deleted_count, 'executed_at', NOW()));
  END IF;
END;
$$;