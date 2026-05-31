import { useMemo } from "react";
import { format, addMonths, setDate, isBefore, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Receipt, Info } from "lucide-react";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NextAsaasInvoicePreviewProps {
  monthlyValue: number;
  billingFrequency?: string | null;
  billingDay?: number | null;
  daysBeforeDue?: number | null;
  paymentPreference?: string | null;
}

const FREQ_MONTHS: Record<string, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

const PREF_LABEL: Record<string, string> = {
  boleto: "Boleto",
  pix: "PIX",
  both: "Boleto + PIX",
};

/**
 * Mostra para o usuário leigo qual será a próxima cobrança gerada
 * no Asaas com o valor atual do contrato. Cálculo 100% client-side.
 */
export function NextAsaasInvoicePreview({
  monthlyValue,
  billingFrequency,
  billingDay,
  daysBeforeDue,
  paymentPreference,
}: NextAsaasInvoicePreviewProps) {
  const preview = useMemo(() => {
    const months = FREQ_MONTHS[billingFrequency ?? "monthly"] ?? 1;
    const day = Math.min(Math.max(billingDay ?? 10, 1), 28);
    const lead = Math.max(daysBeforeDue ?? 5, 1);

    const today = startOfDay(new Date());
    let due = setDate(today, day);
    if (isBefore(due, today)) {
      due = setDate(addMonths(today, 1), day);
    }
    const gen = subDays(due, lead);
    const amount = monthlyValue * months;

    return {
      months,
      amount,
      due,
      gen,
      pref: PREF_LABEL[paymentPreference ?? "boleto"] ?? "Boleto",
    };
  }, [monthlyValue, billingFrequency, billingDay, daysBeforeDue, paymentPreference]);

  return (
    <TooltipProvider>
      <div className="rounded-md border border-status-info/30 bg-status-info/5 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-status-info">
            <Receipt className="h-3.5 w-3.5" />
            Próxima cobrança no Asaas
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Como esse valor é calculado">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">
              Calculado a partir do valor mensal atual × periodicidade. O sistema gera a fatura
              automaticamente {preview.months > 1 ? `a cada ${preview.months} meses` : "todo mês"} e cria
              a cobrança no Asaas com este valor.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="text-sm font-mono tabular-nums font-semibold">
          {formatCurrencyBRLWithSymbol(preview.amount)}
          {preview.months > 1 && (
            <span className="text-[11px] text-muted-foreground font-normal ml-1">
              ({preview.months}× {formatCurrencyBRLWithSymbol(monthlyValue)})
            </span>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>
            Vence em{" "}
            <span className="font-mono tabular-nums text-foreground">
              {format(preview.due, "dd/MM/yyyy", { locale: ptBR })}
            </span>{" "}
            · {preview.pref} · Asaas
          </div>
          <div>
            Gerada automaticamente em{" "}
            <span className="font-mono tabular-nums">
              {format(preview.gen, "dd/MM/yyyy", { locale: ptBR })}
            </span>{" "}
            às 11h
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
