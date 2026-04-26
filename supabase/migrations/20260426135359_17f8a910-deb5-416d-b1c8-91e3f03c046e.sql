-- Phase 1: FK indexes for tables with current volume or core system
-- Using IF NOT EXISTS for idempotency

-- Histórico / Auditoria
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_user_id ON public.ticket_history(user_id);
CREATE INDEX IF NOT EXISTS idx_client_history_user_id ON public.client_history(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_history_user_id ON public.contract_history(user_id);

-- Faturamento
CREATE INDEX IF NOT EXISTS idx_invoice_generation_log_contract_id ON public.invoice_generation_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoice_generation_log_invoice_id ON public.invoice_generation_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_parent_invoice_id ON public.invoices(parent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_service_id ON public.invoices(service_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ticket_id ON public.invoices(ticket_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_cost_center_id ON public.financial_entries(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_invoice_id ON public.financial_entries(invoice_id);

-- Contratos
CREATE INDEX IF NOT EXISTS idx_contract_services_contract_id ON public.contract_services(contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_nfse_service_code_id ON public.contracts(nfse_service_code_id);

-- Clientes
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON public.client_contacts(client_id);

-- Tickets
CREATE INDEX IF NOT EXISTS idx_tickets_asset_id ON public.tickets(asset_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON public.tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contract_id ON public.tickets(contract_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_department_id ON public.tickets(department_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON public.ticket_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_pauses_paused_by ON public.ticket_pauses(paused_by);

-- Outros
CREATE INDEX IF NOT EXISTS idx_doc_sync_log_client_id ON public.doc_sync_log(client_id);
CREATE INDEX IF NOT EXISTS idx_monitored_devices_asset_id ON public.monitored_devices(asset_id);
CREATE INDEX IF NOT EXISTS idx_sla_configs_category_id ON public.sla_configs(category_id);
CREATE INDEX IF NOT EXISTS idx_sla_configs_client_id ON public.sla_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_nfse_history_nfse_substituta_id ON public.nfse_history(nfse_substituta_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_author_id ON public.knowledge_articles(author_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category_id ON public.knowledge_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_client_id ON public.knowledge_articles(client_id);
CREATE INDEX IF NOT EXISTS idx_technician_points_ticket_id ON public.technician_points(ticket_id);
CREATE INDEX IF NOT EXISTS idx_technician_points_user_id ON public.technician_points(user_id);

-- ANALYZE para atualizar estatísticas do planner
ANALYZE public.audit_logs;
ANALYZE public.ticket_history;
ANALYZE public.client_history;
ANALYZE public.contract_history;
ANALYZE public.invoice_generation_log;
ANALYZE public.invoice_items;
ANALYZE public.invoices;
ANALYZE public.financial_entries;
ANALYZE public.contract_services;
ANALYZE public.contracts;
ANALYZE public.client_contacts;
ANALYZE public.tickets;
ANALYZE public.ticket_comments;
ANALYZE public.ticket_pauses;
ANALYZE public.doc_sync_log;
ANALYZE public.monitored_devices;
ANALYZE public.sla_configs;
ANALYZE public.nfse_history;
ANALYZE public.knowledge_articles;
ANALYZE public.technician_points;