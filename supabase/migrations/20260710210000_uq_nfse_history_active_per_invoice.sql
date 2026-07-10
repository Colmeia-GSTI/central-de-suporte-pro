-- Garantia dura contra NFS-e duplicada por fatura (bug 4b4d552, mai-jul/2026).
-- Aplicada via Lovable MCP em 2026-07-10 após remediação (cancelamento das 49
-- notas excedentes); este arquivo é o espelho versionado do schema.
-- Predicado = NFSE_BLOCKING_STATUSES (supabase/functions/asaas-nfse/logic.ts);
-- manter os dois em sincronia. Avulsas (invoice_id NULL) ficam fora; reemissão/
-- substituição só insere nova linha após a anterior sair do predicado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nfse_history_active_per_invoice
ON public.nfse_history (invoice_id)
WHERE is_active = true AND status IN ('autorizada', 'processando', 'pendente');
