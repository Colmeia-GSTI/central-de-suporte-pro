import { useMemo, useState } from "react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, Calendar, Info, Pencil, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { useContractAdjustmentHistory } from "@/hooks/useContractAdjustmentHistory";
import { ContractAdjustmentDialog } from "./ContractAdjustmentDialog";
import { ContractRenegotiationDialog } from "./ContractRenegotiationDialog";
import { ContractAdjustmentConfigSheet } from "./ContractAdjustmentConfigSheet";
import { ContractAdjustmentHistoryList } from "./ContractAdjustmentHistoryList";

interface ContractAdjustmentCardProps {
  contract: {
    id: string;
    name: string;
    monthly_value: number;
    adjustment_date?: string | null;
    adjustment_index?: string | null;
    adjustment_percentage?: number | null;
    billing_frequency?: string | null;
  };
}

const INDEX_LABEL: Record<string, string> = {
  IGPM: "IGP-M",
  IPCA: "IPCA",
  INPC: "INPC",
  FIXO: "Percentual Fixo",
};

const FREQ_LABEL: Record<string, { months: number; label: string }> = {
  monthly: { months: 1, label: "mensal" },
  bimonthly: { months: 2, label: "bimestral" },
  quarterly: { months: 3, label: "trimestral" },
  semiannual: { months: 6, label: "semestral" },
  yearly: { months: 12, label: "anual" },
};

function humanizeDays(days: number): string {
  if (days < 0) return `${Math.abs(days)} dias em atraso`;
  if (days === 0) return "hoje";
  if (days < 30) return `${days} dia${days !== 1 ? "s" : ""}`;
  const months = Math.floor(days / 30);
  const remaining = days % 30;
  if (months < 12) {
    return remaining > 0 ? `${months} ${months === 1 ? "mês" : "meses"} e ${remaining} dia${remaining !== 1 ? "s" : ""}` : `${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? `${years} ano${years !== 1 ? "s" : ""} e ${remMonths} ${remMonths === 1 ? "mês" : "meses"}` : `${years} ano${years !== 1 ? "s" : ""}`;
}

export function ContractAdjustmentCard({ contract }: ContractAdjustmentCardProps) {
  const [applyOpen, setApplyOpen] = useState(false);
  const [renegOpen, setRenegOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const { data: history = [], isLoading } = useContractAdjustmentHistory(contract.id);

  const indexCode = contract.adjustment_index || "IGPM";
  const indexLabel = INDEX_LABEL[indexCode] ?? indexCode;
  const isAutomatic = indexCode === "FIXO" && !!contract.adjustment_percentage;
  const freq = FREQ_LABEL[contract.billing_frequency ?? "monthly"] ?? FREQ_LABEL.monthly;

  const status = useMemo(() => {
    if (!contract.adjustment_date) {
      return { color: "muted", icon: AlertCircle, label: "Sem data definida", detail: "Configure a data do próximo reajuste" };
    }
    const target = new Date(contract.adjustment_date + "T12:00:00");
    const diff = differenceInDays(target, new Date());
    if (diff < 0) return { color: "danger", icon: AlertCircle, label: `Vencido há ${Math.abs(diff)} dias`, detail: humanizeDays(diff) };
    if (diff <= 30) return { color: "warning", icon: AlertCircle, label: `Próximo em ${humanizeDays(diff)}`, detail: humanizeDays(diff) };
    if (diff <= 60) return { color: "warning", icon: Calendar, label: `Em ${humanizeDays(diff)}`, detail: humanizeDays(diff) };
    return { color: "success", icon: Calendar, label: `Em ${humanizeDays(diff)}`, detail: humanizeDays(diff) };
  }, [contract.adjustment_date]);

  const lastEntry = history[0];

  const colorClass =
    status.color === "danger"
      ? "bg-status-danger/10 text-status-danger border-status-danger/30"
      : status.color === "warning"
      ? "bg-status-warning/10 text-status-warning border-status-warning/30"
      : status.color === "success"
      ? "bg-status-success/10 text-status-success border-status-success/30"
      : "bg-muted text-muted-foreground border-border";

  return (
    <TooltipProvider>
      <section className="rounded-lg border bg-card p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Reajuste Anual</h3>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Como funciona o reajuste">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
              <p className="font-medium mb-1">Como funciona:</p>
              <ul className="space-y-1 list-disc pl-3">
                <li><strong>Aplicar Reajuste:</strong> aumenta o valor pelo índice (IGPM/IPCA/INPC) e registra no histórico.</li>
                <li><strong>Renegociação:</strong> mudança de escopo (upgrade/downgrade) sem ser reajuste de índice.</li>
                <li><strong>Editar Configuração:</strong> só muda a próxima data ou o índice de referência.</li>
                <li><strong>FIXO:</strong> aplicado automaticamente pelo sistema na data marcada.</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${colorClass}`}>
          <status.icon className="h-4 w-4 shrink-0" />
          <span>
            Próximo reajuste: <strong>{status.label}</strong>
            {contract.adjustment_date && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">
                  {format(new Date(contract.adjustment_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </>
            )}
          </span>
        </div>

        {/* Index + values */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-muted-foreground mb-0.5">Índice configurado</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium underline decoration-dotted cursor-help">
                  {indexLabel}
                  {isAutomatic && ` (${Number(contract.adjustment_percentage).toFixed(2)}%)`}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[260px]">
                {isAutomatic
                  ? "Percentual fixo. O sistema aplica automaticamente na data configurada."
                  : "Reajuste manual: o financeiro precisa aplicar quando a data chegar."}
              </TooltipContent>
            </Tooltip>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Valor atual</div>
            <div className="font-mono tabular-nums font-semibold">
              {formatCurrencyBRLWithSymbol(contract.monthly_value)}
              <span className="text-muted-foreground font-normal"> / mês</span>
            </div>
            {freq.months > 1 && (
              <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
                = {formatCurrencyBRLWithSymbol(contract.monthly_value * freq.months)} por cobrança ({freq.label})
              </div>
            )}
          </div>
        </div>

        {lastEntry && (
          <div className="text-[11px] text-muted-foreground">
            Última atualização: <span className="font-mono tabular-nums">{format(new Date(lastEntry.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span> · {lastEntry.label}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" onClick={() => setApplyOpen(true)} className="gap-1.5 h-8">
            <TrendingUp className="h-3.5 w-3.5" />
            Aplicar Reajuste
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRenegOpen(true)} className="gap-1.5 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
            Registrar Renegociação
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfigOpen(true)} className="gap-1.5 h-8">
            <Pencil className="h-3.5 w-3.5" />
            Editar Configuração
          </Button>
        </div>

        <ContractAdjustmentHistoryList entries={history} isLoading={isLoading} />

        {/* Dialogs */}
        <ContractAdjustmentDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          contract={{
            id: contract.id,
            name: contract.name,
            monthly_value: contract.monthly_value,
            adjustment_index: contract.adjustment_index,
            billing_frequency: contract.billing_frequency,
          }}
        />
        <ContractRenegotiationDialog
          open={renegOpen}
          onOpenChange={setRenegOpen}
          contract={{
            id: contract.id,
            name: contract.name,
            monthly_value: contract.monthly_value,
            billing_frequency: contract.billing_frequency,
          }}
        />
        <ContractAdjustmentConfigSheet
          open={configOpen}
          onOpenChange={setConfigOpen}
          contract={{
            id: contract.id,
            adjustment_date: contract.adjustment_date ?? null,
            adjustment_index: contract.adjustment_index ?? null,
            adjustment_percentage: contract.adjustment_percentage ?? null,
          }}
        />
      </section>
    </TooltipProvider>
  );
}
