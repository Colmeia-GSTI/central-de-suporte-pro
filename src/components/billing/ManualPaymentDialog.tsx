import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { throwIfEdgeFunctionError } from "@/lib/edgeFunctionError";

interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: number;
    amount: number;
    fine_amount?: number;
    interest_amount?: number;
    contract_id?: string | null;
    client_name?: string;
  } | null;
}

const PAYMENT_METHODS = [
  { value: "deposito", label: "Depósito Bancário" },
  { value: "transferencia", label: "Transferência/TED/DOC" },
  { value: "pix_manual", label: "PIX (manual)" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao", label: "Cartão" },
  { value: "outro", label: "Outro" },
];

export function ManualPaymentDialog({ open, onOpenChange, invoice }: ManualPaymentDialogProps) {
  const queryClient = useQueryClient();
  const totalWithPenalties = (invoice?.amount ?? 0) + (invoice?.fine_amount ?? 0) + (invoice?.interest_amount ?? 0);

  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("deposito");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [emitNfse, setEmitNfse] = useState(false);

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && invoice) {
      setPaidAmount(totalWithPenalties.toFixed(2));
      setPaidDate(new Date().toISOString().split("T")[0]);
      setPaymentMethod("deposito");
      setPaymentNotes("");
      setEmitNfse(false);
    }
    onOpenChange(newOpen);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const response = await supabase.functions.invoke("manual-payment", {
        body: {
          invoice_id: invoice!.id,
          paid_amount: parseFloat(paidAmount),
          paid_date: paidDate,
          payment_method: paymentMethod,
          payment_notes: paymentNotes || undefined,
          emit_nfse: emitNfse,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      // Extrai mensagem real da edge (mesmo em HTTP non-2xx, onde o SDK descarta o body)
      throwIfEdgeFunctionError(response);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success("Pagamento registrado!", { description: data.message });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      onOpenChange(false);
    },
    onError: (error) => {
      const message = getErrorMessage(error);

      // Race condition comum: webhook do Asaas marca como paga enquanto o usuário
      // tem o dialog aberto. Quando ele clica salvar, edge bloqueia (corretamente).
      // Tratar como info (não erro) + invalidar cache + fechar dialog para refletir estado real.
      if (message.toLowerCase().includes("já está paga")) {
        toast.info("Fatura já foi paga", {
          description: "A confirmação chegou enquanto você preenchia o formulário (provavelmente via webhook). Atualizando a tela...",
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
        onOpenChange(false);
        return;
      }

      // Mesmo padrão para fatura cancelada (não é erro real, é estado mudado)
      if (message.toLowerCase().includes("cancelada")) {
        toast.info("Fatura cancelada", {
          description: "Esta fatura foi cancelada e não pode mais receber pagamento.",
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        onOpenChange(false);
        return;
      }

      toast.error("Erro ao registrar pagamento", { description: message });
    },
  });

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5" />
            Baixa Manual de Pagamento
          </DialogTitle>
          <DialogDescription>
            Fatura #{invoice.invoice_number} — {invoice.client_name || "Cliente"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice summary */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Valor original:</span>
              <span className="font-medium">R$ {invoice.amount.toFixed(2)}</span>
            </div>
            {(invoice.fine_amount ?? 0) > 0 && (
              <div className="flex justify-between text-status-danger">
                <span>Multa (2%):</span>
                <span>+ R$ {invoice.fine_amount!.toFixed(2)}</span>
              </div>
            )}
            {(invoice.interest_amount ?? 0) > 0 && (
              <div className="flex justify-between text-status-danger">
                <span>Juros:</span>
                <span>+ R$ {invoice.interest_amount!.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-1 mt-1">
              <span>Total:</span>
              <span>R$ {totalWithPenalties.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_amount">Valor Recebido (R$)</Label>
            <Input
              id="paid_amount"
              type="number"
              step="0.01"
              min="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_date">Data do Pagamento</Label>
            <Input
              id="paid_date"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Número do comprovante, referência..."
              rows={2}
            />
          </div>

          {invoice.contract_id && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="emit_nfse"
                checked={emitNfse}
                onCheckedChange={(checked) => setEmitNfse(checked === true)}
              />
              <Label htmlFor="emit_nfse" className="cursor-pointer font-normal">
                Emitir NFS-e automaticamente
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !paidAmount || parseFloat(paidAmount) <= 0}
          >
            {mutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando...</>
            ) : (
              <><HandCoins className="mr-2 h-4 w-4" />Confirmar Pagamento</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
