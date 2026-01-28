
-- =====================================================
-- 1. REMOVER REALTIME DE TABELAS DESNECESSÁRIAS
-- =====================================================

ALTER PUBLICATION supabase_realtime DROP TABLE public.message_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.certificates;
ALTER PUBLICATION supabase_realtime DROP TABLE public.push_subscriptions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ticket_transfers;
ALTER PUBLICATION supabase_realtime DROP TABLE public.monitored_devices;
ALTER PUBLICATION supabase_realtime DROP TABLE public.monitoring_alerts;

-- =====================================================
-- 2. REMOVER ÍNDICES NÃO UTILIZADOS (0 scans)
-- =====================================================

-- Índices de nfse_service_codes
DROP INDEX IF EXISTS idx_nfse_service_codes_descricao;
DROP INDEX IF EXISTS idx_nfse_service_codes_categoria;

-- Índices de invoices não usados
DROP INDEX IF EXISTS idx_invoices_ticket_id;
DROP INDEX IF EXISTS idx_invoices_status_due_date;
DROP INDEX IF EXISTS idx_invoices_parent_id;
DROP INDEX IF EXISTS idx_invoices_service_id;
DROP INDEX IF EXISTS idx_invoices_due_date_status;

-- Índices de nfse_history
DROP INDEX IF EXISTS idx_nfse_history_contract;
DROP INDEX IF EXISTS idx_nfse_history_competencia;
DROP INDEX IF EXISTS idx_nfse_history_invoice;
DROP INDEX IF EXISTS idx_nfse_history_client;
DROP INDEX IF EXISTS idx_nfse_history_chave;
DROP INDEX IF EXISTS idx_nfse_history_numero;

-- Índices de calendar_events
DROP INDEX IF EXISTS idx_calendar_events_invoice_id;

-- Índices de certificates
DROP INDEX IF EXISTS idx_certificates_primary;
DROP INDEX IF EXISTS idx_certificates_validade;

-- Índices de client_contacts
DROP INDEX IF EXISTS idx_client_contacts_user_id;

-- Índices de tickets
DROP INDEX IF EXISTS idx_tickets_client_id;

-- Índices de message_logs (tabela pouco usada)
DROP INDEX IF EXISTS idx_message_logs_channel;
DROP INDEX IF EXISTS idx_message_logs_status;
DROP INDEX IF EXISTS idx_message_logs_external_id;
DROP INDEX IF EXISTS idx_message_logs_channel_status;
DROP INDEX IF EXISTS idx_message_logs_user_id;

-- Índices de contracts
DROP INDEX IF EXISTS idx_contracts_status_billing;
DROP INDEX IF EXISTS idx_contracts_client_id;
DROP INDEX IF EXISTS idx_contracts_status;
DROP INDEX IF EXISTS idx_contracts_active;

-- Índices de invoice_generation_log
DROP INDEX IF EXISTS idx_invoice_generation_log_contract;
DROP INDEX IF EXISTS idx_invoice_generation_log_reference_month;

-- Índices de uptime_history
DROP INDEX IF EXISTS idx_uptime_history_checked;
