-- =============================================
-- CENTRAL DE HELPDESK - ESTRUTURA COMPLETA
-- =============================================

-- 1. ENUMS
-- =============================================

-- Papéis do sistema
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'technician', 'financial', 'client', 'client_master');

-- Status de tickets
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');

-- Prioridade de tickets
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Origem do ticket
CREATE TYPE public.ticket_origin AS ENUM ('portal', 'phone', 'email', 'chat', 'whatsapp');

-- Modelo de suporte
CREATE TYPE public.support_model AS ENUM ('ticket', 'hours_bank', 'unlimited');

-- Status de contrato
CREATE TYPE public.contract_status AS ENUM ('active', 'expired', 'cancelled', 'pending');

-- Tipo de ativo
CREATE TYPE public.asset_type AS ENUM ('computer', 'notebook', 'server', 'printer', 'switch', 'router', 'software', 'license', 'other');

-- Status de ativo
CREATE TYPE public.asset_status AS ENUM ('active', 'maintenance', 'disposed', 'loaned');

-- Tipo de evento de agenda
CREATE TYPE public.event_type AS ENUM ('visit', 'meeting', 'on_call', 'unavailable', 'personal');

-- Nível de alerta de monitoramento
CREATE TYPE public.alert_level AS ENUM ('critical', 'warning', 'info');

-- Status de alerta
CREATE TYPE public.alert_status AS ENUM ('active', 'acknowledged', 'resolved');

-- Status de fatura
CREATE TYPE public.invoice_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');

-- Nível de técnico (gamificação)
CREATE TYPE public.technician_level AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');

-- 2. TABELAS PRINCIPAIS
-- =============================================

-- Perfis de usuário
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Papéis de usuário (tabela separada para segurança)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'technician',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Clientes
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    document TEXT, -- CNPJ/CPF
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contatos de cliente
CREATE TABLE public.client_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT, -- Cargo/Função
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contratos
CREATE TABLE public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    support_model support_model NOT NULL DEFAULT 'unlimited',
    hours_included INTEGER, -- Para banco de horas
    monthly_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE, -- Null = indefinido
    status contract_status NOT NULL DEFAULT 'active',
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    adjustment_index TEXT DEFAULT 'IGPM', -- IGPM, IPCA, fixo
    adjustment_date DATE, -- Data de reajuste anual
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serviços do contrato
CREATE TABLE public.contract_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    value DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias de ticket
CREATE TABLE public.ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    sla_hours INTEGER DEFAULT 24, -- SLA padrão em horas
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets
CREATE TABLE public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number SERIAL,
    title TEXT NOT NULL,
    description TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
    asset_id UUID, -- Referência para ativos (adicionada depois)
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status ticket_status NOT NULL DEFAULT 'open',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    origin ticket_origin NOT NULL DEFAULT 'portal',
    sla_deadline TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    satisfaction_rating INTEGER, -- 1-5
    satisfaction_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentários de ticket
CREATE TABLE public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT false, -- Comentário interno (só equipe)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de status do ticket
CREATE TABLE public.ticket_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    old_status ticket_status,
    new_status ticket_status,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurações de SLA
CREATE TABLE public.sla_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
    priority ticket_priority NOT NULL,
    response_hours INTEGER NOT NULL DEFAULT 4,
    resolution_hours INTEGER NOT NULL DEFAULT 24,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INVENTÁRIO DE ATIVOS
-- =============================================

-- Ativos
CREATE TABLE public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    asset_type asset_type NOT NULL,
    brand TEXT,
    model TEXT,
    serial_number TEXT,
    purchase_date DATE,
    purchase_value DECIMAL(10,2),
    status asset_status NOT NULL DEFAULT 'active',
    location TEXT, -- Matriz, filial, sala, etc.
    responsible_contact UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adicionar FK no ticket para asset
ALTER TABLE public.tickets ADD CONSTRAINT tickets_asset_id_fkey 
    FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;

-- Licenças de software
CREATE TABLE public.software_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    vendor TEXT,
    license_key TEXT,
    total_licenses INTEGER NOT NULL DEFAULT 1,
    used_licenses INTEGER NOT NULL DEFAULT 0,
    purchase_date DATE,
    expire_date DATE,
    purchase_value DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vinculação licença-ativo
CREATE TABLE public.license_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES public.software_licenses(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (license_id, asset_id)
);

-- Garantias
CREATE TABLE public.warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    terms TEXT,
    contact_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manutenções
CREATE TABLE public.maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- preventiva, corretiva
    description TEXT,
    cost DECIMAL(10,2) DEFAULT 0,
    downtime_hours DECIMAL(5,2) DEFAULT 0,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. GAMIFICAÇÃO
-- =============================================

-- Pontuação de técnicos
CREATE TABLE public.technician_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL, -- ticket_resolved, sla_met, satisfaction_bonus, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Badges/Conquistas
CREATE TABLE public.badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT, -- Nome do ícone ou URL
    criteria TEXT, -- JSON com critérios
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Badges conquistados por técnicos
CREATE TABLE public.technician_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    badge_id UUID REFERENCES public.badges(id) ON DELETE CASCADE NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, badge_id)
);

-- Metas de gamificação
CREATE TABLE public.gamification_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    target_value INTEGER NOT NULL,
    period TEXT NOT NULL, -- daily, weekly, monthly
    points_reward INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AGENDA E ESCALAS
-- =============================================

-- Eventos de agenda
CREATE TABLE public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_type event_type NOT NULL DEFAULT 'visit',
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    location TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT false,
    google_event_id TEXT, -- ID do evento no Google Calendar
    google_calendar_id TEXT,
    color TEXT,
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integrações do Google Calendar por usuário
CREATE TABLE public.google_calendar_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    calendar_id TEXT,
    sync_enabled BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. MONITORAMENTO
-- =============================================

-- Dispositivos monitorados
CREATE TABLE public.monitored_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    hostname TEXT,
    ip_address TEXT,
    device_type TEXT, -- server, workstation, network, service
    external_id TEXT, -- ID no sistema externo (Tactical RMM, etc.)
    external_source TEXT, -- tactical_rmm, uptime_kuma
    is_online BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    uptime_percent DECIMAL(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alertas de monitoramento
CREATE TABLE public.monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES public.monitored_devices(id) ON DELETE CASCADE NOT NULL,
    level alert_level NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    status alert_status NOT NULL DEFAULT 'active',
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. FINANCEIRO
-- =============================================

-- Faturas
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number SERIAL,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_date DATE,
    status invoice_status NOT NULL DEFAULT 'pending',
    payment_method TEXT, -- boleto, pix, transferencia
    boleto_url TEXT,
    boleto_barcode TEXT,
    pix_code TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens da fatura
CREATE TABLE public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_value DECIMAL(10,2) NOT NULL,
    total_value DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Centros de custo
CREATE TABLE public.cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lançamentos financeiros
CREATE TABLE public.financial_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- income, expense
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
    category TEXT,
    is_reconciled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. BASE DE CONHECIMENTO
-- =============================================

CREATE TABLE public.knowledge_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE, -- NULL = artigo geral
    is_public BOOLEAN NOT NULL DEFAULT false, -- Visível para clientes
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. CONFIGURAÇÕES DO DASHBOARD TV
-- =============================================

CREATE TABLE public.tv_dashboard_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Dashboard Principal',
    access_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    rotation_interval INTEGER NOT NULL DEFAULT 15, -- segundos
    show_ranking BOOLEAN NOT NULL DEFAULT true,
    show_monitoring BOOLEAN NOT NULL DEFAULT true,
    show_tickets BOOLEAN NOT NULL DEFAULT true,
    show_metrics BOOLEAN NOT NULL DEFAULT true,
    theme TEXT NOT NULL DEFAULT 'dark',
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. LOGS DE AUDITORIA
-- =============================================

CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- FUNÇÕES AUXILIARES
-- =============================================

-- Função para verificar papel do usuário
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Função para verificar se usuário tem algum papel de staff
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role IN ('admin', 'manager', 'technician', 'financial')
    )
$$;

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_software_licenses_updated_at BEFORE UPDATE ON public.software_licenses 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_monitored_devices_updated_at BEFORE UPDATE ON public.monitored_devices 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_knowledge_articles_updated_at BEFORE UPDATE ON public.knowledge_articles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tv_dashboard_config_updated_at BEFORE UPDATE ON public.tv_dashboard_config 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_google_calendar_integrations_updated_at BEFORE UPDATE ON public.google_calendar_integrations 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
    
    -- Por padrão, novos usuários são técnicos
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'technician');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para criar perfil em novo usuário
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.software_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitored_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_dashboard_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: Usuário vê o próprio, staff vê todos
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- USER_ROLES: Apenas admins gerenciam
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- CLIENTS: Staff pode ver e gerenciar
CREATE POLICY "Staff can view clients" ON public.clients FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage clients" ON public.clients FOR ALL USING (public.is_staff(auth.uid()));

-- CLIENT_CONTACTS: Staff pode gerenciar
CREATE POLICY "Staff can view contacts" ON public.client_contacts FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage contacts" ON public.client_contacts FOR ALL USING (public.is_staff(auth.uid()));

-- CONTRACTS: Staff pode ver, admin/manager podem gerenciar
CREATE POLICY "Staff can view contracts" ON public.contracts FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can manage contracts" ON public.contracts FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- CONTRACT_SERVICES
CREATE POLICY "Staff can view services" ON public.contract_services FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can manage services" ON public.contract_services FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- TICKET_CATEGORIES
CREATE POLICY "Everyone can view categories" ON public.ticket_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.ticket_categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- TICKETS: Staff pode ver todos, criador pode ver os seus
CREATE POLICY "Staff can view all tickets" ON public.tickets FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Users can view own tickets" ON public.tickets FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Staff can manage tickets" ON public.tickets FOR ALL USING (public.is_staff(auth.uid()));
CREATE POLICY "Users can create tickets" ON public.tickets FOR INSERT WITH CHECK (auth.uid() = created_by);

-- TICKET_COMMENTS
CREATE POLICY "Staff can view all comments" ON public.ticket_comments FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Users can view non-internal comments" ON public.ticket_comments FOR SELECT 
    USING (NOT is_internal AND EXISTS (SELECT 1 FROM public.tickets WHERE id = ticket_id AND created_by = auth.uid()));
CREATE POLICY "Staff can manage comments" ON public.ticket_comments FOR ALL USING (public.is_staff(auth.uid()));
CREATE POLICY "Users can add comments" ON public.ticket_comments FOR INSERT 
    WITH CHECK (NOT is_internal AND EXISTS (SELECT 1 FROM public.tickets WHERE id = ticket_id AND created_by = auth.uid()));

-- TICKET_HISTORY
CREATE POLICY "Staff can view history" ON public.ticket_history FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can add history" ON public.ticket_history FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- SLA_CONFIGS
CREATE POLICY "Staff can view SLA" ON public.sla_configs FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can manage SLA" ON public.sla_configs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ASSETS
CREATE POLICY "Staff can view assets" ON public.assets FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage assets" ON public.assets FOR ALL USING (public.is_staff(auth.uid()));

-- SOFTWARE_LICENSES
CREATE POLICY "Staff can view licenses" ON public.software_licenses FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage licenses" ON public.software_licenses FOR ALL USING (public.is_staff(auth.uid()));

-- LICENSE_ASSETS
CREATE POLICY "Staff can view license_assets" ON public.license_assets FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage license_assets" ON public.license_assets FOR ALL USING (public.is_staff(auth.uid()));

-- WARRANTIES
CREATE POLICY "Staff can view warranties" ON public.warranties FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage warranties" ON public.warranties FOR ALL USING (public.is_staff(auth.uid()));

-- MAINTENANCES
CREATE POLICY "Staff can view maintenances" ON public.maintenances FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage maintenances" ON public.maintenances FOR ALL USING (public.is_staff(auth.uid()));

-- TECHNICIAN_POINTS
CREATE POLICY "Staff can view points" ON public.technician_points FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "System can add points" ON public.technician_points FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- BADGES
CREATE POLICY "Everyone can view badges" ON public.badges FOR SELECT USING (true);
CREATE POLICY "Admins can manage badges" ON public.badges FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- TECHNICIAN_BADGES
CREATE POLICY "Staff can view earned badges" ON public.technician_badges FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "System can award badges" ON public.technician_badges FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- GAMIFICATION_GOALS
CREATE POLICY "Staff can view goals" ON public.gamification_goals FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can manage goals" ON public.gamification_goals FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- CALENDAR_EVENTS
CREATE POLICY "Users can view own events" ON public.calendar_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Managers can view all events" ON public.calendar_events FOR SELECT 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Users can manage own events" ON public.calendar_events FOR ALL USING (auth.uid() = user_id);

-- GOOGLE_CALENDAR_INTEGRATIONS
CREATE POLICY "Users can manage own integration" ON public.google_calendar_integrations FOR ALL USING (auth.uid() = user_id);

-- MONITORED_DEVICES
CREATE POLICY "Staff can view devices" ON public.monitored_devices FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage devices" ON public.monitored_devices FOR ALL USING (public.is_staff(auth.uid()));

-- MONITORING_ALERTS
CREATE POLICY "Staff can view alerts" ON public.monitoring_alerts FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage alerts" ON public.monitoring_alerts FOR ALL USING (public.is_staff(auth.uid()));

-- INVOICES
CREATE POLICY "Financial can view invoices" ON public.invoices FOR SELECT 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'financial'));
CREATE POLICY "Financial can manage invoices" ON public.invoices FOR ALL 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financial'));

-- INVOICE_ITEMS
CREATE POLICY "Financial can view items" ON public.invoice_items FOR SELECT 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financial'));
CREATE POLICY "Financial can manage items" ON public.invoice_items FOR ALL 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financial'));

-- COST_CENTERS
CREATE POLICY "Financial can view centers" ON public.cost_centers FOR SELECT 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financial'));
CREATE POLICY "Admins can manage centers" ON public.cost_centers FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- FINANCIAL_ENTRIES
CREATE POLICY "Financial can view entries" ON public.financial_entries FOR SELECT 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financial'));
CREATE POLICY "Financial can manage entries" ON public.financial_entries FOR ALL 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financial'));

-- KNOWLEDGE_ARTICLES
CREATE POLICY "Staff can view all articles" ON public.knowledge_articles FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Public articles visible to all" ON public.knowledge_articles FOR SELECT USING (is_public = true);
CREATE POLICY "Staff can manage articles" ON public.knowledge_articles FOR ALL USING (public.is_staff(auth.uid()));

-- TV_DASHBOARD_CONFIG
CREATE POLICY "Anyone can view TV config by token" ON public.tv_dashboard_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage TV config" ON public.tv_dashboard_config FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- AUDIT_LOGS
CREATE POLICY "Admins can view logs" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- =============================================
-- DADOS INICIAIS
-- =============================================

-- Badges padrão
INSERT INTO public.badges (name, description, icon) VALUES
('Velocista', 'Resolver 10 tickets em um único dia', 'zap'),
('Guardião do SLA', 'Manter 100% de SLA por uma semana', 'shield'),
('5 Estrelas', 'Receber 10 avaliações 5 estrelas consecutivas', 'star'),
('Maratonista', 'Resolver 100 tickets em um mês', 'trophy'),
('Especialista', 'Resolver 50 tickets de uma mesma categoria', 'award'),
('Mentor', 'Criar 10 artigos na base de conhecimento', 'book-open');

-- Metas de gamificação padrão
INSERT INTO public.gamification_goals (name, description, target_value, period, points_reward) VALUES
('Tickets Diários', 'Resolver 5 tickets hoje', 5, 'daily', 50),
('SLA Perfeito', 'Resolver todos tickets dentro do SLA esta semana', 100, 'weekly', 200),
('Meta Mensal', 'Resolver 50 tickets este mês', 50, 'monthly', 500);

-- Categorias de ticket padrão
INSERT INTO public.ticket_categories (name, description, sla_hours) VALUES
('Suporte Técnico', 'Problemas técnicos gerais', 24),
('Instalação', 'Instalação de software e hardware', 48),
('Manutenção', 'Manutenção preventiva e corretiva', 72),
('Rede', 'Problemas de conectividade e rede', 8),
('Segurança', 'Incidentes de segurança', 4),
('Outros', 'Outras solicitações', 24);

-- Configuração padrão do Dashboard TV
INSERT INTO public.tv_dashboard_config (name) VALUES ('Dashboard Principal');

-- Centros de custo padrão
INSERT INTO public.cost_centers (name, description) VALUES
('Operacional', 'Custos operacionais gerais'),
('Infraestrutura', 'Custos de infraestrutura'),
('Pessoal', 'Custos com pessoal'),
('Marketing', 'Custos de marketing');
