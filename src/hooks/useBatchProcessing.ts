import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseBatchProcessingOptions {
  onComplete?: () => void;
}

interface BatchProcessingParams {
  invoiceIds: string[];
  billingProvider?: "banco_inter" | "asaas";
}

export function useBatchProcessing({ onComplete }: UseBatchProcessingOptions = {}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ invoiceIds, billingProvider = "banco_inter" }: BatchProcessingParams) => {
      if (invoiceIds.length === 0) {
        throw new Error("Nenhuma fatura selecionada");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("Não autenticado");

      const response = await supabase.functions.invoke("batch-process-invoices", {
        body: {
          invoice_ids: invoiceIds,
          generate_boleto: true,
          generate_pix: false,
          emit_nfse: true,
          send_email: true,
          send_whatsapp: false,
          billing_provider: billingProvider,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onMutate: ({ invoiceIds }) => {
      toast.loading(`Processando ${invoiceIds.length} fatura(s)...`, {
        id: "batch-processing",
        duration: Infinity,
      });
    },
    onSuccess: (data) => {
      const results = data.results || [];
      const successful = results.filter((r: any) => r.success).length;
      const failed = results.length - successful;

      toast.dismiss("batch-processing");

      if (failed === 0) {
        toast.success(`${successful} fatura(s) processada(s) com sucesso`);
      } else {
        toast.warning(`${successful} processada(s), ${failed} com erro(s)`);
      }

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      onComplete?.();
    },
    onError: (error) => {
      toast.dismiss("batch-processing");
      toast.error(
        error instanceof Error ? error.message : "Erro ao processar faturas"
      );
    },
  });

  return {
    processBatch: (invoiceIds: string[], billingProvider?: "banco_inter" | "asaas") =>
      mutation.mutate({ invoiceIds, billingProvider }),
    isProcessing: mutation.isPending,
  };
}
