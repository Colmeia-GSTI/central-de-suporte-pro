/**
 * Formata número para exibição em BRL: 1234.56 -> "1.234,56"
 */
export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formata com símbolo: 1234.56 -> "R$ 1.234,56"
 */
export function formatCurrencyBRLWithSymbol(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Alias for formatCurrencyBRLWithSymbol for convenience
 */
export const formatCurrency = formatCurrencyBRLWithSymbol;

/**
 * Converte string formatada para número. Aceita entrada colada em formatos mistos:
 *   "1.234,56" (pt-BR)   -> 1234.56  (ponto = milhar, vírgula = decimal)
 *   "1234,56"            -> 1234.56  (vírgula = decimal)
 *   "1234.56"            -> 1234.56  (só ponto, sem vírgula -> ponto é decimal)
 *   "1.234"              -> 1.234    (só ponto, sem vírgula -> ponto é decimal)
 */
export function parseCurrencyBRL(value: string): number {
  const cleaned = value.replace(/[^\d.,-]/g, "");
  // Tem vírgula: vírgula é o decimal; qualquer ponto é separador de milhar.
  // Sem vírgula: mantém o ponto como decimal.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return parseFloat(normalized) || 0;
}

/**
 * Aplica máscara durante digitação
 */
export function maskCurrencyBRL(value: string): string {
  const numbers = value.replace(/\D/g, "");
  const cents = parseInt(numbers || "0", 10) / 100;
  return formatCurrencyBRL(cents);
}
