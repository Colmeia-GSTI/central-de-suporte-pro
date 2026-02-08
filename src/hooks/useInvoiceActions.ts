import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

interface NotificationResult {
  success: boolean;
  channel: "email" | "whatsapp";
  error?: string;
  errorCode?: string;
}

interface InvoiceForActions {
  id: string;
  invoice_number: number;
  amount: number;
  boleto_url: string | null;
  pix_code: string | null;
  contract_id: string | null;
  client_id: string | null;
  billing_provider: string | null;
  clients?: { name: string } | null;
}

interface NfseByInvoice {
  [invoiceId: string]: { status: string; numero_nfse: string | null };
}

export function useInvoiceActions() {
  const [generatingPayment, setGeneratingPayment] = useState<string | null>(null);
  const [processingComplete, setProcessingComplete] = useState<string | null>(null);
  const [sendingNotification, setSendingNotification] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const isProcessing = generatingPayment !== null || processingComplete !== null || sendingNotification !== null;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["contract-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
  };

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_date: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Fatura marcada como paga");
    },
  });

  const handleGeneratePayment = async (
    invoiceId: string,
    paymentType: "boleto" | "pix",
    provider: "banco_inter" | "asaas" = "banco_inter"
  ) => {
    setGeneratingPayment(`${invoiceId}-${paymentType}-${provider}`);
    try {
      let data, error;

      if (provider === "asaas") {
        const result = await supabase.functions.invoke("asaas-nfse", {
          body: {
            action: "create_payment",
            invoice_id: invoiceId,
            billing_type: paymentType === "pix" ? "PIX" : "BOLETO",
          },
        });
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase.functions.invoke("banco-inter", {
          body: { invoice_id: invoiceId, payment_type: paymentType },
        });
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (data.error) {
        if (data.configured === false) {
          toast.error(
            `Integração ${provider === "asaas" ? "Asaas" : "Banco Inter"} não configurada`,
            { description: "Configure as credenciais em Configurações → Integrações" }
          );
        } else {
          toast.error(data.error);
        }
        return;
      }

      invalidateAll();
      toast.success(
        paymentType === "boleto" ? "Boleto gerado com sucesso!" : "PIX gerado com sucesso!",
        { description: `Via ${provider === "asaas" ? "Asaas" : "Banco Inter"}` }
      );
    } catch (error: unknown) {
      toast.error("Erro ao gerar pagamento", { description: getErrorMessage(error) });
    } finally {
      setGeneratingPayment(null);
    }
  };

  const handleResendNotification = async (
    invoiceId: string,
    channels: ("email" | "whatsapp")[]
  ) => {
    setSendingNotification(`${invoiceId}-${channels.join("-")}`);
    try {
      const { data, error } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoiceId, channels },
      });

      if (error) throw error;

      if (data.success) {
        const channelNames = channels
          .map((c) => (c === "email" ? "Email" : "WhatsApp"))
          .join(" e ");
        toast.success(`Cobrança enviada por ${channelNames}!`, {
          description: data.message,
        });
      } else {
        const failedResults =
          (data.results as NotificationResult[] | undefined)?.filter((r) => !r.success) || [];
        for (const result of failedResults) {
          const channelLabel = result.channel === "email" ? "Email" : "WhatsApp";
          if (result.errorCode === "WHATSAPP_INTEGRATION_DISABLED") {
            toast.error(`${channelLabel}: Integração desativada`, {
              description:
                "Ative a integração do WhatsApp em Configurações → Integrações → Mensagens",
            });
          } else if (result.errorCode === "CLIENT_NO_WHATSAPP") {
            toast.error(`${channelLabel}: Cliente sem WhatsApp`, {
              description:
                result.error || "Cadastre o número de WhatsApp do cliente antes de enviar",
            });
          } else {
            toast.error(`${channelLabel}: ${result.error || "Erro desconhecido"}`);
          }
        }
      }
    } catch (error: unknown) {
      toast.error("Erro ao reenviar cobrança", { description: getErrorMessage(error) });
    } finally {
      setSendingNotification(null);
    }
  };

  const handleEmitComplete = async (
    invoice: InvoiceForActions,
    nfseByInvoice: NfseByInvoice = {}
  ) => {
    setProcessingComplete(invoice.id);
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
        const existingNfse = nfseByInvoice[invoice.id];
        if (!existingNfse || !["autorizada", "processando"].includes(existingNfse.status)) {
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
              service_description:
                contract?.nfse_descricao_customizada ||
                contract?.description ||
                `Prestação de serviços - ${contract?.name}`,
            },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao emitir NFS-e");
          steps.push("NFS-e emitida");
        } else {
          steps.push(`NFS-e ${existingNfse.status}`);
        }
      }

      // 4. Notifications
      const { data: notifData, error: notifError } = await supabase.functions.invoke(
        "resend-payment-notification",
        { body: { invoice_id: invoice.id, channels: ["email", "whatsapp"] } }
      );

      if (notifError) throw notifError;
      if (notifData.success) {
        steps.push("Notificações enviadas");
      } else {
        const results = notifData.results as NotificationResult[] | undefined;
        const failedChannels =
          results?.filter((r) => !r.success).map((r) => r.channel) || [];
        if (failedChannels.length > 0)
          steps.push(`Notificações: ${failedChannels.length} falha(s)`);
      }

      toast.success("Fatura processada com sucesso!", {
        description: steps.join(" • "),
      });
      invalidateAll();
    } catch (error: unknown) {
      toast.error("Erro no processamento completo", {
        description: `${steps.length > 0 ? `Completado: ${steps.join(", ")}. ` : ""}Erro: ${getErrorMessage(error)}`,
      });
    } finally {
      setProcessingComplete(null);
    }
  };

  return {
    generatingPayment,
    processingComplete,
    sendingNotification,
    isProcessing,
    markAsPaidMutation,
    handleGeneratePayment,
    handleResendNotification,
    handleEmitComplete,
  };
}
