-- Create table for integration settings
CREATE TABLE public.integration_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_type TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(integration_type)
);

-- Enable RLS
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- Only admins and managers can view/edit integration settings
CREATE POLICY "Staff can view integration settings" 
ON public.integration_settings 
FOR SELECT 
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert integration settings" 
ON public.integration_settings 
FOR INSERT 
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update integration settings" 
ON public.integration_settings 
FOR UPDATE 
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete integration settings" 
ON public.integration_settings 
FOR DELETE 
USING (public.is_staff(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_integration_settings_updated_at
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();