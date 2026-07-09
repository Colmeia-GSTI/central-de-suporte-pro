import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";

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
  const [motivo, setMotivo] = useState("");
  const [reissueNfse, setReissueNfse] = useState(false);

  useEffect(() => {
    if (invoice) {
      setDueDate(invoice.due_date?.slice(0, 10) || "");
      setAmount(invoice.amount || 0);
      setMotivo("");
      setReissueNfse(false);
    }
  }, [invoice]);

  const hasBoleto = !!invoice?.asaas_payment_id;
  const today = new Date().toISOString().slice(0, 10);

  // Nota fiscal autorizada vinculada (para oferecer o reflexo do novo valor na NFS-e).
  const { data: authorizedNote } = useQuery({
    queryKey: ["edit-invoice-nfse", invoice?.id],
    enabled: open && !!invoice?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("nfse_history")
        .select("id, numero_nfse")
        .eq("invoice_id", invoice!.id)
        .eq("status", "autorizada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!invoice) return { regenerated: false };
      if (!dueDate) throw new Error("Informe a data de vencimento");
      if (amount <= 0) throw new Error("Informe um valor maior que zero");

      const unchanged = dueDate === invoice.due_date?.slice(0, 10) && amount === invoice.amount;
      if (unchanged) return { regenerated: false };

      if (motivo.trim().length < 10) {
        throw new Error("Informe o motivo do ajuste (mínimo 10 caracteres)");
      }
      // Asaas recusa boleto com vencimento no passado — evita "data inferior a hoje".
      if (hasBoleto && dueDate < today) {
        throw new Error("Fatura com boleto no Asaas não pode ter vencimento no passado. Escolha uma data a partir de hoje.");
      }

      const oldDue = invoice.due_date?.slice(0, 10) || null;
      const oldAmount = invoice.amount;

      // 1. Atualiza a fatura (RLS restringe a admin/financeiro no servidor)
      const { error: updErr } = await supabase
        .from("invoices")
        .update({ due_date: dueDate, amount, updated_at: new Date().toISOString() })
        .eq("id", invoice.id);
      if (updErr) throw updErr;

      // 2. Se há cobrança Asaas, regenera com os novos dados (propaga vencimento/valor).
      //    regenerate_payment apenas CANCELA/limpa o boleto antigo; é preciso chamar
      //    create_payment em seguida para gerar o novo com a data/valor atualizados.
      let regenerated = false;
      if (invoice.asaas_payment_id && (invoice.billing_provider ?? "asaas") === "asaas") {
        // 2a. Cancela e limpa o boleto antigo no Asaas
        const { data: regData, error: regErr } = await supabase.functions.invoke("asaas-nfse", {
          body: {
            action: "regenerate_payment",
            invoice_id: invoice.id,
            billing_type: "BOLETO",
            reason: motivo.trim(),
            old_amount: oldAmount,
            new_amount: amount,
            old_due_date: oldDue,
            new_due_date: dueDate,
          },
        });
        if (regErr) throw regErr;
        if (regData?.success === false) throw new Error(regData.error || "Falha ao cancelar o boleto antigo no Asaas");

        // 2b. Cria o novo boleto já com os dados atualizados da fatura
        const { data: createData, error: createErr } = await supabase.functions.invoke("asaas-nfse", {
          body: { action: "create_payment", invoice_id: invoice.id, billing_type: "BOLETO" },
        });
        if (createErr) throw createErr;
        if (createData?.success === false) throw new Error(createData.error || "Falha ao gerar o novo boleto no Asaas");
        regenerated = true;
      }

      // 3. Reflexo na NFS-e (opcional): se marcado, houver nota autorizada e o valor
      //    mudou, cancela a nota atual e reemite com o novo valor (janela = Asaas/prefeitura).
      let nfseResult: "reissued" | "pending" | "denied" | null = null;
      if (reissueNfse && authorizedNote && amount !== invoice.amount) {
        const { data: crData, error: crErr } = await supabase.functions.invoke("asaas-nfse", {
          body: {
            action: "cancel_and_reissue_nfse",
            invoice_id: invoice.id,
            justification: "Reemissão por ajuste de valor da fatura: " + motivo.trim(),
          },
        });
        if (crErr) throw crErr;
        if (crData?.success === false) throw new Error(crData.error || "Falha ao reemitir a NFS-e");
        nfseResult = crData?.denied ? "denied" : crData?.pending ? "pending" : "reissued";
      }
      return { regenerated, nfseResult };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      queryClient.invalidateQueries({ queryKey: ["edit-invoice-nfse"] });
      const boletoMsg = res?.regenerated ? "Boleto regenerado no Asaas com a nova data/valor." : "";
      const nfseMsg =
        res?.nfseResult === "reissued" ? "NFS-e reemitida com o novo valor."
        : res?.nfseResult === "pending" ? "NFS-e: cancelamento em andamento; a nova nota sai quando a prefeitura confirmar."
        : res?.nfseResult === "denied" ? "NFS-e mantida: a prefeitura recusou o cancelamento (fora da janela)."
        : "";
      toast.success("Fatura atualizada", {
        description: [boletoMsg, nfseMsg].filter(Boolean).join(" ") || undefined,
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
              min={hasBoleto ? today : undefined}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-invoice-amount">Valor (R$)</Label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {invoice && amount !== invoice.amount && (
              <p className="text-xs text-muted-foreground">
                De {formatCurrencyBRLWithSymbol(invoice.amount)} para {formatCurrencyBRLWithSymbol(amount)}
                {amount < invoice.amount
                  ? ` — desconto de ${formatCurrencyBRLWithSymbol(invoice.amount - amount)}`
                  : ""}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-invoice-motivo">Motivo do ajuste/desconto</Label>
            <Textarea
              id="edit-invoice-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: desconto comercial acordado; correção de valor do contrato…"
              rows={2}
            />
          </div>
          {authorizedNote && (
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="reissue-nfse"
                checked={reissueNfse}
                onCheckedChange={(v) => setReissueNfse(v === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label htmlFor="reissue-nfse" className="cursor-pointer">
                  Atualizar também a NFS-e (nº {authorizedNote.numero_nfse})
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cancela a nota atual e reemite com o novo valor. Depende da janela de
                  cancelamento da prefeitura — se recusada, a nota é mantida.
                </p>
              </div>
            </div>
          )}
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
