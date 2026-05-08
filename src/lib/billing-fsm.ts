/**
 * Máquina de Estado da Fatura (FSM)
 *
 * Centraliza a lógica de "qual o estado atual da fatura?" e "qual ação é permitida?"
 * em UM único lugar. Antes deste módulo, cada componente (BillingInvoicesTab,
 * BillingErrorsPanel, InvoiceActionsPopover, InvoiceProcessingHistory, etc.)
 * calculava decisões inline com regras divergentes — resultado: mesma fatura
 * aparecia com botões/disabled diferentes em telas diferentes.
 *
 * **Como usar:**
 * ```ts
 * import { computeInvoiceDerivedState, canResendNotification } from "@/lib/billing-fsm";
 *
 * const state = computeInvoiceDerivedState(invoice);
 * // → "aguardando_geracao" | "aguardando_envio" | "aguardando_pagamento" | ...
 *
 * const resend = canResendNotification(invoice);
 * if (resend.allowed) {
 *   // mostrar botão habilitado
 * } else {
 *   // mostrar botão desabilitado com tooltip = resend.reason
 * }
 * ```
 *
 * Adicionar nova ação? Adicione 1 helper aqui e use nas N telas. Não duplique a regra.
 *
 * Adicionar novo estado? Atualize `InvoiceDerivedState` + `computeInvoiceDerivedState`.
 * Os helpers existentes não precisam mudar (já cobrem todos os casos via early returns).
 */

import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;
type NfseInfo = {
  status: string;
  numero_nfse: string | null;
  pdf_url?: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// ESTADOS DERIVADOS
// ─────────────────────────────────────────────────────────────────────

export type InvoiceDerivedState =
  | "aguardando_geracao"   // boleto/PIX ainda não foi criado no provedor
  | "aguardando_envio"     // boleto criado mas ainda não enviado ao cliente (sem email)
  | "aguardando_pagamento" // tudo pronto e enviado, esperando cliente pagar
  | "pago"                 // status === 'paid'
  | "em_atraso"            // status === 'overdue'
  | "cancelada"            // status IN ('cancelled', 'lost')
  | "renegociada"          // status === 'renegotiated'
  | "com_erro";            // qualquer subprocesso (boleto/email/nfse) com 'erro'

/**
 * Calcula o estado derivado da fatura combinando todos os campos de status.
 *
 * Ordem de prioridade (early-return):
 * 1. paid → pago
 * 2. cancelled/lost → cancelada
 * 3. renegotiated → renegociada
 * 4. qualquer status='erro' → com_erro
 * 5. status='overdue' → em_atraso
 * 6. boleto não gerado → aguardando_geracao
 * 7. boleto gerado mas email não enviado → aguardando_envio
 * 8. demais → aguardando_pagamento
 */
export function computeInvoiceDerivedState(invoice: Pick<Invoice, "status" | "boleto_status" | "email_status" | "nfse_status">): InvoiceDerivedState {
  if (invoice.status === "paid") return "pago";
  if (invoice.status === "cancelled" || invoice.status === "lost") return "cancelada";
  if (invoice.status === "renegotiated") return "renegociada";

  const hasError =
    invoice.boleto_status === "erro" ||
    invoice.email_status === "erro" ||
    invoice.nfse_status === "erro";
  if (hasError) return "com_erro";

  if (invoice.status === "overdue") return "em_atraso";

  if (!invoice.boleto_status || invoice.boleto_status === "pendente") return "aguardando_geracao";
  if (invoice.boleto_status === "gerado") return "aguardando_envio";

  return "aguardando_pagamento"; // boleto_status === 'enviado'
}

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
 * Pode reenviar notificação (email/whatsapp)?
 * Bloqueado se está paga, cancelada, ou se boleto ainda não foi gerado.
 */
export function canResendNotification(invoice: Pick<Invoice, "status" | "boleto_status" | "boleto_url">): ActionPermission {
  if (invoice.status === "paid") return { allowed: false, reason: "Fatura paga não precisa de cobrança" };
  if (invoice.status === "cancelled" || invoice.status === "lost") return { allowed: false, reason: "Fatura cancelada não pode receber notificação" };
  if (!invoice.boleto_url && invoice.boleto_status !== "gerado" && invoice.boleto_status !== "enviado") {
    return { allowed: false, reason: "Boleto ainda não foi gerado — gere primeiro" };
  }
  return ALLOWED;
}

/**
 * Pode regenerar boleto?
 * Permitido se está em estado de erro OU se nunca foi gerado E não está paga/cancelada.
 */
export function canRegenerateBoleto(invoice: Pick<Invoice, "status" | "boleto_status">): ActionPermission {
  if (invoice.status === "paid") return { allowed: false, reason: "Fatura já está paga" };
  if (invoice.status === "cancelled" || invoice.status === "lost") return { allowed: false, reason: "Fatura cancelada" };
  // permite mesmo se já existe boleto (regenera substitui)
  return ALLOWED;
}

/**
 * Pode emitir NFS-e?
 * Bloqueado se já emitida com sucesso ou se fatura está cancelada.
 */
export function canEmitNfse(invoice: Pick<Invoice, "status">, nfseInfo?: NfseInfo): ActionPermission {
  if (invoice.status === "cancelled" || invoice.status === "lost") return { allowed: false, reason: "Fatura cancelada" };
  if (nfseInfo && nfseInfo.numero_nfse) return { allowed: false, reason: `NFS-e já emitida (#${nfseInfo.numero_nfse})` };
  return ALLOWED;
}

/**
 * Pode cancelar a fatura?
 * Bloqueado se já paga, cancelada ou renegociada.
 */
export function canCancelInvoice(invoice: Pick<Invoice, "status">): ActionPermission {
  if (invoice.status === "paid") return { allowed: false, reason: "Não é possível cancelar fatura paga" };
  if (invoice.status === "cancelled" || invoice.status === "lost") return { allowed: false, reason: "Fatura já cancelada" };
  if (invoice.status === "renegotiated") return { allowed: false, reason: "Fatura renegociada" };
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

/**
 * Pode forçar polling de status (consulta status no provedor)?
 * Bloqueado se fatura já está paga ou cancelada.
 */
export function canForcePolling(invoice: Pick<Invoice, "status" | "boleto_url">): ActionPermission {
  if (invoice.status === "paid") return { allowed: false, reason: "Fatura já está paga" };
  if (invoice.status === "cancelled" || invoice.status === "lost") return { allowed: false, reason: "Fatura cancelada" };
  if (!invoice.boleto_url) return { allowed: false, reason: "Não há boleto para consultar" };
  return ALLOWED;
}

// ─────────────────────────────────────────────────────────────────────
// METADADOS DE EXIBIÇÃO (label, cor, ícone-name)
// ─────────────────────────────────────────────────────────────────────

export interface DerivedStateDisplay {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  /** Cor sugerida em Tailwind class para texto/badge customizado se variant não bastar */
  toneClass?: string;
}

const STATE_DISPLAY: Record<InvoiceDerivedState, DerivedStateDisplay> = {
  aguardando_geracao: { label: "Aguardando geração", variant: "outline", toneClass: "text-muted-foreground" },
  aguardando_envio: { label: "Aguardando envio", variant: "outline", toneClass: "text-blue-600 dark:text-blue-400" },
  aguardando_pagamento: { label: "Aguardando pagamento", variant: "secondary" },
  pago: { label: "Pago", variant: "default", toneClass: "bg-emerald-600 text-white hover:bg-emerald-700" },
  em_atraso: { label: "Em atraso", variant: "destructive" },
  cancelada: { label: "Cancelada", variant: "outline", toneClass: "text-muted-foreground line-through" },
  renegociada: { label: "Renegociada", variant: "outline", toneClass: "text-amber-600 dark:text-amber-400" },
  com_erro: { label: "Com erro", variant: "destructive" },
};

export function getDerivedStateDisplay(state: InvoiceDerivedState): DerivedStateDisplay {
  return STATE_DISPLAY[state];
}
