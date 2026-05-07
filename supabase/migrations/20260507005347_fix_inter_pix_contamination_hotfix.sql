-- ════════════════════════════════════════════════════════════════════
-- HOTFIX: corrigir faturas marcadas como boleto_status='erro' indevidamente
-- (boleto foi gerado OK no Inter mas PIX falhou e catch cego sobrescreveu)
-- + caso específico Capasemu (#128): mudar contrato para boleto e limpar status
--
-- Causa raiz documentada em CHANGELOG.md (Hotfix Billing 2026-05-07)
-- Reversão: ver bloco comentado no final do arquivo.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- BACKUP TÁTICO: snapshot dos registros afetados ANTES de qualquer UPDATE
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._billing_hotfix_backup_pix_contamination (
  backup_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public._billing_hotfix_backup_pix_contamination IS
  'Snapshot de invoices/contracts afetados pelo hotfix de contaminação PIX/boleto (2026-05-07). Pode ser dropada após validação E2E em produção.';

-- Snapshot das faturas que serão afetadas pela ETAPA A (boletos válidos marcados erro)
INSERT INTO public._billing_hotfix_backup_pix_contamination (table_name, record_id, snapshot)
SELECT 'invoices', id, to_jsonb(invoices.*)
FROM public.invoices
WHERE
  boleto_status = 'erro'
  AND boleto_url IS NOT NULL
  AND boleto_barcode IS NOT NULL;

-- Snapshot da fatura #128 (ETAPA B)
INSERT INTO public._billing_hotfix_backup_pix_contamination (table_name, record_id, snapshot)
SELECT 'invoices', id, to_jsonb(invoices.*)
FROM public.invoices
WHERE invoice_number = 128;

-- Snapshot do contrato Capasemu (ETAPA C)
INSERT INTO public._billing_hotfix_backup_pix_contamination (table_name, record_id, snapshot)
SELECT 'contracts', id, to_jsonb(contracts.*)
FROM public.contracts
WHERE id = (
  SELECT contract_id FROM public.invoices WHERE invoice_number = 128 LIMIT 1
);

-- ────────────────────────────────────────────────────────────────────
-- ETAPA A: autocura para faturas com boleto válido (URL + barcode) marcadas como erro
-- Status correto: 'gerado' (não 'enviado' — email ainda não foi confirmado pelo Resend)
-- ────────────────────────────────────────────────────────────────────

UPDATE public.invoices
SET
  boleto_status = 'gerado',
  boleto_error_msg = NULL,
  updated_at = now()
WHERE
  boleto_status = 'erro'
  AND boleto_url IS NOT NULL
  AND boleto_barcode IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- ETAPA B: Capasemu (fatura #128) — boleto NÃO foi gerado, limpar status
-- para permitir nova tentativa via UI (botão Regenerar)
-- ────────────────────────────────────────────────────────────────────

UPDATE public.invoices
SET
  boleto_status = NULL,
  boleto_error_msg = NULL,
  updated_at = now()
WHERE
  invoice_number = 128;

-- ────────────────────────────────────────────────────────────────────
-- ETAPA C: contrato da Capasemu — payment_preference vira 'boleto'
-- (PIX está bloqueado no Inter por escopo cob.write desabilitado;
-- decisão registrada por Jonatas em 2026-05-06)
-- ────────────────────────────────────────────────────────────────────

UPDATE public.contracts
SET
  payment_preference = 'boleto',
  updated_at = now()
WHERE
  id = (
    SELECT contract_id
    FROM public.invoices
    WHERE invoice_number = 128
    LIMIT 1
  );

-- ────────────────────────────────────────────────────────────────────
-- Log de auditoria do hotfix
-- ────────────────────────────────────────────────────────────────────

INSERT INTO public.application_logs (module, level, message, context)
VALUES (
  'billing',
  'info',
  'Hotfix aplicado: data fix de boletos contaminados por erro de PIX',
  jsonb_build_object(
    'migration', '20260507005347_fix_inter_pix_contamination_hotfix',
    'applied_at', now(),
    'description', 'Boletos com URL+barcode válidos remarcados como gerado; #128 limpo; contrato Capasemu mudado para boleto',
    'backup_table', '_billing_hotfix_backup_pix_contamination'
  )
);

-- ════════════════════════════════════════════════════════════════════
-- REVERSÃO MANUAL (NÃO executar automaticamente — apenas referência)
-- Roda apenas se algo der errado e for preciso reverter:
--
-- UPDATE public.invoices i
-- SET boleto_status = (b.snapshot->>'boleto_status'),
--     boleto_error_msg = (b.snapshot->>'boleto_error_msg'),
--     updated_at = (b.snapshot->>'updated_at')::timestamptz
-- FROM public._billing_hotfix_backup_pix_contamination b
-- WHERE b.table_name = 'invoices' AND b.record_id = i.id;
--
-- UPDATE public.contracts c
-- SET payment_preference = (b.snapshot->>'payment_preference'),
--     updated_at = (b.snapshot->>'updated_at')::timestamptz
-- FROM public._billing_hotfix_backup_pix_contamination b
-- WHERE b.table_name = 'contracts' AND b.record_id = c.id;
--
-- DROP TABLE public._billing_hotfix_backup_pix_contamination;
-- ════════════════════════════════════════════════════════════════════
