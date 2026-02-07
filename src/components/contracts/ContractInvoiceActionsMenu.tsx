import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Barcode,
  QrCode,
  Zap,
  Mail,
  MessageCircle,
  Send,
  Building2,
  Loader2,
  ExternalLink,
  CheckCircle2,
  HandCoins,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { EmitNfseDialog } from "@/components/financial/EmitNfseDialog";
import { PixCodeDialog } from "@/components/financial/PixCodeDialog";
import type { Tables } from "@/integrations/supabase/types";

export interface ContractInvoiceData {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_date: string | null;
  reference_month: string | null;
  boleto_url: string | null;
  boleto_barcode: string | null;
  pix_code: string | null;
  client_id: string | null;
  contract_id: string | null;
  billing_provider: string | null;
  clients?: { name: string } | null;
  nfse_history: Array<{
    id: string;
    numero_nfse: string | null;
    status: string;
    created_at: string;
  }>;
}

interface NotificationResult {
  success: boolean;
  channel: "email" | "whatsapp";
  error?: string;
  errorCode?: string;
}

interface ContractInvoiceActionsMenuProps {
  invoice: ContractInvoiceData;
  clientName?: string;
}

export function ContractInvoiceActionsMenu({ invoice, clientName }: ContractInvoiceActionsMenuProps) {
  const [generatingPayment, setGeneratingPayment] = useState<string | null>(null);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [sendingNotification, setSendingNotification] = useState<string | null>(null);
  const [nfseDialogOpen, setNfseDialogOpen] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_date: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      toast.success("Fatura marcada como paga");
    },
  });

  const handleGeneratePayment = async (
    paymentType: "boleto" | "pix",
    provider: "banco_inter" | "asaas" = "banco_inter"
  ) => {
    setGeneratingPayment(`${paymentType}-${provider}`);
    try {
      let data, error;
      if (provider === "asaas") {
        const result = await supabase.functions.invoke("asaas-nfse", {
          body: { action: "create_payment", invoice_id: invoice.id, billing_type: paymentType === "pix" ? "PIX" : "BOLETO" },
        });
        data = result.data; error = result.error;
      } else {
        const result = await supabase.functions.invoke("banco-inter", {
          body: { invoice_id: invoice.id, payment_type: paymentType },
        });
        data = result.data; error = result.error;
      }
      if (error) throw error;
      if (data.error) {
        if (data.configured === false) {
          toast.error(`Integração ${provider === "asaas" ? "Asaas" : "Banco Inter"} não configurada`, {
            description: "Configure as credenciais em Configurações → Integrações",
          });
        } else {
          toast.error(data.error);
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["contract-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(paymentType === "boleto" ? "Boleto gerado com sucesso!" : "PIX gerado com sucesso!", {
        description: `Via ${provider === "asaas" ? "Asaas" : "Banco Inter"}`,
      });
    } catch (error: unknown) {
      toast.error("Erro ao gerar pagamento", { description: getErrorMessage(error) });
    } finally {
      setGeneratingPayment(null);
    }
  };

  const handleResendNotification = async (channels: ("email" | "whatsapp")[]) => {
    setSendingNotification(channels.join("-"));
    try {
      const { data, error } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoice.id, channels },
      });
      if (error) throw error;
      if (data.success) {
        const channelNames = channels.map(c => c === "email" ? "Email" : "WhatsApp").join(" e ");
        toast.success(`Cobrança enviada por ${channelNames}!`, { description: data.message });
      } else {
        const failedResults = (data.results as NotificationResult[] | undefined)?.filter(r => !r.success) || [];
        for (const result of failedResults) {
          const channelLabel = result.channel === "email" ? "Email" : "WhatsApp";
          toast.error(`${channelLabel}: ${result.error || "Erro desconhecido"}`);
        }
      }
    } catch (error: unknown) {
      toast.error("Erro ao reenviar cobrança", { description: getErrorMessage(error) });
    } finally {
      setSendingNotification(null);
    }
  };

  const handleEmitComplete = async () => {
    setProcessingComplete(true);
    const steps: string[] = [];
    const provider = invoice.billing_provider || "banco_inter";

    try {
      // 1. Boleto
      if (!invoice.boleto_url) {
        if (provider === "asaas") {
          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: { action: "create_payment", invoice_id: invoice.id, billing_type: "BOLETO" },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao gerar boleto");
          steps.push("Boleto gerado (Asaas)");
        } else {
          const { data, error } = await supabase.functions.invoke("banco-inter", {
            body: { invoice_id: invoice.id, payment_type: "boleto" },
          });
          if (error) throw error;
          if (data.error && data.configured !== false) throw new Error(data.error);
          if (!data.error) steps.push("Boleto gerado (Inter)");
        }
      } else {
        steps.push("Boleto já existente");
      }

      // 2. PIX
      if (!invoice.pix_code) {
        if (provider === "asaas") {
          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: { action: "create_payment", invoice_id: invoice.id, billing_type: "PIX" },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao gerar PIX");
          steps.push("PIX gerado (Asaas)");
        } else {
          const { data, error } = await supabase.functions.invoke("banco-inter", {
            body: { invoice_id: invoice.id, payment_type: "pix" },
          });
          if (error) throw error;
          if (data.error && data.configured !== false) throw new Error(data.error);
          if (!data.error) steps.push("PIX gerado (Inter)");
        }
      } else {
        steps.push("PIX já existente");
      }

      // 3. NFS-e
      if (invoice.contract_id) {
        const existingNfse = invoice.nfse_history.find(n => ["autorizada", "processando"].includes(n.status));
        if (!existingNfse) {
          const { data: contract } = await supabase
            .from("contracts")
            .select("name, description, nfse_descricao_customizada")
            .eq("id", invoice.contract_id)
            .single();

          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: {
              action: "emit",
              client_id: invoice.client_id,
              invoice_id: invoice.id,
              contract_id: invoice.contract_id,
              value: invoice.amount,
              service_description: contract?.nfse_descricao_customizada || contract?.description || `Prestação de serviços - ${contract?.name}`,
            },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao emitir NFS-e");
          steps.push("NFS-e emitida");
        } else {
          steps.push(`NFS-e ${existingNfse.status}`);
        }
      }

      // 4. Notificações
      const { data: notifData, error: notifError } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoice.id, channels: ["email", "whatsapp"] },
      });
      if (notifError) throw notifError;
      if (notifData.success) {
        steps.push("Notificações enviadas");
      } else {
        const results = notifData.results as NotificationResult[] | undefined;
        const failedChannels = results?.filter(r => !r.success).map(r => r.channel) || [];
        if (failedChannels.length > 0) steps.push(`Notificações: ${failedChannels.length} falha(s)`);
      }

      toast.success("Fatura processada com sucesso!", { description: steps.join(" • ") });
      queryClient.invalidateQueries({ queryKey: ["contract-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
    } catch (error: unknown) {
      toast.error("Erro no processamento completo", {
        description: `${steps.length > 0 ? `Completado: ${steps.join(", ")}. ` : ""}Erro: ${getErrorMessage(error)}`,
      });
    } finally {
      setProcessingComplete(false);
    }
  };

  const isProcessing = generatingPayment !== null || processingComplete || sendingNotification !== null;

  // Build the invoice object for EmitNfseDialog compatibility
  const invoiceForDialog = {
    ...invoice,
    clients: invoice.clients || (clientName ? { name: clientName } : null),
  } as Tables<"invoices"> & { clients: { name: string } | null };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0">
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* Emitir Completo */}
          <DropdownMenuItem
            onClick={handleEmitComplete}
            disabled={isProcessing}
            className="font-medium text-primary"
          >
            {processingComplete ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Emitir Completo
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Gerar Boleto */}
          {!invoice.boleto_url && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Barcode className="mr-2 h-4 w-4" />
                Gerar Boleto
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleGeneratePayment("boleto", "banco_inter")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Banco Inter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleGeneratePayment("boleto", "asaas")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Asaas
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Gerar PIX */}
          {!invoice.pix_code && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <QrCode className="mr-2 h-4 w-4" />
                Gerar PIX
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleGeneratePayment("pix", "banco_inter")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Banco Inter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleGeneratePayment("pix", "asaas")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Asaas
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Marcar como Pago */}
          <DropdownMenuItem onClick={() => markAsPaidMutation.mutate(invoice.id)} disabled={isProcessing}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Marcar como Pago
          </DropdownMenuItem>

          {/* Notificações */}
          {(invoice.boleto_url || invoice.pix_code) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleResendNotification(["email"])} disabled={isProcessing}>
                <Mail className="mr-2 h-4 w-4" />
                Enviar por Email
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleResendNotification(["whatsapp"])} disabled={isProcessing}>
                <MessageCircle className="mr-2 h-4 w-4" />
                Enviar por WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleResendNotification(["email", "whatsapp"])} disabled={isProcessing}>
                <Send className="mr-2 h-4 w-4" />
                Enviar Email + WhatsApp
              </DropdownMenuItem>
            </>
          )}

          {/* NFS-e Manual */}
          {invoice.contract_id && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNfseDialogOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Emitir NFS-e Manual
              </DropdownMenuItem>
            </>
          )}

          {/* Ver boleto / PIX */}
          {(invoice.boleto_url || invoice.pix_code) && (
            <>
              <DropdownMenuSeparator />
              {invoice.boleto_url && (
                <DropdownMenuItem onClick={() => window.open(invoice.boleto_url!, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver Boleto
                </DropdownMenuItem>
              )}
              {invoice.pix_code && (
                <DropdownMenuItem onClick={() => setPixDialogOpen(true)}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Ver PIX
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      {nfseDialogOpen && (
        <EmitNfseDialog
          open={nfseDialogOpen}
          onOpenChange={setNfseDialogOpen}
          invoice={invoiceForDialog}
        />
      )}

      {pixDialogOpen && invoice.pix_code && (
        <PixCodeDialog
          open={pixDialogOpen}
          onOpenChange={setPixDialogOpen}
          pixCode={invoice.pix_code}
          invoiceNumber={invoice.invoice_number}
          amount={invoice.amount}
          clientName={clientName || "Cliente"}
        />
      )}
    </>
  );
}
