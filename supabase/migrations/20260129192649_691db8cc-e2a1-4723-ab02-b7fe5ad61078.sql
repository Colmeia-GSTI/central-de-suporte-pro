-- Fase 1: Expandir tabela monitored_devices
ALTER TABLE monitored_devices 
ADD COLUMN IF NOT EXISTS needs_reboot BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS service_data JSONB DEFAULT '{}';

COMMENT ON COLUMN monitored_devices.needs_reboot IS 
'Indica se o dispositivo precisa de reinicialização (do Tactical RMM)';

COMMENT ON COLUMN monitored_devices.service_data IS 
'Dados detalhados da fonte externa em formato JSON: {
  "os": "Windows 11 Pro",
  "os_version": "10.0.22631",
  "platform": "windows",
  "cpu_model": "Intel i7-12700",
  "cpu_cores": 12,
  "ram_total_gb": 32,
  "boot_time": "ISO timestamp",
  "agent_version": "2.7.0",
  "metrics": {
    "cpu_avg_percent": 35.2,
    "ram_avg_percent": 68.5,
    "disk_avg_percent": 45.0,
    "last_updated_at": "ISO timestamp"
  },
  "services": {
    "ok": 15,
    "warn": 2,
    "crit": 0,
    "unknown": 0
  }
}';

-- Fase 2: Expandir tabela monitoring_alerts
ALTER TABLE monitoring_alerts 
ADD COLUMN IF NOT EXISTS service_name TEXT,
ADD COLUMN IF NOT EXISTS check_output TEXT;

COMMENT ON COLUMN monitoring_alerts.service_name IS 
'Nome do serviço CheckMK (ex: CPU utilization, Disk C:, SQL Server)';

COMMENT ON COLUMN monitoring_alerts.check_output IS 
'Saída detalhada do check com informações técnicas para diagnóstico';