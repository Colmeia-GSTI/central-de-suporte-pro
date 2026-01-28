-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create table for client mapping with external systems
CREATE TABLE public.client_external_mappings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    external_source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(external_source, external_id)
);

-- Enable RLS
ALTER TABLE public.client_external_mappings ENABLE ROW LEVEL SECURITY;

-- Only staff can manage mappings
CREATE POLICY "Staff can view client mappings" 
ON public.client_external_mappings 
FOR SELECT 
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert client mappings" 
ON public.client_external_mappings 
FOR INSERT 
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update client mappings" 
ON public.client_external_mappings 
FOR UPDATE 
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete client mappings" 
ON public.client_external_mappings 
FOR DELETE 
USING (public.is_staff(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_client_external_mappings_updated_at
BEFORE UPDATE ON public.client_external_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_client_mappings_source ON public.client_external_mappings(external_source);
CREATE INDEX idx_client_mappings_client ON public.client_external_mappings(client_id);