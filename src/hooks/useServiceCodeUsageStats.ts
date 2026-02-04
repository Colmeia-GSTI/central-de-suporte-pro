import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UsageStats = Map<string, { count: number; lastUsed: Date | null }>;

export function useServiceCodeUsageStats() {
  const { data: usageStats = new Map() as UsageStats, isLoading } = useQuery({
    queryKey: ["nfse-service-code-usage"],
    queryFn: async (): Promise<UsageStats> => {
      const { data, error } = await supabase
        .from("nfse_history")
        .select("codigo_tributacao, created_at")
        .not("codigo_tributacao", "is", null)
        .in("status", ["autorizada", "pendente", "processando"]);

      if (error) throw error;

      const stats = new Map<string, { count: number; lastUsed: Date | null }>();

      for (const row of data || []) {
        const code = row.codigo_tributacao;
        if (!code) continue;
        
        const createdAt = new Date(row.created_at);
        const existing = stats.get(code) || { count: 0, lastUsed: null };

        stats.set(code, {
          count: existing.count + 1,
          lastUsed:
            !existing.lastUsed || createdAt > existing.lastUsed
              ? createdAt
              : existing.lastUsed,
        });
      }

      return stats;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return { usageStats, isLoading };
}

export function useSortedServiceCodes<T extends { codigo_tributacao: string }>(
  codes: T[],
  usageStats: UsageStats
): T[] {
  return useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return [...codes].sort((a, b) => {
      const statsA = usageStats.get(a.codigo_tributacao);
      const statsB = usageStats.get(b.codigo_tributacao);

      // Criteria 1: Recent first (used in last 30 days)
      const aRecent = statsA?.lastUsed && statsA.lastUsed > thirtyDaysAgo;
      const bRecent = statsB?.lastUsed && statsB.lastUsed > thirtyDaysAgo;

      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;

      // If both are recent, sort by most recent
      if (aRecent && bRecent) {
        return (statsB?.lastUsed?.getTime() || 0) - (statsA?.lastUsed?.getTime() || 0);
      }

      // Criteria 2: Frequent (more than 3 uses)
      const aFrequent = (statsA?.count || 0) > 3;
      const bFrequent = (statsB?.count || 0) > 3;

      if (aFrequent && !bFrequent) return -1;
      if (!aFrequent && bFrequent) return 1;

      // If both are frequent, sort by count
      if (aFrequent && bFrequent) {
        return (statsB?.count || 0) - (statsA?.count || 0);
      }

      // Criteria 3: Alphabetical order
      return a.codigo_tributacao.localeCompare(b.codigo_tributacao);
    });
  }, [codes, usageStats]);
}

export function getUsageBadgeInfo(
  codigoTributacao: string,
  usageStats: UsageStats
): { isRecent: boolean; isFrequent: boolean } {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stats = usageStats.get(codigoTributacao);
  const isRecent = !!(stats?.lastUsed && stats.lastUsed > thirtyDaysAgo);
  const isFrequent = (stats?.count || 0) > 3;

  return { isRecent, isFrequent };
}
