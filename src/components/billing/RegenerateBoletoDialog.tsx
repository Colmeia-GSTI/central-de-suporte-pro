import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/utils";

interface RegenerateBoletoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: number;
  billingProvider: string | null;
}

/**
 * Regenera o boleto de uma fatura: cancela o pagamento antigo no Asaas e cria
 * um novo com os dados atualizados do cliente (CNPJ, endereço, etc.).
 *
 * Caso de uso: o PDF do boleto é congelado no Asaas no momento da emissão.
 * Se o CNPJ for atualizado depois, o PDF antigo continua com o CNPJ antigo.
 * Esta ação força a regeneração completa.
 */
export function RegenerateBoletoDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  billingProvider,
}: RegenerateBoletoDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const isAsaas = (billingProvider ?? "asaas") === "asaas";

  const handleConfirm = async () => {
    if (reason.trim().length < 5) {
      toast.error("Informe um motivo (mínimo 5 caracteres)");
      return;
    }
    if (!isAsaas) {
      toast.error("Regeneração só está disponível para boletos do Asaas no momento");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Limpa o boleto antigo
      const { data: clearData, error: clearError } = await supabase.functions.invoke(
        "asaas-nfse",
        {
          body: {
            action: "regenerate_payment",
            invoice_id: invoiceId,
            billing_type: "BOLETO",
            reason: reason.trim(),
          },
        },
      );
      if (clearError || clearData?.success === false) {
        throw new Error(clearData?.error || clearError?.message || "Erro ao limpar boleto");
      }

      // 2) Gera o novo boleto com dados atualizados
      const { data: newData, error: newError } = await supabase.functions.invoke(
        "asaas-nfse",
        {
          body: {
            action: "create_payment",
            invoice_id: invoiceId,
            billing_type: "BOLETO",
          },
        },
      );
      if (newError || newData?.success === false) {
        throw new Error(newData?.error || newError?.message || "Erro ao gerar novo boleto");
      }

      toast.success(`Boleto da fatura #${invoiceNumber} regenerado com sucesso`, {
        description: "Os dados foram sincronizados com o cadastro atual.",
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      onOpenChange(false);
      setReason("");
    } catch (e: unknown) {
      toast.error("Erro ao regenerar boleto", { description: getErrorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Regerar boleto da fatura #{invoiceNumber}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Esta ação cancela o boleto atual no Asaas e gera um novo com os dados
                atualizados do cliente (CNPJ, endereço, e-mail).
              </p>
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span className="text-xs text-foreground">
                  Use quando o cadastro do cliente foi alterado e o boleto antigo
                  ainda exibe os dados anteriores. O cliente precisará usar o novo link.
                </span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="regen-reason">Motivo da regeneração *</Label>
          <Textarea
            id="regen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: CNPJ do cliente foi corrigido após emissão"
            rows={3}
            maxLength={500}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            Mínimo 5 caracteres. Esta justificativa fica registrada em auditoria.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={submitting || reason.trim().length < 5}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Regenerando…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regerar boleto
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
