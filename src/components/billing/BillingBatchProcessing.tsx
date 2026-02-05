import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ProcessingResult {
  invoice_id: string;
  success: boolean;
  boleto_status?: "success" | "error" | "skipped";
  boleto_error?: string;
  nfse_status?: "success" | "error" | "skipped";
  nfse_error?: string;
  email_status?: "success" | "error" | "skipped";
  email_error?: string;
  processed_at: string;
}

interface BatchProcessingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInvoiceCount: number;
  onProcessingComplete?: () => void;
}

export function BillingBatchProcessing({
  open,
  onOpenChange,
  selectedInvoiceCount,
  onProcessingComplete,
}: BatchProcessingDialogProps) {
  const [generateBoleto, setGenerateBoleto] = useState(true);
  const [generatePix, setGeneratePix] = useState(false);
  const [emitNfse, setEmitNfse] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [billingProvider, setBillingProvider] = useState<"banco_inter" | "asaas">("banco_inter");

  const processingMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("Not authenticated");

      // TODO: Implementar para faturas selecionadas
      // Por enquanto, seria necessário passar os IDs das selecionadas
      const response = await supabase.functions.invoke("batch-process-invoices", {
        body: {
          invoice_ids: [], // Será preenchido pelo componente pai
          generate_boleto: generateBoleto,
          generate_pix: generatePix,
          emit_nfse: emitNfse,
          send_email: sendEmail,
          send_whatsapp: sendWhatsapp,
          billing_provider: billingProvider,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      const results = data.results as ProcessingResult[];
      const successful = results.filter((r) => r.success).length;
      const failed = results.length - successful;

      if (failed === 0) {
        toast.success(`✓ ${successful} fatura(s) processada(s) com sucesso!`);
      } else {
        toast.warning(
          `⚠ ${successful} processada(s), ${failed} com erro(s)`
        );
      }

      onProcessingComplete?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Erro ao processar faturas"
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Processar Faturas em Lote</DialogTitle>
          <DialogDescription>
            {selectedInvoiceCount} fatura(s) selecionada(s)
          </DialogDescription>
        </DialogHeader>

        {processingMutation.isPending ? (
          <div className="space-y-4">
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Processando faturas... Isso pode levar alguns minutos.
              </AlertDescription>
            </Alert>
            <Progress value={50} className="w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="boleto"
                  checked={generateBoleto}
                  onCheckedChange={(checked) =>
                    setGenerateBoleto(checked === true)
                  }
                />
                <Label htmlFor="boleto" className="cursor-pointer">
                  Gerar Boletos Bancários
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="pix"
                  checked={generatePix}
                  onCheckedChange={(checked) => setGeneratePix(checked === true)}
                />
                <Label htmlFor="pix" className="cursor-pointer">
                  Gerar Chaves PIX
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="nfse"
                  checked={emitNfse}
                  onCheckedChange={(checked) => setEmitNfse(checked === true)}
                />
                <Label htmlFor="nfse" className="cursor-pointer">
                  Emitir Notas Fiscais (NFS-e)
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="email"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                />
                <Label htmlFor="email" className="cursor-pointer">
                  Enviar por Email
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="whatsapp"
                  checked={sendWhatsapp}
                  onCheckedChange={(checked) =>
                    setSendWhatsapp(checked === true)
                  }
                />
                <Label htmlFor="whatsapp" className="cursor-pointer">
                  Enviar por WhatsApp
                </Label>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                As faturas serão processadas sequencialmente. Não feche esta
                página até terminar.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processingMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => processingMutation.mutate()}
            disabled={processingMutation.isPending || selectedInvoiceCount === 0}
          >
            {processingMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Iniciar Processamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
