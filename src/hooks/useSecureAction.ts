/**
 * Hook for secure actions with permission validation
 * Validates permissions before executing sensitive operations
 */

import { useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Module, ModuleAction } from "@/lib/permissions";
import { logger } from "@/lib/logger";

interface SecureActionOptions {
  module: Module;
  action: ModuleAction;
  onUnauthorized?: () => void;
}

interface SecureActionResult<T> {
  execute: (fn: () => Promise<T>) => Promise<T | null>;
  isAllowed: boolean;
}

/**
 * Hook that wraps sensitive actions with permission checks
 * Use this for any action that modifies data or accesses sensitive information
 * 
 * @example
 * const { execute, isAllowed } = useSecureAction({ module: 'invoices', action: 'delete' });
 * 
 * const handleDelete = async () => {
 *   await execute(async () => {
 *     await supabase.from('invoices').delete().eq('id', invoiceId);
 *   });
 * };
 */
export function useSecureAction<T = void>({ 
  module, 
  action, 
  onUnauthorized 
}: SecureActionOptions): SecureActionResult<T> {
  const { can } = usePermissions();
  const { user, rolesLoaded } = useAuth();
  const { toast } = useToast();

  const isAllowed = can(module, action);

  const execute = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    // Wait for roles to load
    if (!rolesLoaded) {
      toast({
        title: "Aguarde",
        description: "Carregando permissões...",
        variant: "default",
      });
      return null;
    }

    // Check authentication
    if (!user) {
      toast({
        title: "Não autenticado",
        description: "Faça login para continuar",
        variant: "destructive",
      });
      onUnauthorized?.();
      return null;
    }

    // Check permission
    if (!can(module, action)) {
      toast({
        title: "Acesso negado",
        description: `Você não tem permissão para ${action} em ${module}`,
        variant: "destructive",
      });
      onUnauthorized?.();
      
      // Log unauthorized attempt
      logger.warn(`Unauthorized ${action} attempt on ${module}`, "Security", { userId: user.id });
      
      return null;
    }

    // Execute the action
    try {
      return await fn();
    } catch (error) {
      // Don't expose internal error details
      const safeMessage = error instanceof Error 
        ? (error.message.includes('policy') 
            ? 'Acesso negado pelo servidor' 
            : 'Erro ao executar operação')
        : 'Erro desconhecido';

      toast({
        title: "Erro",
        description: safeMessage,
        variant: "destructive",
      });

      // Log the actual error for debugging (not exposed to user)
      logger.error("Action failed", "Security", { error: String(error) });
      
      return null;
    }
  }, [can, module, action, user, rolesLoaded, toast, onUnauthorized]);

  return { execute, isAllowed };
}

/**
 * Higher-order function for securing async operations
 * Use in mutations or event handlers
 */
export function withPermissionCheck<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  permissions: { can: (m: Module, a: ModuleAction) => boolean },
  module: Module,
  action: ModuleAction
): T {
  return (async (...args: Parameters<T>) => {
    if (!permissions.can(module, action)) {
      throw new Error(`Permission denied: ${action} on ${module}`);
    }
    return fn(...args);
  }) as T;
}
