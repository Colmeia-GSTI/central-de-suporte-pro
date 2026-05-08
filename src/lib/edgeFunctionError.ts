/**
 * Extrai mensagem de erro real de uma chamada `supabase.functions.invoke()`.
 *
 * **Problema que resolve:** quando uma edge retorna HTTP non-2xx com body JSON
 * `{ error: "mensagem específica" }`, o Supabase JS SDK popula `response.error`
 * com um `FunctionsHttpError` genérico (`"Edge Function returned a non-2xx status code"`)
 * e **descarta o body** parseado. A mensagem útil fica enterrada em
 * `error.context.body` (string ou stream).
 *
 * Esta função:
 * 1. Verifica se `response.data?.error` está populado (caminho feliz quando SDK preserva)
 * 2. Senão, tenta parsear `error.context.body` (não-2xx)
 * 3. Senão, devolve a mensagem genérica do error original
 * 4. Por último, fallback para "Erro desconhecido"
 *
 * @example
 * const response = await supabase.functions.invoke("manual-payment", { body: {...} });
 * const errorMessage = extractEdgeFunctionError(response);
 * if (errorMessage) {
 *   throw new Error(errorMessage);
 * }
 * return response.data;
 */
export function extractEdgeFunctionError(
  response: { data: unknown; error: unknown }
): string | null {
  const { data, error } = response;

  // Caso 1: SDK preservou body do response (ocorre em alguns paths do SDK)
  if (data && typeof data === "object" && "error" in data) {
    const dataError = (data as { error: unknown }).error;
    if (typeof dataError === "string" && dataError.length > 0) {
      return dataError;
    }
  }

  // Sem error e sem data.error → sucesso (caller pode prosseguir)
  if (!error) return null;

  // Caso 2: error.context.body tem o JSON do response (FunctionsHttpError)
  const errorObj = error as { context?: { body?: unknown }; message?: string };
  const ctxBody = errorObj?.context?.body;

  if (ctxBody) {
    try {
      const parsed = typeof ctxBody === "string" ? JSON.parse(ctxBody) : ctxBody;
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const innerError = (parsed as { error: unknown }).error;
        if (typeof innerError === "string" && innerError.length > 0) {
          return innerError;
        }
      }
    } catch {
      // ctxBody não é JSON parseável — cai no fallback abaixo
    }
  }

  // Caso 3: fallback para mensagem genérica do error (melhor que "Erro desconhecido")
  if (errorObj?.message && typeof errorObj.message === "string") {
    return errorObj.message;
  }

  return "Erro desconhecido";
}

/**
 * Helper de conveniência: dispara `throw` se houver erro extraído.
 *
 * @example
 * const response = await supabase.functions.invoke("manual-payment", { body: {...} });
 * throwIfEdgeFunctionError(response);
 * return response.data;
 */
export function throwIfEdgeFunctionError(response: { data: unknown; error: unknown }): void {
  const errorMessage = extractEdgeFunctionError(response);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
}
