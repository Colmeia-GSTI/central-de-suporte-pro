-- ════════════════════════════════════════════════════════════════════
-- PR-C: Cobrança bimestral/trimestral/semestral/anual
-- Data: 2026-05-07
-- Estratégia: B (cron local com lógica de pulo) — vide BILLING_AUDIT.md
--
-- Adiciona contracts.billing_frequency com 5 valores possíveis.
-- Default 'monthly' preserva comportamento atual para os 31 contratos
-- existentes. Cron generate-monthly-invoices verifica a coluna e pula
-- contratos que não têm o intervalo cumprido desde a última fatura.
--
-- Reversão: bloco SQL comentado no fim.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- BACKUP TÁTICO: snapshot dos contratos antes da mudança
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._billing_pr_c_backup_billing_frequency (
  backup_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public._billing_pr_c_backup_billing_frequency IS
  'Snapshot de contracts antes do PR-C (adição de billing_frequency, 2026-05-07). Pode ser dropada após validação E2E em produção (~30 dias).';

INSERT INTO public._billing_pr_c_backup_billing_frequency (table_name, record_id, snapshot)
SELECT 'contracts', id, to_jsonb(contracts.*)
FROM public.contracts
WHERE status = 'active';

-- ────────────────────────────────────────────────────────────────────
-- ALTERAÇÃO DO SCHEMA
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'monthly'
CHECK (billing_frequency IN ('monthly','bimonthly','quarterly','semiannual','yearly'));

COMMENT ON COLUMN public.contracts.billing_frequency IS
  'Periodicidade de cobrança: monthly (1m), bimonthly (2m), quarterly (3m), semiannual (6m), yearly (12m). Cron generate-monthly-invoices só gera fatura se passou intervalMonths desde a última invoice deste contrato.';

-- ────────────────────────────────────────────────────────────────────
-- LOG da operação
-- ────────────────────────────────────────────────────────────────────

INSERT INTO public.application_logs (module, level, message, context)
VALUES (
  'billing',
  'info',
  'PR-C aplicado: contracts.billing_frequency adicionado',
  jsonb_build_object(
    'migration', '20260507204537_add_billing_frequency_to_contracts',
    'applied_at', now(),
    'description', 'Coluna billing_frequency criada com DEFAULT monthly. Os 31 contratos existentes continuam mensais. Novos contratos podem usar bimonthly/quarterly/semiannual/yearly.',
    'backup_table', '_billing_pr_c_backup_billing_frequency',
    'next_steps', 'Cron generate-monthly-invoices passa a verificar billing_frequency e pular meses não-elegíveis automaticamente.'
  )
);

-- ════════════════════════════════════════════════════════════════════
-- REVERSÃO MANUAL (NÃO executar automaticamente — apenas referência)
--
-- ALTER TABLE public.contracts DROP COLUMN IF EXISTS billing_frequency;
-- DROP TABLE IF EXISTS public._billing_pr_c_backup_billing_frequency;
--
-- E reverter mudanças de código:
--   git revert <commit do PR-C>
-- ════════════════════════════════════════════════════════════════════
