/**
 * Componente reusável de linha de tabela para invoices.
 *
 * **Por que:** o padrão "cliente + número + datas + valor + status badge" se
 * repete em BillingInvoicesTab, BillingBoletosTab e potencialmente outras telas.
 * Em vez de duplicar markup de TableRow + TableCell, este componente encapsula
 * o esqueleto e aceita slots para customização (actions, extra columns).
 *
 * **Filosofia:** componente "pragmático", não "super-genérico". Aceita props
 * para os campos comuns + um slot `actions` para botões customizados. Quem
 * precisar de mais flexibilidade compõe sub-componentes em vez de inflar este.
 *
 * **Como usar:**
 * ```tsx
 * <Table>
 *   <TableHeader>...</TableHeader>
 *   <TableBody>
 *     {invoices.map((inv) => (
 *       <InvoiceTableRow
 *         key={inv.id}
 *         invoice={inv}
 *         onClick={() => navigate(`/invoice/${inv.id}`)}
 *         actions={<InvoiceActionsPopover invoice={inv} ... />}
 *       />
 *     ))}
 *   </TableBody>
 * </Table>
 * ```
 */

import { ReactNode } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { InvoiceStatusBadge } from "@/components/billing/StatusBadges";
import { formatDate } from "@/lib/date";
import { formatCurrencyBRL } from "@/lib/currency";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices"> & {
  clients: { name: string } | null;
};

interface InvoiceTableRowProps {
  invoice: Invoice;
  /** Slot opcional para checkbox de seleção em massa */
  selected?: boolean;
  onSelectionChange?: (id: string) => void;
  /** Slot de ações (popover, botões, etc) renderizado na última coluna */
  actions?: ReactNode;
  /** Slot opcional para coluna inline antes das ações (botões compactos) */
  inlineActions?: ReactNode;
  /** Click na linha (navegação para detalhe, etc.) */
  onClick?: () => void;
  /** Mostra coluna "Faturamento" (issued_date) — default true */
  showIssuedDate?: boolean;
  /** Mostra coluna "Dt. Pagamento" — default true */
  showPaidDate?: boolean;
}

export function InvoiceTableRow({
  invoice,
  selected,
  onSelectionChange,
  actions,
  inlineActions,
  onClick,
  showIssuedDate = true,
  showPaidDate = true,
}: InvoiceTableRowProps) {
  const issuedDate = (invoice as Invoice & { issued_date?: string | null }).issued_date;

  return (
    <TableRow
      className={`border-b hover:bg-muted/30 py-1 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {onSelectionChange && (
        <TableCell className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelectionChange(invoice.id)}
          />
        </TableCell>
      )}

      <TableCell className="py-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm">{invoice.clients?.name || "Sem cliente"}</span>
          <span className="text-xs text-muted-foreground">{invoice.invoice_number}</span>
        </div>
      </TableCell>

      {showIssuedDate && (
        <TableCell className="py-2 text-xs">
          {issuedDate ? formatDate(issuedDate) : "-"}
        </TableCell>
      )}

      <TableCell className="py-2 text-xs">
        {invoice.due_date ? formatDate(invoice.due_date) : "-"}
      </TableCell>

      <TableCell className="py-2">
        <div className="flex items-center gap-1">
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </TableCell>

      {showPaidDate && (
        <TableCell className="py-2 text-xs">
          {invoice.paid_date ? formatDate(invoice.paid_date) : "-"}
        </TableCell>
      )}

      <TableCell className="py-2 text-right text-sm font-medium">
        R$ {formatCurrencyBRL(Number(invoice.amount))}
      </TableCell>

      {inlineActions && (
        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
          {inlineActions}
        </TableCell>
      )}

      {actions && (
        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </TableCell>
      )}
    </TableRow>
  );
}
