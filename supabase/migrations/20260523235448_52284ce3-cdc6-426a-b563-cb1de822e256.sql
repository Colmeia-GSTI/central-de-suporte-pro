CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  email text PRIMARY KEY,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'resend_webhook',
  detail text,
  suppressed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suppressed_emails IS
  'Emails que sofreram hard bounce ou reclamação de spam. send-email-resend deve pular envios para estes endereços para proteger a reputação do domínio.';

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê emails suprimidos"
  ON public.suppressed_emails FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff remove supressão manualmente"
  ON public.suppressed_emails FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insere supressão manual"
  ON public.suppressed_emails FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_suppressed_at
  ON public.suppressed_emails(suppressed_at DESC);