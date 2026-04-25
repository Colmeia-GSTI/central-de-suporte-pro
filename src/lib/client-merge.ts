/**
 * Lógica pura de resolução de campos para merge de clientes.
 * Estratégia híbrida B+A:
 *   - Overrides explícitos (estratégia A) prevalecem sobre tudo
 *   - Caso contrário, valor do destino prevalece (estratégia B)
 *   - Quando destino tem NULL/vazio, copia do source
 */

export type MergeableClient = Record<string, unknown>;

export const MERGEABLE_FIELDS = [
  "name",
  "trade_name",
  "nickname",
  "email",
  "financial_email",
  "phone",
  "whatsapp",
  "address",
  "city",
  "state",
  "zip_code",
  "state_registration",
  "notes",
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Resolve o valor final de cada campo aplicando a estratégia híbrida.
 * Retorna apenas os campos que mudam relativamente ao target.
 */
export function resolveMergedFields(
  source: MergeableClient,
  target: MergeableClient,
  overrides: Partial<Record<MergeableField, string>> = {},
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const field of MERGEABLE_FIELDS) {
    const override = overrides[field];
    if (override !== undefined && override !== null) {
      result[field] = override;
      continue;
    }

    const targetValue = target[field];
    const sourceValue = source[field];

    if (!isEmpty(targetValue)) {
      // Mantém destino — não inclui no resultado (sem alteração)
      continue;
    }

    if (!isEmpty(sourceValue)) {
      result[field] = String(sourceValue);
    }
  }

  return result;
}

/**
 * Para uso no preview/UI: retorna por campo qual será o valor final
 * e a fonte (target | source | override).
 */
export interface FieldResolution {
  field: MergeableField;
  finalValue: string | null;
  origin: "target" | "source" | "override" | "empty";
  conflict: boolean;
}

export function previewMerge(
  source: MergeableClient,
  target: MergeableClient,
  overrides: Partial<Record<MergeableField, string>> = {},
): FieldResolution[] {
  return MERGEABLE_FIELDS.map((field) => {
    const sv = source[field];
    const tv = target[field];
    const ov = overrides[field];
    const conflict = !isEmpty(sv) && !isEmpty(tv) && sv !== tv;

    if (ov !== undefined && ov !== null) {
      return { field, finalValue: ov, origin: "override", conflict };
    }
    if (!isEmpty(tv)) {
      return { field, finalValue: String(tv), origin: "target", conflict };
    }
    if (!isEmpty(sv)) {
      return { field, finalValue: String(sv), origin: "source", conflict };
    }
    return { field, finalValue: null, origin: "empty", conflict: false };
  });
}
