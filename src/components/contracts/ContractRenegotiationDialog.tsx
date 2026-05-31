import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { RefreshCw, ArrowRight } from "lucide-react";

interface ContractRenegotiationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    name: string;
    monthly_value: number;
    billing_frequency?: string | null;
  };
}

const FREQ_MONTHS: Record<string, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12,
};

export function ContractRenegotiationDialog({ open, onOpenChange, contract }: ContractRenegotiationDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newValue, setNewValue] = useState<number>(contract.monthly_value);
  const [comment, setComment] = useState("");

  const intervalMonths = FREQ_MONTHS[contract.billing_frequency ?? "monthly"] ?? 1;
  const diff = newValue - contract.monthly_value;
  const pct = contract.monthly_value > 0 ? (diff / contract.monthly_value) * 100 : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!newValue || newValue <= 0) throw new Error("Informe um valor mensal válido");
      if (newValue === contract.monthly_value) throw new Error("O novo valor deve ser diferente do atual");
      if (!comment.trim()) throw new Error("Descreva o motivo da renegociação");

      const { error: updErr } = await supabase
        .from("contracts").update({ monthly_value: newValue }).eq("id", contract.id);
      if (updErr) throw updErr;

      const { error: histErr } = await supabase.from("contract_history").insert({
        contract_id: contract.id,
        user_id: user?.id,
        action: "renegotiation",
        changes: { type: "renegotiation", old_value: contract.monthly_value, new_value: newValue },
        comment: comment.trim(),
      });
      if (histErr) throw histErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", contract.id] });
      queryClient.invalidateQueries({ queryKey: ["contract-adjustment-history", contract.id] });
      toast.success("Renegociação registrada", {
        description: `${formatCurrencyBRLWithSymbol(contract.monthly_value)} → ${formatCurrencyBRLWithSymbol(newValue)}`,
      });
      setComment("");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error("Erro ao registrar", { description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Registrar Renegociação
          </DialogTitle>
          <DialogDescription>
            Mudança de escopo do contrato <strong>{contract.name}</strong>. Use para upgrade/downgrade — não é reajuste por índice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">Valor atual</div>
              <div className="font-mono tabular-nums font-semibold">{formatCurrencyBRLWithSymbol(contract.monthly_value)}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-[11px] text-muted-foreground">Novo valor</div>
              <div className="font-mono tabular-nums font-semibold text-primary">{formatCurrencyBRLWithSymbol(newValue || 0)}</div>
              {diff !== 0 && (
                <div className={`text-[11px] font-mono tabular-nums ${diff > 0 ? "text-status-success" : "text-status-danger"}`}>
                  {diff > 0 ? "+" : ""}{formatCurrencyBRLWithSymbol(diff)} ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)
                </div>
              )}
            </div>
          </div>

          {intervalMonths > 1 && newValue > 0 && (
            <p className="text-xs text-muted-foreground">
              Por cobrança ({intervalMonths} meses): <strong className="font-mono tabular-nums">{formatCurrencyBRLWithSymbol(newValue * intervalMonths)}</strong>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reneg-value">Novo valor mensal *</Label>
            <CurrencyInput id="reneg-value" value={newValue} onChange={setNewValue} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reneg-comment">Motivo da renegociação *</Label>
            <Textarea
              id="reneg-comment"
              placeholder="Ex: Cliente solicitou upgrade para incluir backup 50GB."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              Esta ação NÃO altera a data do próximo reajuste anual nem o histórico de reajustes por índice.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !comment.trim() || newValue <= 0 || newValue === contract.monthly_value}
          >
            {mutation.isPending ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
