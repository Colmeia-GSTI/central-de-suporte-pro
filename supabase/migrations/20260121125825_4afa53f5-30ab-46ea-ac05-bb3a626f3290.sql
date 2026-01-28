-- Create departments table
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  manager_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create department members table
CREATE TABLE IF NOT EXISTS public.department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_lead BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, user_id)
);

-- Add department_id to tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id);

-- Create ticket transfers table
CREATE TABLE IF NOT EXISTS public.ticket_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  transferred_by UUID NOT NULL REFERENCES auth.users(id),
  from_user_id UUID REFERENCES auth.users(id),
  to_user_id UUID REFERENCES auth.users(id),
  from_department_id UUID REFERENCES public.departments(id),
  to_department_id UUID REFERENCES public.departments(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for departments
CREATE POLICY "Staff can view departments" ON public.departments
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage departments" ON public.departments
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for department_members
CREATE POLICY "Staff can view department members" ON public.department_members
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage department members" ON public.department_members
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for ticket_transfers
CREATE POLICY "Staff can view ticket transfers" ON public.ticket_transfers
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create ticket transfers" ON public.ticket_transfers
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

-- Enable realtime for ticket_transfers
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_transfers;