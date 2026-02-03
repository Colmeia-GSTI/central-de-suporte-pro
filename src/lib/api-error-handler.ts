/**
 * Centralized API error handler
 * Ensures sensitive information is never exposed to users
 */

import { logger } from "@/lib/logger";

// Known error patterns that are safe to show
const SAFE_ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /duplicate key/i, message: "Este registro já existe" },
  { pattern: /foreign key/i, message: "Este registro está vinculado a outros dados" },
  { pattern: /not found/i, message: "Registro não encontrado" },
  { pattern: /violates.*policy/i, message: "Acesso negado" },
  { pattern: /permission denied/i, message: "Permissão negada" },
  { pattern: /unauthorized/i, message: "Não autorizado" },
  { pattern: /network/i, message: "Erro de conexão. Verifique sua internet" },
  { pattern: /timeout/i, message: "A requisição demorou muito. Tente novamente" },
  { pattern: /invalid input/i, message: "Dados inválidos" },
  { pattern: /required/i, message: "Campos obrigatórios não preenchidos" },
];

// Error codes that should never be exposed
const SENSITIVE_PATTERNS = [
  /sql/i,
  /query/i,
  /column/i,
  /table/i,
  /schema/i,
  /database/i,
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /stack/i,
  /trace/i,
  /internal/i,
  /server error/i,
];

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

/**
 * Transforms API errors into user-friendly messages
 * Never exposes sensitive database or server information
 */
export function sanitizeApiError(error: unknown): { message: string; code?: string } {
  // Handle null/undefined
  if (!error) {
    return { message: "Ocorreu um erro desconhecido" };
  }

  // Extract error message
  let rawMessage = "";
  let errorCode: string | undefined;

  if (error instanceof Error) {
    rawMessage = error.message;
  } else if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    rawMessage = String(err.message || err.error || err.details || "");
    errorCode = String(err.code || err.status || "");
  } else {
    rawMessage = String(error);
  }

  // Check for safe patterns first
  for (const { pattern, message } of SAFE_ERROR_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return { message, code: errorCode };
    }
  }

  // Check if the error contains sensitive information
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(rawMessage)) {
      logger.error("Sensitive API error intercepted", "API", { rawMessage });
      return {
        message: "Ocorreu um erro no servidor. Por favor, tente novamente.",
        code: "SERVER_ERROR"
      };
    }
  }

  // If message is very long, it might contain sensitive data
  if (rawMessage.length > 200) {
    logger.error("Long API error message intercepted", "API", { length: rawMessage.length });
    return {
      message: "Ocorreu um erro inesperado.",
      code: "UNEXPECTED_ERROR"
    };
  }

  // Return sanitized message
  return { message: rawMessage || "Ocorreu um erro desconhecido", code: errorCode };
}

/**
 * Wraps an async function with error sanitization
 */
export async function withSafeError<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<{ data: T | undefined; error?: { message: string; code?: string } }> {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    return { 
      data: fallback, 
      error: sanitizeApiError(error) 
    };
  }
}

/**
 * Error boundary handler for displaying toasts
 */
export function handleMutationError(
  error: unknown,
  toast: (opts: { title: string; description: string; variant: "destructive" }) => void
): void {
  const { message } = sanitizeApiError(error);
  toast({
    title: "Erro",
    description: message,
    variant: "destructive",
  });
}
