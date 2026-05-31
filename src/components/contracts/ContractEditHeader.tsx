import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContractStatusBadge } from "@/components/billing/StatusBadges";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import type { Tables } from "@/integrations/supabase/types";

interface ContractEditHeaderProps {
  contract: Tables<"contracts"> & { clients?: { name: string } | null };
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
}

/**
 * Sticky header com identidade do contrato em edição.
 * Aplica regra do projeto: botão voltar canto sup. esquerdo (padrão iOS),
 * Orbitron para o nome, tabular-nums no valor.
 */
export function ContractEditHeader({ contract, onBack, onSave, isSaving }: ContractEditHeaderProps) {
  const clientName = contract.clients?.name ?? "Cliente";
  return (
    <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="max-w-5xl mx-auto flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar" className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-base sm:text-lg font-semibold truncate" style={{ fontFamily: "Orbitron, sans-serif" }}>
              {contract.name}
            </h1>
            <ContractStatusBadge status={contract.status} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
            <span className="truncate">{clientName}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">
              {formatCurrencyBRLWithSymbol(contract.monthly_value)}/mês
            </span>
          </div>
        </div>

        <Button onClick={onSave} disabled={isSaving} size="sm" className="gap-1.5 h-8 shrink-0">
          <Save className="h-3.5 w-3.5" />
          {isSaving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
