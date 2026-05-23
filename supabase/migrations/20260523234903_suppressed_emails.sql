-- ============================================================================
-- Lacuna 3 (base) — Tabela de emails suprimidos + suporte a idempotência Resend
-- ============================================================================
-- Alimentada pelo webhook-resend-status quando chega email.bounced (hard) ou
-- email.complained. O send-email-resend consulta antes de enviar (próxima fase).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  email text PRIMARY KEY,
  reason text NOT NULL,                -- 'bounced' | 'complained' | 'manual'
  source text NOT NULL DEFAULT 'resend_webhook',
  detail text,                         -- mensagem/bounce type do provedor
  suppressed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suppressed_emails IS
  'Emails que sofreram hard bounce ou reclamação de spam. send-email-resend deve pular envios para estes endereços para proteger a reputação do domínio.';

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

-- Apenas staff lê/gerencia; service_role (edge functions) ignora RLS
CREATE POLICY "Staff vê emails suprimidos"
  ON public.suppressed_emails FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff remove supressão manualmente"
  ON public.suppressed_emails FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insere supressão manual"
  ON public.suppressed_emails FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Índice de consulta por data (para painel)
CREATE INDEX idx_suppressed_emails_suppressed_at
  ON public.suppressed_emails(suppressed_at DESC);
