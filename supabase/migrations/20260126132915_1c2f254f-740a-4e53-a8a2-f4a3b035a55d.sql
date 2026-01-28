-- =============================================
-- ÍNDICES DE PERFORMANCE - OTIMIZAÇÃO DE QUERIES
-- =============================================

-- Tickets - queries mais frequentes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_contact ON public.tickets(requester_contact_id);
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at ON public.tickets(resolved_at DESC NULLS LAST);

-- Índice composto para listagem principal de tickets
CREATE INDEX IF NOT EXISTS idx_tickets_active_list 
ON public.tickets(status, assigned_to, created_at DESC) 
WHERE status NOT IN ('resolved', 'closed');

-- Invoices - queries financeiras
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON public.invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_overdue 
ON public.invoices(due_date, status) 
WHERE status IN ('pending', 'overdue');

-- Contracts - listagens ativas
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_active 
ON public.contracts(client_id, status) 
WHERE status = 'active';

-- Assets - inventário
CREATE INDEX IF NOT EXISTS idx_assets_client_id ON public.assets(client_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON public.assets(status);

-- Monitoring
CREATE INDEX IF NOT EXISTS idx_monitored_devices_client ON public.monitored_devices(client_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_status ON public.monitoring_alerts(status);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_device ON public.monitoring_alerts(device_id);

-- Clients
CREATE INDEX IF NOT EXISTS idx_clients_active ON public.clients(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients(name);

-- NFSe
CREATE INDEX IF NOT EXISTS idx_nfse_status ON public.nfse_history(status);
CREATE INDEX IF NOT EXISTS idx_nfse_client ON public.nfse_history(client_id);
CREATE INDEX IF NOT EXISTS idx_nfse_competencia ON public.nfse_history(competencia);

-- Calendar events
CREATE INDEX IF NOT EXISTS idx_calendar_user ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_dates ON public.calendar_events(start_time, end_time);

-- Knowledge articles
CREATE INDEX IF NOT EXISTS idx_knowledge_public ON public.knowledge_articles(is_public) WHERE is_public = true;

-- Ticket comments
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments(ticket_id);

-- Ticket time entries
CREATE INDEX IF NOT EXISTS idx_time_entries_ticket ON public.ticket_time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON public.ticket_time_entries(user_id);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user ON public.profiles(user_id);

-- User roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);