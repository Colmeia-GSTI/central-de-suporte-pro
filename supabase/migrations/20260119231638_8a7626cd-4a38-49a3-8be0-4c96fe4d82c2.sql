-- Add WhatsApp fields to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS whatsapp text,
ADD COLUMN IF NOT EXISTS whatsapp_validated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_validated_at timestamp with time zone;