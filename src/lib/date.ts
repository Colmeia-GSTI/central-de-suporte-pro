/**
 * Helpers de formatação de data centralizados.
 *
 * **Por que:** antes deste módulo, `format(new Date(...), "dd/MM/yyyy")` aparecia
 * 19+ vezes em `src/components/billing/` com formatos sutilmente diferentes
 * (`"dd/MM/yyyy"`, `"dd/MM/yy HH:mm"`, `"dd/MM/yyyy 'às' HH:mm"`, etc.). Resultado:
 * mesmo dado renderizado de jeitos inconsistentes em telas diferentes.
 *
 * **Como usar:**
 * ```ts
 * import { formatDate, formatRelative } from "@/lib/date";
 *
 * formatDate("2026-05-08")              // "08/05/2026"
 * formatDate(invoice.due_date, "long")  // "08/05/2026 às 14:30"
 * formatDate(null)                      // "" (não quebra)
 * formatRelative(invoice.created_at)    // "há 3 dias"
 * ```
 *
 * **Timezone-safe:** quando recebe string `YYYY-MM-DD` (date-only), normaliza
 * adicionando `T12:00:00` para evitar que o fuso desloque o dia (problema clássico
 * com `new Date("2026-05-08")` que vira 07/05 em fusos negativos como BRT).
 */

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Variantes de formato pré-definidas.
 * Adicionar nova variant requer atualizar `FORMAT_PATTERNS` abaixo.
 */
export type DateFormatVariant =
  | "short"          // 08/05/2026 (default, mais usado)
  | "short-time"     // 08/05/2026 14:30
  | "long"           // 08/05/2026 às 14:30 (pt-BR formal)
  | "with-seconds"   // 08/05/2026 14:30:45
  | "month-year"     // mai/2026 (competência NFSe)
  | "time-only"      // 14:30
  | "iso-date";      // 2026-05-08 (para inputs date HTML)

const FORMAT_PATTERNS: Record<DateFormatVariant, string> = {
  "short": "dd/MM/yyyy",
  "short-time": "dd/MM/yyyy HH:mm",
  "long": "dd/MM/yyyy 'às' HH:mm",
  "with-seconds": "dd/MM/yyyy HH:mm:ss",
  "month-year": "MMM/yyyy",
  "time-only": "HH:mm",
  "iso-date": "yyyy-MM-dd",
};

/**
 * Aceita Date | string ISO | null | undefined e retorna Date válido OU null.
 * Faz normalização timezone-safe para strings YYYY-MM-DD.
 */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  // String YYYY-MM-DD pura → adicionar hora meio-dia para evitar timezone shift
  // (problema clássico: new Date("2026-05-08") em BRT vira 07/05 22:00)
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value;

  const date = new Date(isoDate);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Formata data segundo variant pré-definida em pt-BR.
 *
 * @param value Date, string ISO, null ou undefined. Strings YYYY-MM-DD são
 *   normalizadas para evitar timezone shift.
 * @param variant Padrão de formatação. Default: "short" (dd/MM/yyyy).
 * @param fallback Texto retornado se value for inválido. Default: "" (string vazia).
 *
 * @example
 * formatDate("2026-05-08")              // "08/05/2026"
 * formatDate("2026-05-08", "long")      // "08/05/2026 às 12:00"
 * formatDate(null)                      // ""
 * formatDate(null, "short", "—")        // "—"
 */
export function formatDate(
  value: Date | string | null | undefined,
  variant: DateFormatVariant = "short",
  fallback: string = ""
): string {
  const date = toDate(value);
  if (!date) return fallback;
  return format(date, FORMAT_PATTERNS[variant], { locale: ptBR });
}

/**
 * Formata data como tempo relativo em pt-BR ("há 3 dias", "em 2 meses", etc.).
 * Usa `formatDistanceToNow` do date-fns por baixo.
 *
 * @example
 * formatRelative(invoice.created_at)              // "há 3 dias"
 * formatRelative(future_date, { addSuffix: true }) // "em 2 meses"
 */
export function formatRelative(
  value: Date | string | null | undefined,
  options: { addSuffix?: boolean } = { addSuffix: true },
  fallback: string = ""
): string {
  const date = toDate(value);
  if (!date) return fallback;
  return formatDistanceToNow(date, { locale: ptBR, ...options });
}

/**
 * Verifica se uma data está no passado (comparação com hora zerada).
 * Útil para checar se contrato/fatura já venceu.
 */
export function isPastDate(value: Date | string | null | undefined): boolean {
  const date = toDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}
