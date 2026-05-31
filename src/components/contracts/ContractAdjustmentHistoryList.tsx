import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronUp, ArrowRight, TrendingUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import type { AdjustmentHistoryEntry } from "@/hooks/useContractAdjustmentHistory";

interface ContractAdjustmentHistoryListProps {
  entries: AdjustmentHistoryEntry[];
  isLoading: boolean;
}

export function ContractAdjustmentHistoryList({ entries, isLoading }: ContractAdjustmentHistoryListProps) {
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Carregando histórico…</div>;
  }

  const count = entries.length;

  return (
    <div className="border-t pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2 -ml-2 text-xs font-medium gap-1.5"
        aria-expanded={open}
        aria-controls="adjustment-history-list"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Histórico ({count})
      </Button>

      {open && (
        <ul id="adjustment-history-list" className="mt-2 space-y-1.5 animate-in fade-in-50 duration-200">
          {count === 0 && (
            <li className="text-xs text-muted-foreground italic px-1">
              Nenhum reajuste ou renegociação registrado ainda.
            </li>
          )}
          {entries.map((e) => {
            const Icon = e.type === "adjustment" ? TrendingUp : RefreshCw;
            const sign = e.percentage >= 0 ? "+" : "";
            return (
              <li
                key={e.id}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors"
                title={e.notes ?? ""}
              >
                <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-mono text-muted-foreground tabular-nums w-16 shrink-0">
                  {format(new Date(e.date + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                </span>
                <span className="font-medium w-32 shrink-0 truncate">{e.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatCurrencyBRLWithSymbol(e.old_value)}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-mono tabular-nums font-semibold">
                  {formatCurrencyBRLWithSymbol(e.new_value)}
                </span>
                <span
                  className={`ml-auto font-mono tabular-nums text-[11px] font-medium ${
                    e.percentage >= 0 ? "text-status-success" : "text-status-danger"
                  }`}
                >
                  {sign}
                  {e.percentage.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
