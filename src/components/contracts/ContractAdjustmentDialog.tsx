import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { TrendingUp, Calculator, AlertTriangle } from "lucide-react";

interface ContractAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    name: string;
    monthly_value: number;
    adjustment_index?: string | null;
  };
}

const INDEX_OPTIONS = [
  { value: "IGPM", label: "IGP-M (Índice Geral de Preços - Mercado)" },
  { value: "IPCA", label: "IPCA (Índice de Preços ao Consumidor Amplo)" },
  { value: "INPC", label: "INPC (Índice Nacional de Preços ao Consumidor)" },
  { value: "FIXO", label: "Percentual Fixo" },
];

export function ContractAdjustmentDialog({
  open,
  onOpenChange,
  contract,
}: ContractAdjustmentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [indexUsed, setIndexUsed] = useState(contract.adjustment_index || "IGPM");
  const [indexValue, setIndexValue] = useState<string>("");
  const [notes, setNotes] = useState("");

  const newValue = indexValue
    ? contract.monthly_value * (1 + parseFloat(indexValue) / 100)
    : contract.monthly_value;

  const mutation = useMutation({
    mutationFn: async () => {
      const parsedIndexValue = parseFloat(indexValue);
      if (isNaN(parsedIndexValue) || parsedIndexValue <= 0) {
        throw new Error("Informe um percentual válido maior que zero");
      }

      const calculatedNewValue = contract.monthly_value * (1 + parsedIndexValue / 100);

      // 1. Register adjustment in history
      const { error: adjustmentError } = await supabase
        .from("contract_adjustments")
        .insert({
          contract_id: contract.id,
          adjustment_date: new Date().toISOString().split("T")[0],
          index_used: indexUsed,
          index_value: parsedIndexValue,
          old_monthly_value: contract.monthly_value,
          new_monthly_value: calculatedNewValue,
          applied_by: user?.id,
          notes: notes || null,
        });

      if (adjustmentError) throw adjustmentError;

      // 2. Update contract value and next adjustment date (1 year from now)
      const nextAdjustmentDate = new Date();
      nextAdjustmentDate.setFullYear(nextAdjustmentDate.getFullYear() + 1);

      const { error: updateError } = await supabase
        .from("contracts")
        .update({
          monthly_value: calculatedNewValue,
          adjustment_date: nextAdjustmentDate.toISOString().split("T")[0],
          adjustment_index: indexUsed,
          adjustment_percentage: indexUsed === "FIXO" ? parsedIndexValue : null,
        })
        .eq("id", contract.id);

      if (updateError) throw updateError;

      // 3. Update contract_services proportionally
      const { data: services, error: servicesError } = await supabase
        .from("contract_services")
        .select("id, unit_value, quantity")
        .eq("contract_id", contract.id);

      if (servicesError) throw servicesError;

      if (services && services.length > 0) {
        const multiplier = 1 + parsedIndexValue / 100;
        for (const service of services) {
          const newUnitValue = (service.unit_value || 0) * multiplier;
          await supabase
            .from("contract_services")
            .update({
              unit_value: newUnitValue,
              value: newUnitValue * (service.quantity || 1),
            })
            .eq("id", service.id);
        }
      }

      // 4. Register in contract_history
      await supabase.from("contract_history").insert({
        contract_id: contract.id,
        user_id: user?.id,
        action: "adjustment",
        changes: {
          type: "adjustment",
          index: indexUsed,
          percentage: parsedIndexValue,
          old_value: contract.monthly_value,
          new_value: calculatedNewValue,
        },
        comment: `Reajuste anual de ${parsedIndexValue.toFixed(2)}% (${indexUsed})`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract-adjustments"] });
      toast({
        title: "Reajuste aplicado",
        description: `Novo valor: ${formatCurrencyBRLWithSymbol(newValue)}`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro ao aplicar reajuste",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApply = () => {
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Aplicar Reajuste Anual
          </DialogTitle>
          <DialogDescription>
            Contrato: <strong>{contract.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor atual:</span>
              <span className="font-mono font-semibold">
                {formatCurrencyBRLWithSymbol(contract.monthly_value)}
              </span>
            </div>
            {indexValue && parseFloat(indexValue) > 0 && (
              <div className="flex justify-between text-primary">
                <span>Novo valor:</span>
                <span className="font-mono font-bold">
                  {formatCurrencyBRLWithSymbol(newValue)}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Índice de Reajuste</Label>
            <Select value={indexUsed} onValueChange={setIndexUsed}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDEX_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Percentual de Reajuste (%)
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="Ex: 5.5"
              value={indexValue}
              onChange={(e) => setIndexValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {indexUsed === "FIXO"
                ? "Informe o percentual fixo acordado em contrato"
                : `Informe o valor acumulado do ${indexUsed} no período`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Notas sobre este reajuste..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex gap-2">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Atenção</p>
              <p>
                Esta ação atualizará o valor do contrato e de todos os serviços
                vinculados. O histórico será registrado para auditoria.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={mutation.isPending || !indexValue || parseFloat(indexValue) <= 0}
          >
            {mutation.isPending ? "Aplicando..." : "Aplicar Reajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
