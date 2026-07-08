import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

interface EditInvoiceInput {
  id: string;
  invoice_number: number;
  due_date: string;
  amount: number;
  status: string;
  asaas_payment_id?: string | null;
  billing_provider?: string | null;
}

interface EditInvoiceDialogProps {
  invoice: EditInvoiceInput | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edita vencimento e valor de uma fatura pendente/vencida. Se houver boleto no
 * Asaas, regenera-o (cancela o antigo e cria um novo) para PROPAGAR a nova
 * data/valor ao boleto real — a linha digitável antiga deixa de valer.
 */
export function EditInvoiceDialog({ invoice, open, onOpenChange }: EditInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (invoice) {
      setDueDate(invoice.due_date?.slice(0, 10) || "");
      setAmount(invoice.amount || 0);
    }
  }, [invoice]);

  const hasBoleto = !!invoice?.asaas_payment_id;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!invoice) return { regenerated: false };
      if (!dueDate) throw new Error("Informe a data de vencimento");
      if (amount <= 0) throw new Error("Informe um valor maior que zero");

      const unchanged = dueDate === invoice.due_date?.slice(0, 10) && amount === invoice.amount;
      if (unchanged) return { regenerated: false };

      // 1. Atualiza a fatura (RLS restringe a admin/financeiro no servidor)
      const { error: updErr } = await supabase
        .from("invoices")
        .update({ due_date: dueDate, amount, updated_at: new Date().toISOString() })
        .eq("id", invoice.id);
      if (updErr) throw updErr;

      // 2. Se há cobrança Asaas, regenera com os novos dados (propaga vencimento/valor)
      let regenerated = false;
      if (invoice.asaas_payment_id && (invoice.billing_provider ?? "asaas") === "asaas") {
        const { data, error } = await supabase.functions.invoke("asaas-nfse", {
          body: {
            action: "regenerate_payment",
            invoice_id: invoice.id,
            billing_type: "BOLETO",
            reason: "Edição de vencimento/valor da fatura",
          },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data.error || "Falha ao regenerar o boleto no Asaas");
        regenerated = true;
      }
      return { regenerated };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      toast.success("Fatura atualizada", {
        description: res?.regenerated
          ? "Boleto regenerado no Asaas com a nova data/valor."
          : undefined,
      });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error("Erro ao editar fatura", { description: getErrorMessage(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Fatura #{invoice?.invoice_number}</DialogTitle>
          <DialogDescription>
            {hasBoleto
              ? "Alterar o vencimento ou o valor cancela o boleto atual no Asaas e gera um novo com os dados atualizados."
              : "Altere o vencimento e o valor da fatura."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-invoice-due">Vencimento</Label>
            <Input
              id="edit-invoice-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-invoice-amount">Valor (R$)</Label>
            <CurrencyInput value={amount} onChange={setAmount} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
