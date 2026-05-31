import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { TrendingUp, Calculator, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import { useLatestEconomicIndex } from "@/hooks/useLatestEconomicIndex";
import { format, addYears } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContractAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    name: string;
    monthly_value: number;
    adjustment_index?: string | null;
    billing_frequency?: string | null;
  };
}

const INDEX_OPTIONS = [
  { value: "IGPM", label: "IGP-M (FGV)" },
  { value: "IPCA", label: "IPCA (IBGE)" },
  { value: "INPC", label: "INPC (IBGE)" },
  { value: "FIXO", label: "Percentual Fixo" },
];

const FREQ_MONTHS: Record<string, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12,
};

export function ContractAdjustmentDialog({ open, onOpenChange, contract }: ContractAdjustmentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [indexUsed, setIndexUsed] = useState(contract.adjustment_index || "IGPM");
  const [indexValue, setIndexValue] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: latestIndex, isFetching: indexLoading } = useLatestEconomicIndex(indexUsed);
  const intervalMonths = FREQ_MONTHS[contract.billing_frequency ?? "monthly"] ?? 1;
  const parsed = parseFloat(indexValue);
  const validPct = !isNaN(parsed) && parsed > 0;
  const newValue = validPct ? contract.monthly_value * (1 + parsed / 100) : contract.monthly_value;
  const diff = newValue - contract.monthly_value;
  const nextDate = addYears(new Date(effectiveDate + "T12:00:00"), 1);

  useEffect(() => {
    if (open) {
      setIndexUsed(contract.adjustment_index || "IGPM");
      setIndexValue("");
      setEffectiveDate(new Date().toISOString().split("T")[0]);
      setNotes("");
    }
  }, [open, contract.adjustment_index]);

  const applyShortcut = () => {
    if (latestIndex?.accumulated_12m) {
      setIndexValue(Number(latestIndex.accumulated_12m).toFixed(2));
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { error: adjErr } = await supabase.from("contract_adjustments").insert({
        contract_id: contract.id,
        adjustment_date: effectiveDate,
        index_used: indexUsed,
        index_value: parsed,
        old_monthly_value: contract.monthly_value,
        new_monthly_value: newValue,
        applied_by: user?.id,
        notes: notes || null,
      });
      if (adjErr) throw adjErr;

      const { error: updErr } = await supabase.from("contracts").update({
        monthly_value: newValue,
        adjustment_date: format(nextDate, "yyyy-MM-dd"),
        adjustment_index: indexUsed,
        adjustment_percentage: indexUsed === "FIXO" ? parsed : null,
      }).eq("id", contract.id);
      if (updErr) throw updErr;

      const { data: services } = await supabase
        .from("contract_services")
        .select("id, unit_value, quantity")
        .eq("contract_id", contract.id);

      if (services?.length) {
        const m = 1 + parsed / 100;
        for (const s of services) {
          const newUnit = (s.unit_value || 0) * m;
          await supabase.from("contract_services").update({
            unit_value: newUnit,
            value: newUnit * (s.quantity || 1),
          }).eq("id", s.id);
        }
      }

      await supabase.from("contract_history").insert({
        contract_id: contract.id,
        user_id: user?.id,
        action: "adjustment",
        changes: { type: "adjustment", index: indexUsed, percentage: parsed, old_value: contract.monthly_value, new_value: newValue },
        comment: `Reajuste de ${parsed.toFixed(2)}% (${indexUsed})${notes ? ` — ${notes}` : ""}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", contract.id] });
      queryClient.invalidateQueries({ queryKey: ["contract-adjustment-history", contract.id] });
      toast.success("Reajuste aplicado", {
        description: `Novo valor: ${formatCurrencyBRLWithSymbol(newValue)}`,
      });
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast.error("Erro ao aplicar reajuste", { description: err.message });
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Aplicar Reajuste
            </DialogTitle>
            <DialogDescription>Contrato: <strong>{contract.name}</strong></DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Index */}
            <div className="space-y-1.5">
              <Label>Índice de reajuste</Label>
              <Select value={indexUsed} onValueChange={setIndexUsed}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDEX_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Percentual + shortcut */}
            <div className="space-y-1.5">
              <Label htmlFor="adj-pct" className="flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" />Percentual (%)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="adj-pct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Ex: 5.50"
                  value={indexValue}
                  onChange={(e) => setIndexValue(e.target.value)}
                  className="font-mono tabular-nums"
                />
                {indexUsed !== "FIXO" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyShortcut}
                    disabled={indexLoading || !latestIndex?.accumulated_12m}
                    className="gap-1.5 shrink-0"
                    title={latestIndex?.accumulated_12m ? `Último ${indexUsed} 12m: ${Number(latestIndex.accumulated_12m).toFixed(2)}% (${format(new Date(latestIndex.reference_date), "MM/yyyy")})` : "Sem dado disponível"}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {indexLoading ? "..." : "Buscar atual"}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {indexUsed === "FIXO"
                  ? "Percentual fixo acordado no contrato."
                  : latestIndex?.accumulated_12m
                  ? `Último ${indexUsed} acumulado 12 meses: ${Number(latestIndex.accumulated_12m).toFixed(2)}%`
                  : `Informe o ${indexUsed} acumulado no período.`}
              </p>
            </div>

            {/* Preview */}
            {validPct && (
              <div className="rounded-md border bg-primary/5 p-3 space-y-1.5 text-xs animate-in fade-in-50 duration-150">
                <div className="text-[11px] font-medium text-primary uppercase tracking-wide">Pré-visualização</div>
                <div className="grid grid-cols-[100px_1fr_auto_1fr] items-center gap-2">
                  <span className="text-muted-foreground">Valor mensal</span>
                  <span className="font-mono tabular-nums">{formatCurrencyBRLWithSymbol(contract.monthly_value)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono tabular-nums font-semibold">
                    {formatCurrencyBRLWithSymbol(newValue)}
                    <span className="text-status-success ml-1">(+{formatCurrencyBRLWithSymbol(diff)})</span>
                  </span>
                </div>
                {intervalMonths > 1 && (
                  <div className="grid grid-cols-[100px_1fr_auto_1fr] items-center gap-2">
                    <span className="text-muted-foreground">Por cobrança ({intervalMonths}m)</span>
                    <span className="font-mono tabular-nums">{formatCurrencyBRLWithSymbol(contract.monthly_value * intervalMonths)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono tabular-nums font-semibold">
                      {formatCurrencyBRLWithSymbol(newValue * intervalMonths)}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-[100px_1fr] items-center gap-2 pt-1 border-t">
                  <span className="text-muted-foreground">Próx. reajuste</span>
                  <span className="font-mono tabular-nums">{format(nextDate, "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
              </div>
            )}

            {/* Vigência */}
            <div className="space-y-1.5">
              <Label htmlFor="adj-date">Data de vigência</Label>
              <Input id="adj-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Quando o novo valor passa a valer. Padrão: hoje.</p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="adj-notes">Observações (opcional)</Label>
              <Textarea id="adj-notes" placeholder="Notas sobre este reajuste..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="rounded-md border border-status-warning/40 bg-status-warning/10 p-2.5 flex gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
              <div className="text-muted-foreground">
                Atualiza o valor do contrato e de todos os serviços vinculados proporcionalmente. Registrado no histórico.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!validPct || mutation.isPending}
            >
              Aplicar Reajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar reajuste?</AlertDialogTitle>
            <AlertDialogDescription>
              O valor mensal vai de <strong className="font-mono tabular-nums">{formatCurrencyBRLWithSymbol(contract.monthly_value)}</strong> para{" "}
              <strong className="font-mono tabular-nums">{formatCurrencyBRLWithSymbol(newValue)}</strong> (+{parsed.toFixed(2)}% {indexUsed}).
              Esta ação é registrada no histórico e não pode ser desfeita automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); mutation.mutate(); }} disabled={mutation.isPending}>
              {mutation.isPending ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
