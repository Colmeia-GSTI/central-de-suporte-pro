/**
 * Status Badges unificados para o módulo financeiro.
 *
 * **Por que:** antes deste arquivo, mapeamentos de status (label + cor) eram
 * declarados localmente em cada componente que renderizava. Resultado: mesmo
 * `invoice_status='pending'` aparecia com cores e labels diferentes em telas
 * diferentes (BillingInvoicesTab vs DelinquencyReport vs ContractInvoiceList).
 *
 * **Como usar:**
 * ```tsx
 * import { InvoiceStatusBadge, BoletoStatusBadge } from "@/components/billing/StatusBadges";
 *
 * <InvoiceStatusBadge status={invoice.status} />
 * <BoletoStatusBadge status={invoice.boleto_status} />
 * ```
 *
 * **Para estado derivado da fatura (combinando todos os status), use a FSM:**
 * ```tsx
 * import { computeInvoiceDerivedState, getDerivedStateDisplay } from "@/lib/billing-fsm";
 * const state = computeInvoiceDerivedState(invoice);
 * const display = getDerivedStateDisplay(state);
 * ```
 */

import { Badge } from "@/components/ui/badge";
import type { Enums } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────────
// INVOICE STATUS (pending | paid | overdue | cancelled | lost | renegotiated)
// ─────────────────────────────────────────────────────────────────────

const INVOICE_STATUS_CONFIG: Record<Enums<"invoice_status">, { label: string; className: string }> = {
  pending: {
    label: "PENDENTE",
    className: "bg-status-warning/20 text-status-warning border-status-warning/40",
  },
  paid: {
    label: "PAGO",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  overdue: {
    label: "VENCIDO",
    className: "bg-destructive/20 text-destructive border-destructive/40",
  },
  cancelled: {
    label: "CANCELADO",
    className: "bg-muted text-muted-foreground border-border",
  },
  renegotiated: {
    label: "RENEGOCIADO",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  },
  lost: {
    label: "PERDIDO",
    className: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  },
};

interface InvoiceStatusBadgeProps {
  status: Enums<"invoice_status">;
  className?: string;
}

/** Badge para status principal da fatura (invoice_status enum). */
export function InvoiceStatusBadge({ status, className = "" }: InvoiceStatusBadgeProps) {
  const config = INVOICE_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs ${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CONTRACT STATUS (active | expired | cancelled | pending | suspended)
// ─────────────────────────────────────────────────────────────────────

const CONTRACT_STATUS_CONFIG: Record<Enums<"contract_status">, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-status-success text-white" },
  expired: { label: "Expirado", className: "bg-status-danger text-white" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pendente", className: "bg-status-warning text-white" },
  suspended: { label: "Suspenso", className: "bg-amber-500 text-white" },
};

interface ContractStatusBadgeProps {
  status: Enums<"contract_status">;
  className?: string;
}

/** Badge para status principal do contrato (contract_status enum). */
export function ContractStatusBadge({ status, className = "" }: ContractStatusBadgeProps) {
  const config = CONTRACT_STATUS_CONFIG[status];
  return (
    <Badge className={`${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BOLETO STATUS (pendente | gerado | enviado | erro)
// ─────────────────────────────────────────────────────────────────────

const BOLETO_STATUS_CONFIG: Record<
  Enums<"boleto_processing_status">,
  { label: string; className: string }
> = {
  pendente: {
    label: "Aguardando geração",
    className: "bg-muted text-muted-foreground border-border",
  },
  gerado: {
    label: "Gerado",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  },
  enviado: {
    label: "Enviado ao cliente",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  erro: {
    label: "Erro",
    className: "bg-destructive/20 text-destructive border-destructive/40",
  },
};

interface BoletoStatusBadgeProps {
  status: Enums<"boleto_processing_status"> | null | undefined;
  className?: string;
}

/** Badge para status do subprocesso boleto. Mostra "—" se status null. */
export function BoletoStatusBadge({ status, className = "" }: BoletoStatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={`text-xs text-muted-foreground ${className}`}>
        —
      </Badge>
    );
  }
  const config = BOLETO_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs ${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NFSE STATUS (pendente | gerada | erro)
// ─────────────────────────────────────────────────────────────────────

const NFSE_STATUS_CONFIG: Record<
  Enums<"nfse_processing_status">,
  { label: string; className: string }
> = {
  pendente: {
    label: "Aguardando emissão",
    className: "bg-muted text-muted-foreground border-border",
  },
  gerada: {
    label: "Emitida",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  erro: {
    label: "Erro",
    className: "bg-destructive/20 text-destructive border-destructive/40",
  },
};

interface NfseStatusBadgeProps {
  status: Enums<"nfse_processing_status"> | null | undefined;
  className?: string;
}

/** Badge para status do subprocesso NFS-e. */
export function NfseStatusBadge({ status, className = "" }: NfseStatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={`text-xs text-muted-foreground ${className}`}>
        —
      </Badge>
    );
  }
  const config = NFSE_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs ${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────
// EMAIL STATUS (pendente | enviado | erro)
// ─────────────────────────────────────────────────────────────────────

const EMAIL_STATUS_CONFIG: Record<
  Enums<"email_processing_status">,
  { label: string; className: string }
> = {
  pendente: {
    label: "Aguardando envio",
    className: "bg-muted text-muted-foreground border-border",
  },
  enviado: {
    label: "Enviado",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  erro: {
    label: "Erro",
    className: "bg-destructive/20 text-destructive border-destructive/40",
  },
};

interface EmailStatusBadgeProps {
  status: Enums<"email_processing_status"> | null | undefined;
  className?: string;
}

/** Badge para status do subprocesso email. */
export function EmailStatusBadge({ status, className = "" }: EmailStatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={`text-xs text-muted-foreground ${className}`}>
        —
      </Badge>
    );
  }
  const config = EMAIL_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs ${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}
