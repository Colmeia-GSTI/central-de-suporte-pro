/**
 * Barra de totalizadores para listas de invoices.
 *
 * **Por que:** o trio de cards "Em Aberto / Atrasado / Pago" estava em
 * `AccountsReceivableTab` (que será removida na Fase 3.C.3). Para preparar
 * a consolidação, este componente extrai esse padrão para reuso na tab
 * "Cobranças" unificada do BillingInvoicesTab.
 *
 * **Como usar:**
 * ```tsx
 * <InvoiceTotalsBar invoices={filteredInvoices} />
 * ```
 *
 * Aceita qualquer array com campos `status` e `amount` (subset compatível
 * com `Invoice` do hook useInvoices). Calcula 3 totais via useMemo.
 */

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";

interface MinimalInvoice {
  status: string;
  amount: number | string;
}

interface InvoiceTotalsBarProps<T extends MinimalInvoice> {
  invoices: T[];
  /** Esconder o card "Pago" se não relevante no contexto (default: true) */
  showPaid?: boolean;
}

export function InvoiceTotalsBar<T extends MinimalInvoice>({
  invoices,
  showPaid = true,
}: InvoiceTotalsBarProps<T>) {
  const totals = useMemo(() => {
    let em_aberto = 0;
    let atrasado = 0;
    let pago = 0;
    for (const inv of invoices) {
      const amount = Number(inv.amount) || 0;
      if (inv.status === "pending") em_aberto += amount;
      else if (inv.status === "overdue") atrasado += amount;
      else if (inv.status === "paid") pago += amount;
    }
    return { em_aberto, atrasado, pago };
  }, [invoices]);

  return (
    <div className="flex flex-wrap gap-3">
      <Card className="flex-1 min-w-[160px]">
        <CardContent className="p-3 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-status-warning" />
          <div>
            <p className="text-xs text-muted-foreground">Em Aberto</p>
            <p className="font-semibold text-sm">{formatCurrencyBRLWithSymbol(totals.em_aberto)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 min-w-[160px]">
        <CardContent className="p-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-xs text-muted-foreground">Atrasado</p>
            <p className="font-semibold text-sm">{formatCurrencyBRLWithSymbol(totals.atrasado)}</p>
          </div>
        </CardContent>
      </Card>

      {showPaid && (
        <Card className="flex-1 min-w-[160px]">
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-status-success" />
            <div>
              <p className="text-xs text-muted-foreground">Pago</p>
              <p className="font-semibold text-sm">{formatCurrencyBRLWithSymbol(totals.pago)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
