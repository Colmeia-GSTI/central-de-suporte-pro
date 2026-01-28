-- =====================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- Criado em: 2025-01-27
-- Objetivo: Reduzir tempo de query em ~50-70%
-- =====================================================

-- 1. TICKETS: Status + Assigned To (usado no dashboard de técnicos)
CREATE INDEX IF NOT EXISTS idx_tickets_status_assigned 
ON tickets(status, assigned_to, created_at DESC)
WHERE status IN ('open', 'in_progress', 'waiting', 'paused', 'waiting_third_party', 'no_contact');

-- 2. TICKETS: Cliente + Data (usado em relatórios e listagens)
CREATE INDEX IF NOT EXISTS idx_tickets_client_created 
ON tickets(client_id, created_at DESC)
WHERE client_id IS NOT NULL;

-- 3. TICKETS: SLA em risco (queries críticas de dashboard)
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline 
ON tickets(sla_deadline, status)
WHERE sla_deadline IS NOT NULL 
  AND status IN ('open', 'in_progress', 'waiting');

-- 4. TICKETS: Busca por número (usado frequentemente)
CREATE INDEX IF NOT EXISTS idx_tickets_number 
ON tickets(ticket_number DESC);

-- 5. NOTIFICATIONS: Não lidas por usuário (query mais frequente)
CREATE INDEX IF NOT EXISTS idx_notifications_unread 
ON notifications(user_id, created_at DESC)
WHERE is_read = false;

-- 6. NOTIFICATIONS: Todas por usuário (dropdown de notificações)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

-- 7. MONITORING_ALERTS: Alertas ativos (dashboard de monitoramento)
CREATE INDEX IF NOT EXISTS idx_alerts_active 
ON monitoring_alerts(status, level, created_at DESC)
WHERE status = 'active';

-- 8. MONITORING_ALERTS: Por dispositivo (usado em detalhes)
CREATE INDEX IF NOT EXISTS idx_alerts_device 
ON monitoring_alerts(device_id, created_at DESC);

-- 9. MONITORED_DEVICES: Por cliente (listagens)
CREATE INDEX IF NOT EXISTS idx_devices_client 
ON monitored_devices(client_id, is_online, updated_at DESC)
WHERE client_id IS NOT NULL;

-- 10. MONITORED_DEVICES: Por fonte externa (sync de integrações)
CREATE INDEX IF NOT EXISTS idx_devices_external 
ON monitored_devices(external_source, external_id)
WHERE external_source IS NOT NULL;

-- 11. INVOICES: Vencimento + Status (relatórios financeiros)
CREATE INDEX IF NOT EXISTS idx_invoices_due_status 
ON invoices(due_date, status)
WHERE status IN ('pending', 'overdue');

-- 12. INVOICES: Por cliente (portal do cliente)
CREATE INDEX IF NOT EXISTS idx_invoices_client 
ON invoices(client_id, due_date DESC);

-- 13. CONTRACTS: Ativos por cliente (usado em faturamento)
CREATE INDEX IF NOT EXISTS idx_contracts_active 
ON contracts(client_id, status)
WHERE status = 'active';

-- 14. MESSAGE_LOGS: Por usuário e canal (relatórios de mensagens)
CREATE INDEX IF NOT EXISTS idx_message_logs_user_channel 
ON message_logs(user_id, channel, sent_at DESC)
WHERE sent_at IS NOT NULL;

-- 15. CALENDAR_EVENTS: Por usuário e data (agenda)
CREATE INDEX IF NOT EXISTS idx_calendar_user_date 
ON calendar_events(user_id, start_time)
WHERE user_id IS NOT NULL;

-- 16. TICKET_HISTORY: Por ticket (timeline de chamados)
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket 
ON ticket_history(ticket_id, created_at DESC);

-- 17. TICKET_COMMENTS: Por ticket (comentários de chamados)
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket 
ON ticket_comments(ticket_id, created_at DESC);

-- 18. USER_ROLES: Por usuário (verificação de permissões)
CREATE INDEX IF NOT EXISTS idx_user_roles_user 
ON user_roles(user_id, role);

-- 19. CLIENTS: Ativos (listagens principais)
CREATE INDEX IF NOT EXISTS idx_clients_active 
ON clients(is_active, name)
WHERE is_active = true;

-- 20. PROFILES: Por user_id (lookup de perfil)
CREATE INDEX IF NOT EXISTS idx_profiles_user 
ON profiles(user_id);

-- =====================================================
-- ANALYZE para atualizar estatísticas do planner
-- =====================================================
ANALYZE tickets;
ANALYZE notifications;
ANALYZE monitoring_alerts;
ANALYZE monitored_devices;
ANALYZE invoices;
ANALYZE contracts;
ANALYZE message_logs;
ANALYZE calendar_events;
ANALYZE ticket_history;
ANALYZE ticket_comments;
ANALYZE user_roles;
ANALYZE clients;
ANALYZE profiles;

-- =====================================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- =====================================================
COMMENT ON INDEX idx_tickets_status_assigned IS 'Otimiza queries de tickets por status e técnico atribuído';
COMMENT ON INDEX idx_tickets_client_created IS 'Otimiza listagem de tickets por cliente';
COMMENT ON INDEX idx_tickets_sla_deadline IS 'Otimiza identificação de tickets com SLA em risco';
COMMENT ON INDEX idx_notifications_unread IS 'Otimiza contagem de notificações não lidas';
COMMENT ON INDEX idx_alerts_active IS 'Otimiza dashboard de alertas ativos';
COMMENT ON INDEX idx_devices_client IS 'Otimiza listagem de dispositivos por cliente';
COMMENT ON INDEX idx_invoices_due_status IS 'Otimiza relatórios de inadimplência';
COMMENT ON INDEX idx_contracts_active IS 'Otimiza geração de faturas mensais';