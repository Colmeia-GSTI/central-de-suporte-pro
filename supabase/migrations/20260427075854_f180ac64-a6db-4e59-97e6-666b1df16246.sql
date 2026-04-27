-- Drop welcome email trigger and function (G12)
DROP TRIGGER IF EXISTS on_client_created_welcome_email ON public.clients;
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON public.clients;
DROP FUNCTION IF EXISTS public.trigger_send_welcome_email() CASCADE;