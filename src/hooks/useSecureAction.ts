import { useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import type { Module, ModuleAction } from "@/lib/permissions";

interface UseSecureActionOptions {
  module: Module;
  action: ModuleAction;
  /** Optional custom denial message */
  deniedMessage?: string;
}

/**
 * Wraps a mutation callback with frontend permission validation.
 * 
 * SECURITY NOTE: This is a UX-layer guard only. RLS policies enforce
 * the real data protection on the backend. This hook prevents unnecessary
 * API calls and provides immediate feedback to the user.
 * 
 * @example
 * ```tsx
 * const secureDelete = useSecureAction({
 *   module: "tickets",
 *   action: "delete",
 * });
 * 
 * const handleDelete = () => {
 *   secureDelete(() => deleteMutation.mutate(ticketId));
 * };
 * ```
 */
export function useSecureAction({ module, action, deniedMessage }: UseSecureActionOptions) {
  const { can } = usePermissions();
  const { toast } = useToast();

  const execute = useCallback(
    (callback: () => void) => {
      if (!can(module, action)) {
        const message = deniedMessage || "Você não tem permissão para realizar esta ação.";
        
        logger.warn(
          `[SecureAction] Permission denied: ${module}.${action}`,
          "Security",
          { module, action }
        );

        toast({
          title: "Ação não permitida",
          description: message,
          variant: "destructive",
        });
        return;
      }

      callback();
    },
    [can, module, action, deniedMessage, toast]
  );

  const isAllowed = can(module, action);

  return { execute, isAllowed };
}
