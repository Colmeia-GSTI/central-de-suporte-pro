
-- Tabela de auditoria para cancelamentos de NFS-e
CREATE TABLE public.nfse_cancellation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  nfse_history_id uuid REFERENCES public.nfse_history(id),
  invoice_id uuid REFERENCES public.invoices(id),
  asaas_invoice_id text,
  justification text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'CANCELLED', 'FAILED')),
  error_payload jsonb,
  request_id text
);

-- Indice unico para idempotencia: so pode existir 1 CANCELLED por nfse_history_id
CREATE UNIQUE INDEX idx_nfse_cancellation_idempotency
  ON public.nfse_cancellation_log (nfse_history_id)
  WHERE status = 'CANCELLED';

-- RLS
ALTER TABLE public.nfse_cancellation_log ENABLE ROW LEVEL SECURITY;

-- Staff pode ler
CREATE POLICY "Staff can read cancellation logs"
  ON public.nfse_cancellation_log
  FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Service role pode inserir/atualizar (Edge Functions)
CREATE POLICY "Service can insert cancellation logs"
  ON public.nfse_cancellation_log
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update cancellation logs"
  ON public.nfse_cancellation_log
  FOR UPDATE
  USING (true);
