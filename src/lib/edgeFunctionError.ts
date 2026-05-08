/**
 * Normalize errors returned by supabase.functions.invoke().
 * Edge Functions can fail in two ways:
 *  - `error` is set (network / non-2xx without parseable body)
 *  - `data.success === false` with `data.error` message
 */
export function throwIfEdgeFunctionError({
  data,
  error,
}: {
  data?: any;
  error?: { message?: string } | null;
}): void {
  if (error) {
    throw new Error(error.message || "Erro ao chamar Edge Function");
  }
  if (data && data.success === false) {
    throw new Error(data.error || data.message || "Edge Function retornou erro");
  }
}
