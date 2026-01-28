-- Add documentation field to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS documentation TEXT;

-- Create table for client technicians assignment
CREATE TABLE IF NOT EXISTS public.client_technicians (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    assigned_by UUID,
    notes TEXT,
    UNIQUE(client_id, user_id)
);

-- Enable RLS
ALTER TABLE public.client_technicians ENABLE ROW LEVEL SECURITY;

-- Create policies for client_technicians
CREATE POLICY "Staff can view client technicians" 
ON public.client_technicians 
FOR SELECT 
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Managers and admins can manage client technicians" 
ON public.client_technicians 
FOR ALL 
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR 
    public.has_role(auth.uid(), 'manager'::app_role)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_client_technicians_client_id ON public.client_technicians(client_id);
CREATE INDEX IF NOT EXISTS idx_client_technicians_user_id ON public.client_technicians(user_id);