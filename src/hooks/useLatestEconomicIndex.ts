import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type IndexType = "IGPM" | "IPCA" | "INPC";

/**
 * Retorna o último índice acumulado em 12 meses para IGPM/IPCA/INPC.
 * Usado pelo botão "Buscar índice atual" no dialog de reajuste.
 */
export function useLatestEconomicIndex(indexType: IndexType | string | null | undefined) {
  return useQuery({
    queryKey: ["latest-economic-index", indexType],
    enabled: !!indexType && indexType !== "FIXO",
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_indices")
        .select("index_type, reference_date, accumulated_12m, value")
        .eq("index_type", indexType as string)
        .order("reference_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
