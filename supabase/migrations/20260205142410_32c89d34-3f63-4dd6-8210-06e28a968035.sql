-- Adicionar colunas faltantes na storage_config
ALTER TABLE public.storage_config 
ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS path_prefix text DEFAULT '{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf',
ADD COLUMN IF NOT EXISTS signed_url_expiry_hours integer DEFAULT 48;

-- Renomear endpoint_url para endpoint para compatibilidade com o formulário
ALTER TABLE public.storage_config RENAME COLUMN endpoint_url TO endpoint;

-- Renomear colunas de keys para compatibilidade 
ALTER TABLE public.storage_config RENAME COLUMN access_key_encrypted TO access_key;
ALTER TABLE public.storage_config RENAME COLUMN secret_key_encrypted TO secret_key;