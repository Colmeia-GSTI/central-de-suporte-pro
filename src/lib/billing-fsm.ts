/**
 * Máquina de Estado da Fatura (FSM)
 *
 * Centraliza a lógica de "qual ação é permitida?" em UM único lugar, para que a
 * mesma fatura não apareça com botões/disabled divergentes em telas diferentes.
 *
 * **Como usar:**
 * ```ts
 * import { canMarkAsPaid } from "@/lib/billing-fsm";
 *
 * const pay = canMarkAsPaid(invoice);
 * if (pay.allowed) {
 *   // mostrar botão habilitado
 * } else {
 *   // mostrar botão desabilitado com tooltip = pay.reason
 * }
 * ```
 */

import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;

// ─────────────────────────────────────────────────────────────────────
// PERMISSÕES POR AÇÃO
// ─────────────────────────────────────────────────────────────────────

export interface ActionPermission {
  /** Se a ação pode ser executada agora */
  allowed: boolean;
  /** Motivo curto se não permitido (mostrar via tooltip) */
  reason?: string;
}

const ALLOWED: ActionPermission = { allowed: true };

/**
 * Pode marcar como paga manualmente?
 * Bloqueado se já está paga, cancelada ou renegociada.
 */
export function canMarkAsPaid(invoice: Pick<Invoice, "status">): ActionPermission {
  if (invoice.status === "paid") return { allowed: false, reason: "Fatura já está paga" };
  if (invoice.status === "cancelled" || invoice.status === "lost") return { allowed: false, reason: "Fatura cancelada não pode receber pagamento" };
  if (invoice.status === "renegotiated") return { allowed: false, reason: "Fatura renegociada — pagamento na nova fatura" };
  return ALLOWED;
}

/**
 * Pode cancelar APENAS o boleto (sem cancelar a fatura)?
 * Útil quando boleto foi gerado errado mas a fatura ainda é válida.
 */
export function canCancelBoleto(invoice: Pick<Invoice, "status" | "boleto_url">): ActionPermission {
  if (invoice.status === "paid") return { allowed: false, reason: "Não é possível cancelar boleto de fatura paga" };
  if (!invoice.boleto_url) return { allowed: false, reason: "Não há boleto gerado para cancelar" };
  return ALLOWED;
}
