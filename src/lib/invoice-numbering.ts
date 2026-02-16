/**
 * Invoice Numbering Utilities
 * Handles formatting, validation, and management of invoice numbers
 */

/**
 * Formats an invoice number based on pattern
 * Available patterns:
 * - YYYY-XXXXX: 2024-00001
 * - XXXXXX: 000001
 * - Custom: Can include any combination of above
 */
export function formatInvoiceNumber(
  sequence: number,
  pattern: string = "YYYY-XXXXX",
  prefix?: string
): string {
  const year = new Date().getFullYear().toString();
  const sequencePadded = String(sequence).padStart(5, "0");

  let result = pattern;

  // Replace placeholders
  result = result.replace(/YYYY/g, year);
  result = result.replace(/XXXXX/g, sequencePadded);
  result = result.replace(/XXX/g, sequencePadded.substring(2));

  // Add prefix if provided
  if (prefix && prefix.length > 0) {
    result = `${prefix}-${result}`;
  }

  return result;
}

/**
 * Validates invoice number format
 */
export function validateInvoiceNumberFormat(
  invoiceNumber: unknown,
  pattern?: string
): boolean {
  if (typeof invoiceNumber !== "string" && typeof invoiceNumber !== "number") {
    return false;
  }

  const str = String(invoiceNumber).trim();

  if (pattern === "YYYY-XXXXX") {
    // Expects: 2024-00001
    const regex = /^\d{4}-\d{5}$/;
    return regex.test(str);
  }

  if (pattern === "XXXXXX") {
    // Expects: 000001
    const regex = /^\d{6}$/;
    return regex.test(str);
  }

  // Default: must be non-empty string
  return str.length > 0;
}

/**
 * Parses invoice number to extract sequence
 */
export function parseInvoiceNumber(invoiceNumber: string): {
  prefix?: string;
  year?: number;
  sequence: number;
  raw: string;
} {
  const raw = invoiceNumber.trim();

  // Try to parse YYYY-XXXXX format
  const match = raw.match(/^(?:([A-Z0-9]+)-)?(\d{4})-(\d+)$/);
  if (match) {
    return {
      prefix: match[1],
      year: parseInt(match[2]),
      sequence: parseInt(match[3]),
      raw,
    };
  }

  // Try to parse pure sequence format
  const seqMatch = raw.match(/^(?:([A-Z0-9]+)-)?(\d+)$/);
  if (seqMatch) {
    return {
      prefix: seqMatch[1],
      sequence: parseInt(seqMatch[2]),
      raw,
    };
  }

  // Fallback: return raw
  return {
    sequence: 0,
    raw,
  };
}

/**
 * Detects gaps in invoice number sequence
 */
export function detectSequenceGaps(
  invoiceNumbers: number[],
  maxGap: number = 5
): number[] {
  if (invoiceNumbers.length === 0) return [];

  const sorted = [...invoiceNumbers].sort((a, b) => a - b);
  const gaps: number[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > 1 && gap <= maxGap) {
      for (let j = sorted[i] + 1; j < sorted[i + 1]; j++) {
        gaps.push(j);
      }
    }
  }

  return gaps;
}

/**
 * Generates a recovery number for gaps
 */
export function suggestRecoveryNumber(
  existingNumbers: number[],
  maxNumber: number = 999999
): number {
  if (existingNumbers.length === 0) return 1;

  const sorted = [...existingNumbers].sort((a, b) => a - b);

  // Find first gap
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] > 1) {
      return sorted[i] + 1;
    }
  }

  // If no gaps, suggest next sequential
  const lastNumber = sorted[sorted.length - 1];
  if (lastNumber < maxNumber) {
    return lastNumber + 1;
  }

  // If we've reached max, no suggestion
  return -1;
}

/**
 * Validates invoice number pattern consistency
 */
export function validatePatternConsistency(
  pattern1: string,
  pattern2: string
): boolean {
  // Patterns should have same placeholders
  const extractPlaceholders = (p: string) => {
    const matches = p.match(/YYYY|XXXXX|XXX/g) || [];
    return new Set(matches);
  };

  const placeholders1 = extractPlaceholders(pattern1);
  const placeholders2 = extractPlaceholders(pattern2);

  if (placeholders1.size !== placeholders2.size) return false;

  for (const placeholder of placeholders1) {
    if (!placeholders2.has(placeholder)) return false;
  }

  return true;
}

/**
 * Estimates available invoice numbers with given pattern
 */
export function estimateAvailableNumbers(pattern: string): number {
  const yearMatches = (pattern.match(/YYYY/g) || []).length;
  const longSequenceMatches = (pattern.match(/XXXXX/g) || []).length;
  const shortSequenceMatches = (pattern.match(/XXX/g) || []).length;

  let count = 1;

  // Each YYYY = 9999 combinations (0-9999)
  if (yearMatches > 0) {
    count *= 10000; // All years (0000-9999)
  }

  // Each XXXXX = 100000 combinations (00000-99999)
  if (longSequenceMatches > 0) {
    count *= 100000;
  }

  // Each XXX = 1000 combinations (000-999)
  if (shortSequenceMatches > 0) {
    count *= 1000;
  }

  return count;
}

/**
 * Generate default invoice number config recommendations
 */
export function getNumberingRecommendations(clientName: string): {
  prefix: string;
  pattern: string;
  description: string;
}[] {
  return [
    {
      prefix: "FAT",
      pattern: "YYYY-XXXXX",
      description: "Padrão: FAT-2024-00001 (Ano + Sequencial)",
    },
    {
      prefix: "INV",
      pattern: "XXXXXX",
      description: "Simples: INV-000001 (Sequencial puro)",
    },
    {
      prefix: clientName.substring(0, 3).toUpperCase(),
      pattern: "YYYY-XXXXX",
      description: `Customizado: ${clientName.substring(0, 3).toUpperCase()}-2024-00001`,
    },
  ];
}
