import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, HandCoins, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

interface RenegotiateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: number;
    amount: number;
    due_date: string;
    fine_amount?: number | null;
    interest_amount?: number | null;
    client_name?: string;
  } | null;
  onSuccess?: () => void;
}

export function RenegotiateInvoiceDialog({ open, onOpenChange, invoice, onSuccess }: RenegotiateInvoiceDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [includePenalties, setIncludePenalties] = useState(true);
  const [installments, setInstallments] = useState(3);

  const preview = useMemo(() => {
    if (!invoice) return [];

    const baseAmount = Number(invoice.amount);
    const penalties = includePenalties
      ? Number(invoice.fine_amount || 0) + Number(invoice.interest_amount || 0)
      : 0;
    const totalAmount = baseAmount + penalties;
    const installmentValue = Math.floor((totalAmount / installments) * 100) / 100;
    const lastInstallmentValue = totalAmount - installmentValue * (installments - 1);

    const today = new Date();
    return Array.from({ length: installments }, (_, i) => ({
      number: i + 1,
      amount: i === installments - 1 ? lastInstallmentValue : installmentValue,
      dueDate: addMonths(today, i + 1),
    }));
  }, [invoice, includePenalties, installments]);

  const totalRenegotiated = preview.reduce((acc, p) => acc + p.amount, 0);

  const handleConfirm = async () => {
    if (!invoice) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("renegotiate-invoice", {
        body: {
          invoice_id: invoice.id,
          number_of_installments: installments,
          include_penalties: includePenalties,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Renegociação concluída!", {
        description: `${installments} parcelas criadas. Fatura #${invoice.invoice_number} cancelada.`,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro na renegociação", { description: getErrorMessage(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Renegociar Fatura
          </DialogTitle>
          <DialogDescription>
            Cancela a fatura vencida e gera novas parcelas como acordo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original invoice info */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fatura Original</span>
              <span className="font-mono font-medium">#{invoice.invoice_number}</span>
            </div>
            {invoice.client_name && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{invoice.client_name}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor Original</span>
              <span className="font-medium">{formatCurrency(invoice.amount)}</span>
            </div>
            {(invoice.fine_amount || invoice.interest_amount) ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Multa + Juros</span>
                <span className="text-status-danger">
                  {formatCurrency(Number(invoice.fine_amount || 0) + Number(invoice.interest_amount || 0))}
                </span>
              </div>
            ) : null}
          </div>

          {/* Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="include-penalties" className="cursor-pointer">
                Incluir multa e juros no acordo
              </Label>
              <Switch
                id="include-penalties"
                checked={includePenalties}
                onCheckedChange={setIncludePenalties}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installments">Número de Parcelas</Label>
              <Input
                id="installments"
                type="number"
                min={2}
                max={12}
                value={installments}
                onChange={(e) => setInstallments(Math.min(12, Math.max(2, Number(e.target.value))))}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border divide-y">
            <div className="p-3 bg-muted/50">
              <span className="text-sm font-medium">Preview das Parcelas</span>
            </div>
            {preview.map((p) => (
              <div key={p.number} className="flex items-center justify-between p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {p.number}/{installments}
                  </Badge>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(p.dueDate, "dd/MM/yyyy", { locale: ptBR })}
                  </div>
                </div>
                <span className="font-medium">{formatCurrency(p.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between p-3 font-medium bg-muted/30">
              <span>Total</span>
              <span>{formatCurrency(totalRenegotiated)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando...
              </>
            ) : (
              "Confirmar Renegociação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
