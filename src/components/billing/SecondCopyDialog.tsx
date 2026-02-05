import { useState } from "react";
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
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

interface SecondCopyDialogProps {
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

export function SecondCopyDialog({ open, onOpenChange, invoice, onSuccess }: SecondCopyDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [penalties, setPenalties] = useState<{ fine: number; interest: number; total: number } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const calculatePenalties = async () => {
    if (!invoice) return;
    setIsCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-invoice-penalties", {
        body: { invoice_id: invoice.id },
      });
      if (error) throw error;
      setPenalties({
        fine: data.fine_amount || 0,
        interest: data.interest_amount || 0,
        total: data.total_with_penalties || invoice.amount,
      });
    } catch (err) {
      toast.error("Erro ao calcular multa/juros", { description: getErrorMessage(err) });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && invoice) {
      calculatePenalties();
    } else {
      setPenalties(null);
    }
    onOpenChange(isOpen);
  };

  const handleGenerate = async () => {
    if (!invoice) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-second-copy", {
        body: { invoice_id: invoice.id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Segunda via gerada!", {
        description: `Boleto atualizado para fatura #${invoice.invoice_number}`,
      });

      if (data.boleto_url) {
        window.open(data.boleto_url, "_blank");
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao gerar segunda via", { description: getErrorMessage(err) });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning" />
            Segunda Via de Boleto
          </DialogTitle>
          <DialogDescription>
            Gerar novo boleto com valor atualizado incluindo multa e juros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fatura</span>
              <span className="font-mono font-medium">#{invoice.invoice_number}</span>
            </div>
            {invoice.client_name && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{invoice.client_name}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vencimento Original</span>
              <span>{format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor Original</span>
              <span className="font-medium">{formatCurrency(invoice.amount)}</span>
            </div>

            {isCalculating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculando multa e juros...
              </div>
            ) : penalties ? (
              <>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Multa (2%)</span>
                    <span className="text-status-danger">+ {formatCurrency(penalties.fine)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Juros (1% a.m.)</span>
                    <span className="text-status-danger">+ {formatCurrency(penalties.interest)}</span>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="font-medium">Total Atualizado</span>
                    <Badge variant="outline" className="text-base font-bold px-3 py-1">
                      {formatCurrency(penalties.total)}
                    </Badge>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || isCalculating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Gerando...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                Gerar Segunda Via
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
