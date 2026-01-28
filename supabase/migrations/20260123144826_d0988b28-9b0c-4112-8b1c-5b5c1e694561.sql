-- Add trade_name column for company fantasy name
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS trade_name TEXT;

COMMENT ON COLUMN public.clients.trade_name IS 'Nome Fantasia da empresa';