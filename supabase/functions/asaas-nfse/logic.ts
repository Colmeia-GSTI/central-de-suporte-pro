// Regras puras da emissão de NFS-e (testáveis sem rede/Supabase).

// Status de nfse_history que representam uma nota "viva" para a fatura.
// Mesmo predicado do índice único uq_nfse_history_active_per_invoice —
// manter os dois em sincronia.
export const NFSE_BLOCKING_STATUSES = ["autorizada", "processando", "pendente"] as const;

export interface EmitParams {
  invoice_id?: string | null;
  nfse_history_id?: string | null;
  force_new_emission?: boolean;
}

// Idempotência por fatura: uma nova emissão automática só é permitida se a
// fatura não tiver nota viva. Bypasses: nfse_history_id (reemissão/retry E0014)
// e force_new_emission (substituição pós-cancelamento).
export function shouldBlockNewEmission(p: EmitParams, existingStatus: string | null): boolean {
  if (!p.invoice_id || p.nfse_history_id || p.force_new_emission) return false;
  return existingStatus !== null &&
    (NFSE_BLOCKING_STATUSES as readonly string[]).includes(existingStatus);
}
