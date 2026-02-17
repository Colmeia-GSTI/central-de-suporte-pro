import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Barcode,
  FileText,
  Mail,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Send,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import type { Tables, Enums } from "@/integrations/supabase/types";

type InvoiceWithDetails = Tables<"invoices"> & {
  clients?: { name: string } | null;
};

interface InvoiceProcessingHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithDetails | null;
}

interface ProcessingStep {
  id: string;
  type: "boleto" | "nfse" | "email" | "processing";
  status: "success" | "error" | "pending" | "skipped";
  title: string;
  description: string;
  timestamp: string | null;
  errorMessage?: string | null;
}

const statusConfig = {
  success: {
    icon: CheckCircle2,
    className: "text-status-success bg-status-success/10 border-status-success/30",
    badgeVariant: "default" as const,
    badgeClassName: "bg-status-success/20 text-status-success border-status-success/30",
  },
  error: {
    icon: XCircle,
    className: "text-status-danger bg-status-danger/10 border-status-danger/30",
    badgeVariant: "destructive" as const,
    badgeClassName: "bg-status-danger/20 text-status-danger border-status-danger/30",
  },
  pending: {
    icon: Clock,
    className: "text-status-warning bg-status-warning/10 border-status-warning/30",
    badgeVariant: "secondary" as const,
    badgeClassName: "bg-status-warning/20 text-status-warning border-status-warning/30",
  },
  skipped: {
    icon: Clock,
    className: "text-muted-foreground bg-muted/50 border-muted-foreground/30",
    badgeVariant: "outline" as const,
    badgeClassName: "bg-muted/50 text-muted-foreground",
  },
};

const typeIcons = {
  boleto: Barcode,
  nfse: FileText,
  email: Mail,
  processing: RefreshCw,
};

function mapBoletoStatus(status: Enums<"boleto_processing_status"> | null): "success" | "error" | "pending" | "skipped" {
  if (!status || status === "pendente") return "pending";
  if (status === "gerado" || status === "enviado" || status === "registrado") return "success";
  if (status === "processando") return "pending";
  if (status === "erro") return "error";
  return "pending";
}

function mapNfseStatus(status: Enums<"nfse_processing_status"> | null): "success" | "error" | "pending" | "skipped" {
  if (!status || status === "pendente") return "pending";
  if (status === "gerada") return "success";
  if (status === "erro") return "error";
  return "pending";
}

function mapEmailStatus(status: Enums<"email_processing_status"> | null): "success" | "error" | "pending" | "skipped" {
  if (!status || status === "pendente") return "pending";
  if (status === "enviado") return "success";
  if (status === "erro") return "error";
  return "pending";
}

function buildProcessingSteps(invoice: InvoiceWithDetails): ProcessingStep[] {
  const steps: ProcessingStep[] = [];

  // Boleto step
  const boletoGenerated = !!(invoice.boleto_url || invoice.boleto_barcode);
  steps.push({
    id: "boleto",
    type: "boleto",
    status: mapBoletoStatus(invoice.boleto_status),
    title: "Boleto Bancário",
    description: boletoGenerated
      ? `Boleto gerado - ${invoice.boleto_status === "enviado" ? "Enviado ao cliente" : invoice.boleto_status === "registrado" ? "Registrado no banco" : "Disponível"}`
      : invoice.boleto_status === "erro" 
        ? "Erro na geração do boleto"
        : invoice.boleto_status === "processando"
          ? "Processando no banco..."
          : "Aguardando geração",
    timestamp: invoice.boleto_sent_at,
    errorMessage: invoice.boleto_error_msg,
  });

  // NFS-e step
  steps.push({
    id: "nfse",
    type: "nfse",
    status: mapNfseStatus(invoice.nfse_status),
    title: "Nota Fiscal (NFS-e)",
    description: invoice.nfse_status === "gerada"
      ? "NFS-e emitida e autorizada"
      : invoice.nfse_status === "erro"
        ? "Erro na emissão da NFS-e"
        : "Aguardando emissão",
    timestamp: invoice.nfse_generated_at,
    errorMessage: invoice.nfse_error_msg,
  });

  // Email step
  steps.push({
    id: "email",
    type: "email",
    status: mapEmailStatus(invoice.email_status),
    title: "Notificação por Email",
    description: invoice.email_status === "enviado"
      ? "Email de cobrança enviado"
      : invoice.email_status === "erro"
        ? "Erro ao enviar email"
        : "Aguardando envio",
    timestamp: invoice.email_sent_at,
    errorMessage: invoice.email_error_msg,
  });

  // Processing metadata step (if batch processed)
  if (invoice.processed_at) {
    const metadata = invoice.processing_metadata as Record<string, unknown> | null;
    steps.push({
      id: "processing",
      type: "processing",
      status: "success",
      title: "Processamento em Lote",
      description: metadata?.batch_processed 
        ? `Processado via ${metadata?.provider || "sistema"}`
        : "Processamento manual concluído",
      timestamp: invoice.processed_at,
    });
  }

  return steps;
}

export function InvoiceProcessingHistory({
  open,
  onOpenChange,
  invoice,
}: InvoiceProcessingHistoryProps) {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (!invoice) return null;

  const steps = buildProcessingSteps(invoice);
  const processingAttempts = invoice.processing_attempts || 0;

  const handleRegenerateBoleto = async () => {
    setActionLoading("boleto");
    try {
      const provider = (invoice as any).billing_provider || "banco_inter";
      const fnName = provider === "asaas" ? "asaas-nfse" : "banco-inter";
      const body = provider === "asaas"
        ? { action: "create_payment", invoice_id: invoice.id, billing_type: "BOLETO" }
        : { action: "generate", invoice_id: invoice.id };
      const { error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      toast.success("Boleto reenviado para geração");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro ao regenerar boleto", { description: getErrorMessage(e) });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReprocessNfse = async () => {
    setActionLoading("nfse");
    try {
      const { error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: invoice.contract_id ? "emit" : "emit_standalone",
          invoice_id: invoice.id,
          client_id: (invoice as any).client_id || undefined,
          value: invoice.amount,
          ...(invoice.contract_id ? { contract_id: invoice.contract_id } : {}),
        },
      });
      if (error) throw error;
      toast.success("NFS-e reenviada para processamento");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro ao reprocessar NFS-e", { description: getErrorMessage(e) });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendNotification = async () => {
    setActionLoading("email");
    try {
      const { error } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoice.id, channels: ["email"] },
      });
      if (error) throw error;
      toast.success("Notificação reenviada");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: unknown) {
      toast.error("Erro ao reenviar", { description: getErrorMessage(e) });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForcePolling = async () => {
    setActionLoading("polling");
    try {
      const { data, error } = await supabase.functions.invoke("poll-boleto-status");
      if (error) throw error;
      toast.success("Polling executado", {
        description: `${data.updated || 0} atualizado(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro no polling", { description: getErrorMessage(e) });
    } finally {
      setActionLoading(null);
    }
  };

  const getStepAction = (step: ProcessingStep) => {
    if (step.status !== "error" && !(step.type === "boleto" && step.status === "pending" && !invoice.boleto_barcode && !invoice.boleto_url)) return null;

    switch (step.type) {
      case "boleto":
        if (step.status === "error") {
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs mt-2"
              disabled={actionLoading === "boleto"}
              onClick={handleRegenerateBoleto}
            >
              {actionLoading === "boleto" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
              Regenerar Boleto
            </Button>
          );
        }
        if (step.status === "pending" && !invoice.boleto_barcode && !invoice.boleto_url) {
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs mt-2"
              disabled={actionLoading === "polling"}
              onClick={handleForcePolling}
            >
              {actionLoading === "polling" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Forçar Polling
            </Button>
          );
        }
        return null;
      case "nfse":
        return (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs mt-2"
            disabled={actionLoading === "nfse"}
            onClick={handleReprocessNfse}
          >
            {actionLoading === "nfse" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
            Reprocessar NFS-e
          </Button>
        );
      case "email":
        return (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs mt-2"
            disabled={actionLoading === "email"}
            onClick={handleResendNotification}
          >
            {actionLoading === "email" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
            Reenviar Notificação
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico de Processamento</SheetTitle>
          <SheetDescription>
            Fatura #{invoice.invoice_number} - {invoice.clients?.name || "Cliente"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="outline" className="text-xs">
              {processingAttempts} tentativa(s)
            </Badge>
            {invoice.processed_at && (
              <Badge variant="outline" className="text-xs bg-status-success/10 text-status-success border-status-success/30">
                Processada
              </Badge>
            )}
          </div>

          <Separator className="mb-4" />

          {/* Timeline */}
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-4">
              {steps.map((step, index) => {
                const config = statusConfig[step.status];
                const TypeIcon = typeIcons[step.type];
                const StatusIcon = config.icon;

                return (
                  <div
                    key={step.id}
                    className="relative pl-8"
                  >
                    {/* Timeline line */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-3 top-8 w-0.5 h-full bg-border" />
                    )}

                    {/* Step icon */}
                    <div
                      className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center border ${config.className}`}
                    >
                      <TypeIcon className="h-3 w-3" />
                    </div>

                    {/* Step content */}
                    <div className="pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{step.title}</span>
                        <Badge
                          variant={config.badgeVariant}
                          className={`text-xs ${config.badgeClassName}`}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {step.status === "success" && "Concluído"}
                          {step.status === "error" && "Erro"}
                          {step.status === "pending" && "Pendente"}
                          {step.status === "skipped" && "Ignorado"}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>

                      {step.timestamp && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(step.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}

                      {step.errorMessage && (
                        <div className="mt-2 p-2 bg-status-danger/10 border border-status-danger/30 rounded text-xs text-status-danger">
                          <div className="flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>{step.errorMessage}</span>
                          </div>
                        </div>
                      )}

                      {/* Action button for error/orphan steps */}
                      {getStepAction(step)}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
