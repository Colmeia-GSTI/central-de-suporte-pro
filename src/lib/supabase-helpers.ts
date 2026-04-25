/**
 * Helpers para normalizar respostas do supabase-js / PostgREST.
 *
 * Alguns embeds (`select("..., relacao(*)")`) podem ser tipados/retornados
 * como ARRAY mesmo quando a relação é 1:1, dependendo da versão do
 * supabase-js e da forma como a FK foi declarada. Este helper normaliza
 * para um único objeto ou null, evitando crashes do tipo
 * "Cannot read properties of undefined (reading 'name')".
 */
export function unwrapEmbed<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null;
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed;
}
