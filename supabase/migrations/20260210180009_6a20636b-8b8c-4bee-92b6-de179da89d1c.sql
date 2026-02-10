
-- Tabela de idempotência para webhooks (Banco Inter, Asaas, etc.)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_source text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice único para garantir idempotência (um evento por fonte)
CREATE UNIQUE INDEX idx_webhook_events_source_event
  ON public.webhook_events (webhook_source, event_id);

-- RLS
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role pode inserir (usado pelas Edge Functions com service_role_key)
CREATE POLICY "Service can insert webhook events"
  ON public.webhook_events FOR INSERT
  WITH CHECK (true);

-- Staff pode consultar para auditoria
CREATE POLICY "Staff can view webhook events"
  ON public.webhook_events FOR SELECT
  USING (public.is_staff(auth.uid()));
