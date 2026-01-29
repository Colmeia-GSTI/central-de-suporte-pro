-- ===========================================
-- SUBCATEGORIAS DE TICKETS
-- ===========================================

-- Tabela de subcategorias vinculadas às categorias
CREATE TABLE public.ticket_subcategories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sla_hours_override INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca por categoria
CREATE INDEX idx_ticket_subcategories_category ON public.ticket_subcategories(category_id);

-- RLS para subcategorias
ALTER TABLE public.ticket_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view subcategories"
  ON public.ticket_subcategories FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage subcategories"
  ON public.ticket_subcategories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ===========================================
-- TAGS DE TICKETS
-- ===========================================

-- Tabela de tags globais
CREATE TABLE public.ticket_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6b7280',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS para tags
ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tags"
  ON public.ticket_tags FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Staff can manage tags"
  ON public.ticket_tags FOR ALL
  USING (is_staff(auth.uid()));

-- ===========================================
-- VÍNCULO TICKETS <-> TAGS (N:N)
-- ===========================================

CREATE TABLE public.ticket_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.ticket_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, tag_id)
);

-- Índices para performance
CREATE INDEX idx_ticket_tag_assignments_ticket ON public.ticket_tag_assignments(ticket_id);
CREATE INDEX idx_ticket_tag_assignments_tag ON public.ticket_tag_assignments(tag_id);

-- RLS para assignments
ALTER TABLE public.ticket_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tag assignments"
  ON public.ticket_tag_assignments FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage tag assignments"
  ON public.ticket_tag_assignments FOR ALL
  USING (is_staff(auth.uid()));

-- ===========================================
-- ADICIONAR SUBCATEGORIA NA TABELA TICKETS
-- ===========================================

ALTER TABLE public.tickets 
  ADD COLUMN subcategory_id UUID REFERENCES public.ticket_subcategories(id) ON DELETE SET NULL;

-- Índice para busca por subcategoria
CREATE INDEX idx_tickets_subcategory ON public.tickets(subcategory_id);

-- ===========================================
-- TAGS PADRÃO DO SISTEMA
-- ===========================================

INSERT INTO public.ticket_tags (name, color, is_system) VALUES
  ('urgente', '#ef4444', true),
  ('recorrente', '#3b82f6', true),
  ('cliente-vip', '#eab308', true),
  ('cobrável', '#22c55e', true),
  ('fora-escopo', '#f97316', true),
  ('documentar', '#6b7280', true),
  ('aguardando-peça', '#8b5cf6', true),
  ('escalar', '#ec4899', true);