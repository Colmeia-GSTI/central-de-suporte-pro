-- Fix security definer views - set them to SECURITY INVOKER
ALTER VIEW public.certificates_safe SET (security_invoker = on);
ALTER VIEW public.company_settings_safe SET (security_invoker = on);