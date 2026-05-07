-- ════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO BILLING: Banco Inter → Asaas-only
-- Data: 2026-05-07
-- Decisão: vide docs/BILLING_AUDIT.md seção PR-A.5
--
-- Coexistência: boletos Inter já emitidos (cobrança maio/2026) continuam
-- ativos até serem pagos ou vencerem. Webhook-banco-inter mantém-se
-- funcional para receber PAYMENT_CONFIRMED dos legados. Decommission
-- completo do Inter ocorre no PR-DECOM (~60-90 dias depois, quando o
-- último boleto Inter liquidar).
--
-- Reversão: ver bloco comentado no final.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- BACKUP TÁTICO: snapshot dos contratos antes da mudança
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._billing_migration_backup_inter_to_asaas (
  backup_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public._billing_migration_backup_inter_to_asaas IS
  'Snapshot de contracts antes da migração billing_provider Inter→Asaas (2026-05-07). Pode ser dropada após validação E2E em produção (~30 dias).';

-- Snapshot de TODOS os contratos active com billing_provider='banco_inter'
INSERT INTO public._billing_migration_backup_inter_to_asaas (table_name, record_id, snapshot)
SELECT 'contracts', id, to_jsonb(contracts.*)
FROM public.contracts
WHERE billing_provider = 'banco_inter'
  AND status = 'active';

-- ────────────────────────────────────────────────────────────────────
-- MUDANÇA: contracts.billing_provider 'banco_inter' → 'asaas'
-- (todos active; cancelados/expirados ficam como histórico)
-- ────────────────────────────────────────────────────────────────────

UPDATE public.contracts
SET
  billing_provider = 'asaas',
  updated_at = now()
WHERE
  billing_provider = 'banco_inter'
  AND status = 'active';

-- ────────────────────────────────────────────────────────────────────
-- LOG da operação
-- ────────────────────────────────────────────────────────────────────

INSERT INTO public.application_logs (module, level, message, context)
VALUES (
  'billing',
  'info',
  'Migração de billing_provider aplicada: Banco Inter → Asaas',
  jsonb_build_object(
    'migration', '20260507185630_migrate_billing_provider_inter_to_asaas',
    'applied_at', now(),
    'description', 'Todos os contratos active foram migrados para Asaas. Boletos Inter legados continuam ativos até liquidarem.',
    'backup_table', '_billing_migration_backup_inter_to_asaas',
    'next_steps', 'Próximas faturas geradas via cron usarão Asaas. Webhook Inter mantém-se funcional para receber PAYMENT_CONFIRMED de boletos já emitidos.'
  )
);

-- ════════════════════════════════════════════════════════════════════
-- REVERSÃO MANUAL (NÃO executar automaticamente — apenas referência)
-- Roda apenas se for preciso voltar tudo para Banco Inter:
--
-- UPDATE public.contracts c
-- SET billing_provider = (b.snapshot->>'billing_provider'),
--     updated_at = (b.snapshot->>'updated_at')::timestamptz
-- FROM public._billing_migration_backup_inter_to_asaas b
-- WHERE b.table_name = 'contracts' AND b.record_id = c.id;
--
-- E reverter as mudanças de código:
--   git revert <commit do PR-A.5>
--
-- DROP TABLE public._billing_migration_backup_inter_to_asaas;
-- ════════════════════════════════════════════════════════════════════
