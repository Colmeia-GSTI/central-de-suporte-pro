import { useState, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertCircle, CheckCircle2, Building2 } from "lucide-react";
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
  selectedInvoiceIds: string[];
  selectedInvoiceCount: number;
  onProcessingComplete?: () => void;
}

export function BillingBatchProcessing({
  open,
  onOpenChange,
  selectedInvoiceIds,
  selectedInvoiceCount,
  onProcessingComplete,
}: BatchProcessingDialogProps) {
  const [generateBoleto, setGenerateBoleto] = useState(true);
  const [generatePix, setGeneratePix] = useState(false);
  const [emitNfse, setEmitNfse] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [billingProvider, setBillingProvider] = useState<"banco_inter" | "asaas">("banco_inter");
  const [progress, setProgress] = useState(0);
  const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setProgress(0);
      setCurrentProcessing(null);
      setProcessingResults([]);
    }
  }, [open]);

  const processingMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("Not authenticated");

      if (selectedInvoiceIds.length === 0) {
        throw new Error("Nenhuma fatura selecionada");
      }

      // Start progress tracking
      setProgress(5);
      setCurrentProcessing("Iniciando processamento...");

      const response = await supabase.functions.invoke("batch-process-invoices", {
        body: {
          invoice_ids: selectedInvoiceIds,
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
      setProcessingResults(results);
      setProgress(100);
      setCurrentProcessing(null);

      const successful = results.filter((r) => r.success).length;
      const failed = results.length - successful;

      if (failed === 0) {
        toast.success(`✓ ${successful} fatura(s) processada(s) com sucesso!`);
      } else {
        toast.warning(
          `⚠ ${successful} processada(s), ${failed} com erro(s)`
        );
      }

      // Small delay before closing to show completion
      setTimeout(() => {
        onProcessingComplete?.();
        onOpenChange(false);
      }, 1500);
    },
    onError: (error) => {
      setProgress(0);
      setCurrentProcessing(null);
      toast.error(
        error instanceof Error ? error.message : "Erro ao processar faturas"
      );
    },
  });

  // Calculate dynamic progress based on mutation state
  useEffect(() => {
    if (processingMutation.isPending && progress < 90) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const increment = Math.random() * 5 + 2;
          return Math.min(prev + increment, 90);
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [processingMutation.isPending, progress]);

  const hasAnyOption = generateBoleto || generatePix || emitNfse || sendEmail || sendWhatsapp;

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
                {currentProcessing || "Processando faturas... Isso pode levar alguns minutos."}
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-xs text-muted-foreground text-center">
                {Math.round(progress)}% concluído
              </p>
            </div>
          </div>
        ) : processingResults.length > 0 ? (
          <div className="space-y-4">
            <Alert className="bg-status-success/10 border-status-success/30">
              <CheckCircle2 className="h-4 w-4 text-status-success" />
              <AlertDescription className="text-status-success">
                Processamento concluído!
              </AlertDescription>
            </Alert>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {processingResults.map((result) => (
                <div
                  key={result.invoice_id}
                  className={`text-xs p-2 rounded ${
                    result.success 
                      ? "bg-status-success/10 border border-status-success/30" 
                      : "bg-status-danger/10 border border-status-danger/30"
                  }`}
                >
                  <span className={result.success ? "text-status-success" : "text-status-danger"}>
                    {result.success ? "✓" : "✗"} Fatura processada
                  </span>
                  {result.boleto_error && (
                    <p className="text-status-danger mt-1">Boleto: {result.boleto_error}</p>
                  )}
                  {result.nfse_error && (
                    <p className="text-status-danger mt-1">NFS-e: {result.nfse_error}</p>
                  )}
                  {result.email_error && (
                    <p className="text-status-danger mt-1">Email: {result.email_error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Billing Provider Selection */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Provedor de Faturamento
              </Label>
              <RadioGroup
                value={billingProvider}
                onValueChange={(value) => setBillingProvider(value as "banco_inter" | "asaas")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="banco_inter" id="provider_inter" />
                  <Label htmlFor="provider_inter" className="cursor-pointer font-normal">
                    Banco Inter
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="asaas" id="provider_asaas" />
                  <Label htmlFor="provider_asaas" className="cursor-pointer font-normal">
                    Asaas
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Processing Options */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Ações a executar</Label>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="boleto"
                  checked={generateBoleto}
                  onCheckedChange={(checked) =>
                    setGenerateBoleto(checked === true)
                  }
                />
                <Label htmlFor="boleto" className="cursor-pointer font-normal">
                  Gerar Boletos Bancários
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="pix"
                  checked={generatePix}
                  onCheckedChange={(checked) => setGeneratePix(checked === true)}
                />
                <Label htmlFor="pix" className="cursor-pointer font-normal">
                  Gerar Chaves PIX
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="nfse"
                  checked={emitNfse}
                  onCheckedChange={(checked) => setEmitNfse(checked === true)}
                />
                <Label htmlFor="nfse" className="cursor-pointer font-normal">
                  Emitir Notas Fiscais (NFS-e)
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="email"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                />
                <Label htmlFor="email" className="cursor-pointer font-normal">
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
                <Label htmlFor="whatsapp" className="cursor-pointer font-normal">
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
            {processingResults.length > 0 ? "Fechar" : "Cancelar"}
          </Button>
          {processingResults.length === 0 && (
            <Button
              onClick={() => processingMutation.mutate()}
              disabled={processingMutation.isPending || selectedInvoiceCount === 0 || !hasAnyOption}
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
