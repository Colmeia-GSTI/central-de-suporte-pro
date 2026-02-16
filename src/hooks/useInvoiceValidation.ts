import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import {
  validateInvoiceData,
  validateInvoiceWithZod,
  InvoiceValidationResult,
  InvoiceData,
  ClientData,
} from "@/lib/invoice-validation";

interface UseInvoiceValidationResult {
  validationResult: InvoiceValidationResult | null;
  isValidating: boolean;
  validate: (
    invoice: InvoiceData,
    client?: ClientData | null
  ) => Promise<InvoiceValidationResult>;
  reset: () => void;
  executionId: string | null;
}

/**
 * Hook for validating invoice data with logging and persistence
 */
export function useInvoiceValidation(): UseInvoiceValidationResult {
  const { toast } = useToast();
  const [validationResult, setValidationResult] =
    useState<InvoiceValidationResult | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);

  const validateMutation = useMutation({
    mutationFn: async (data: {
      invoice: InvoiceData;
      client?: ClientData | null;
    }) => {
      const execId = logger.generateExecutionId();
      setExecutionId(execId);

      // First validate with Zod schema
      const zodValidation = validateInvoiceWithZod(data.invoice);
      if (!zodValidation.success) {
        const error = new Error(
          `Validation schema error: ${JSON.stringify(zodValidation.error.errors)}`
        );
        logger.error("Invoice Zod validation failed", { data }, error);
        throw error;
      }

      // Then validate with custom rules
      const result = validateInvoiceData(data.invoice, data.client);

      // Log validation result
      await logger.invoiceValidationLog(
        execId,
        "validate",
        result.isValid,
        result.errors,
        result.warnings,
        true
      );

      setValidationResult(result);

      // Show toast feedback
      if (!result.isValid) {
        const errorCount = result.errors.length;
        toast({
          title: "Erros de Validação",
          description: `${errorCount} erro${errorCount !== 1 ? "s" : ""} encontrado${errorCount !== 1 ? "s" : ""}`,
          variant: "destructive",
        });
      } else if (result.warnings.length > 0) {
        const warningCount = result.warnings.length;
        toast({
          title: "Avisos",
          description: `${warningCount} aviso${warningCount !== 1 ? "s" : ""} encontrado${warningCount !== 1 ? "s" : ""}`,
          variant: "default",
        });
      }

      return result;
    },
    onError: (error: Error) => {
      logger.error("Invoice validation error", { error: error.message }, error);
      toast({
        title: "Erro na Validação",
        description:
          "Ocorreu um erro ao validar a fatura. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const validate = useCallback(
    async (
      invoice: InvoiceData,
      client?: ClientData | null
    ): Promise<InvoiceValidationResult> => {
      return validateMutation.mutateAsync({ invoice, client });
    },
    [validateMutation]
  );

  const reset = useCallback(() => {
    setValidationResult(null);
    setExecutionId(null);
  }, []);

  return {
    validationResult,
    isValidating: validateMutation.isPending,
    validate,
    reset,
    executionId,
  };
}
