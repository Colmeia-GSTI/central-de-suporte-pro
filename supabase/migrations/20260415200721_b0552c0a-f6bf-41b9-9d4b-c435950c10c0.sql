
-- Campo de mapeamento TRMM na tabela clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS trmm_client_name text;

-- Tabela de log de sincronização
CREATE TABLE public.doc_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  devices_synced int NOT NULL DEFAULT 0,
  details jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.doc_sync_log ENABLE ROW LEVEL SECURITY;

-- Staff can manage sync logs
CREATE POLICY "Staff can manage doc_sync_log" ON public.doc_sync_log
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
