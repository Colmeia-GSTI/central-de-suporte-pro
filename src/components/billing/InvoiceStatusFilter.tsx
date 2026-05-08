/**
 * Filtro de status para invoices, reusável entre tabs.
 *
 * **Por que:** o mesmo Select de status (com 8 opções: Todos/Pendente/Pago/Vencido/
 * Cancelado/Renegociado/Perdido/Com Erros) aparecia inline em BillingInvoicesTab.
 * Conforme outras tabs adotarem filtro de status, este componente garante UX
 * consistente (mesmas opções, mesmo label, mesmo botão "Limpar").
 *
 * **Como usar:**
 * ```tsx
 * import { InvoiceStatusFilter } from "@/components/billing/InvoiceStatusFilter";
 *
 * const [status, setStatus] = useState<InvoiceStatusFilter>("all");
 * <InvoiceStatusFilter value={status} onChange={setStatus} />
 * ```
 *
 * Inclui automaticamente o botão "Limpar" quando `value !== "all"`.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { InvoiceStatusFilter as StatusFilterValue } from "@/hooks/useInvoices";

interface InvoiceStatusFilterProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  /** Mostra botão "Limpar" quando value !== "all". Default: true */
  showClearButton?: boolean;
  /** Largura do select (default: w-40) */
  className?: string;
}

const STATUS_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "overdue", label: "Vencido" },
  { value: "cancelled", label: "Cancelado" },
  { value: "renegotiated", label: "Renegociado" },
  { value: "lost", label: "Perdido" },
  { value: "with_errors", label: "⚠ Com Erros" },
];

export function InvoiceStatusFilter({
  value,
  onChange,
  showClearButton = true,
  className = "w-40 h-9 text-sm",
}: InvoiceStatusFilterProps) {
  return (
    <>
      <Select value={value} onValueChange={(v) => onChange(v as StatusFilterValue)}>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showClearButton && value !== "all" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange("all")}
          className="h-9 px-2 text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" /> Limpar
        </Button>
      )}
    </>
  );
}
