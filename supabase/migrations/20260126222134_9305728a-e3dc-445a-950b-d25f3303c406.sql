
-- =====================================================
-- CLEANUP AUTOMÁTICO DE MONITORING_ALERTS (30 DIAS)
-- =====================================================

-- Função para limpar alertas antigos resolvidos
CREATE OR REPLACE FUNCTION public.cleanup_old_monitoring_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Deletar alertas resolvidos com mais de 30 dias
  DELETE FROM monitoring_alerts
  WHERE status = 'resolved'
    AND resolved_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log para auditoria
  IF deleted_count > 0 THEN
    INSERT INTO audit_logs (table_name, action, new_data)
    VALUES ('monitoring_alerts', 'CLEANUP', jsonb_build_object('deleted_count', deleted_count, 'executed_at', NOW()));
  END IF;
  
  RAISE NOTICE 'Cleanup: % alertas antigos removidos', deleted_count;
END;
$$;

-- Índice para otimizar o cleanup
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_resolved_at 
ON monitoring_alerts(resolved_at) 
WHERE status = 'resolved';

-- Índice para otimizar queries de alertas ativos
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_active_device 
ON monitoring_alerts(device_id, status) 
WHERE status = 'active';
