import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";

interface ContractAdjustmentConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    adjustment_date: string | null;
    adjustment_index: string | null;
    adjustment_percentage: number | null;
  };
}

export function ContractAdjustmentConfigSheet({ open, onOpenChange, contract }: ContractAdjustmentConfigSheetProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(contract.adjustment_date ?? "");
  const [index, setIndex] = useState(contract.adjustment_index ?? "IGPM");
  const [pct, setPct] = useState<string>(contract.adjustment_percentage?.toString() ?? "");

  useEffect(() => {
    if (open) {
      setDate(contract.adjustment_date ?? "");
      setIndex(contract.adjustment_index ?? "IGPM");
      setPct(contract.adjustment_percentage?.toString() ?? "");
    }
  }, [open, contract]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (index === "FIXO" && (!pct || parseFloat(pct) <= 0)) {
        throw new Error("Para índice FIXO, informe o percentual");
      }
      const { error } = await supabase
        .from("contracts")
        .update({
          adjustment_date: date || null,
          adjustment_index: index,
          adjustment_percentage: index === "FIXO" ? parseFloat(pct) : null,
        })
        .eq("id", contract.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", contract.id] });
      toast.success("Configuração atualizada");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error("Erro ao salvar", { description: err.message }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Editar Configuração de Reajuste
          </SheetTitle>
          <SheetDescription>
            Altere a data, o índice ou o percentual fixo. Esta ação NÃO aplica o reajuste — apenas atualiza a configuração.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-6">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-date">Data do próximo reajuste</Label>
            <Input id="cfg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Geralmente 1 ano após o início ou último reajuste</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-index">Índice</Label>
            <Select value={index} onValueChange={setIndex}>
              <SelectTrigger id="cfg-index"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IGPM">IGP-M</SelectItem>
                <SelectItem value="IPCA">IPCA</SelectItem>
                <SelectItem value="INPC">INPC</SelectItem>
                <SelectItem value="FIXO">Percentual Fixo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {index === "FIXO"
                ? "Aplicado automaticamente pelo sistema na data marcada."
                : "Aplicado manualmente pelo financeiro quando a data chegar."}
            </p>
          </div>

          {index === "FIXO" && (
            <div className="space-y-1.5">
              <Label htmlFor="cfg-pct">Percentual fixo (%)</Label>
              <Input id="cfg-pct" type="number" step="0.01" min="0" placeholder="Ex: 5.00" value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
