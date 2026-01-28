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
 * Converte string formatada para número: "1.234,56" -> 1234.56
 */
export function parseCurrencyBRL(value: string): number {
  const cleaned = value.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

/**
 * Aplica máscara durante digitação
 */
export function maskCurrencyBRL(value: string): string {
  const numbers = value.replace(/\D/g, "");
  const cents = parseInt(numbers || "0", 10) / 100;
  return formatCurrencyBRL(cents);
}
