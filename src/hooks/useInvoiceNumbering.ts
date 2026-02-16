import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import {
  formatInvoiceNumber,
  validateInvoiceNumberFormat,
  parseInvoiceNumber,
} from "@/lib/invoice-numbering";

interface NumberingConfig {
  id: string;
  client_id: string;
  contract_id?: string;
  numbering_pattern: string;
  current_sequence: number;
  prefix?: string;
  year_reset: boolean;
}

interface UseInvoiceNumberingResult {
  config: NumberingConfig | null;
  isLoading: boolean;
  generateNextNumber: (clientId: string, contractId?: string) => Promise<number>;
  formatNumber: (sequence: number) => string;
  updateConfig: (config: Partial<NumberingConfig>) => Promise<void>;
}

/**
 * Hook for managing invoice numbering with Supabase integration
 */
export function useInvoiceNumbering(
  clientId: string,
  contractId?: string
): UseInvoiceNumberingResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [generatedNumber, setGeneratedNumber] = useState<number | null>(null);

  // Fetch numbering config
  const { data: config, isLoading } = useQuery({
    queryKey: ["invoiceNumberConfig", clientId, contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_number_config")
        .select("*")
        .eq("client_id", clientId)
        .eq("contract_id", contractId || null)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned (expected for new clients)
        logger.error("Error fetching numbering config", { clientId, contractId }, error);
      }

      return data as NumberingConfig | null;
    },
    retry: 1,
  });

  // Mutation to generate next number
  const generateMutation = useMutation({
    mutationFn: async (params: { clientId: string; contractId?: string }) => {
      const execId = logger.generateExecutionId();

      try {
        // Call Supabase RPC function to generate next number
        const { data, error } = await supabase.rpc(
          "generate_next_invoice_number",
          {
            p_client_id: params.clientId,
            p_contract_id: params.contractId,
          }
        );

        if (error) {
          logger.error(
            "Error generating invoice number",
            { clientId: params.clientId },
            error
          );
          throw new Error(
            error.message || "Erro ao gerar número de fatura"
          );
        }

        // Log successful generation
        await logger.invoiceProcessingLog(
          execId,
          params.clientId,
          "numbering",
          "success",
          { sequence: data, execution_id: execId }
        );

        setGeneratedNumber(data);
        return data as number;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Invoice numbering error", { clientId }, error);
        throw error;
      }
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível gerar o número da fatura. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const generateNextNumber = useCallback(
    async (clientId: string, contractId?: string): Promise<number> => {
      return generateMutation.mutateAsync({ clientId, contractId });
    },
    [generateMutation]
  );

  const formatNumber = useCallback(
    (sequence: number): string => {
      if (!config) return String(sequence);

      return formatInvoiceNumber(
        sequence,
        config.numbering_pattern,
        config.prefix
      );
    },
    [config]
  );

  // Mutation to update config
  const updateMutation = useMutation({
    mutationFn: async (
      newConfig: Partial<NumberingConfig>
    ) => {
      if (!config) throw new Error("No config to update");

      const { error } = await supabase
        .from("invoice_number_config")
        .update(newConfig)
        .eq("id", config.id);

      if (error) {
        logger.error("Error updating numbering config", { configId: config.id }, error);
        throw error;
      }

      // Refresh config query
      queryClient.invalidateQueries({
        queryKey: ["invoiceNumberConfig", clientId, contractId],
      });

      toast({
        title: "Sucesso",
        description: "Configuração de numeração atualizada com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar configuração de numeração",
        variant: "destructive",
      });
    },
  });

  const updateConfig = useCallback(
    async (newConfig: Partial<NumberingConfig>) => {
      return updateMutation.mutateAsync(newConfig);
    },
    [updateMutation]
  );

  return {
    config,
    isLoading: isLoading || generateMutation.isPending,
    generateNextNumber,
    formatNumber,
    updateConfig,
  };
}
