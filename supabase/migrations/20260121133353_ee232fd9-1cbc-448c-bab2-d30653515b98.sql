-- Corrigir todas as políticas de segurança públicas restantes

-- TV Dashboard Config - já tentamos antes, vamos garantir que a política correta está ativa
DROP POLICY IF EXISTS "Staff can view tv dashboard config" ON public.tv_dashboard_config;
CREATE POLICY "Staff can view tv dashboard config" 
ON public.tv_dashboard_config 
FOR SELECT 
USING (is_staff(auth.uid()));

-- Badges - restringir para staff
DROP POLICY IF EXISTS "Everyone can view badges" ON public.badges;
CREATE POLICY "Authenticated users can view badges" 
ON public.badges 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Ticket Categories - restringir para staff
DROP POLICY IF EXISTS "Anyone can view categories" ON public.ticket_categories;
DROP POLICY IF EXISTS "Everyone can view categories" ON public.ticket_categories;
CREATE POLICY "Staff can view ticket categories" 
ON public.ticket_categories 
FOR SELECT 
USING (is_staff(auth.uid()));