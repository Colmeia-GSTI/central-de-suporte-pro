import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdjustmentHistoryEntry = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  type: "adjustment" | "renegotiation";
  label: string; // ex: "IGPM 4,87%" ou "Renegociação"
  old_value: number;
  new_value: number;
  percentage: number; // calculated
  notes?: string | null;
};

/**
 * Combina contract_adjustments (reajustes formais por índice)
 * + contract_history(action in ['adjustment','renegotiation']) em uma
 * timeline única ordenada do mais recente para o mais antigo.
 */
export function useContractAdjustmentHistory(contractId: string | undefined) {
  return useQuery({
    queryKey: ["contract-adjustment-history", contractId],
    enabled: !!contractId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AdjustmentHistoryEntry[]> => {
      const [adjRes, histRes] = await Promise.all([
        supabase
          .from("contract_adjustments")
          .select("id, adjustment_date, index_used, index_value, old_monthly_value, new_monthly_value, notes")
          .eq("contract_id", contractId!)
          .order("adjustment_date", { ascending: false }),
        supabase
          .from("contract_history")
          .select("id, created_at, action, changes, comment")
          .eq("contract_id", contractId!)
          .in("action", ["renegotiation"])
          .order("created_at", { ascending: false }),
      ]);

      if (adjRes.error) throw adjRes.error;
      if (histRes.error) throw histRes.error;

      const adjustments: AdjustmentHistoryEntry[] = (adjRes.data ?? []).map((a) => ({
        id: a.id,
        date: a.adjustment_date,
        type: "adjustment",
        label: `${a.index_used} ${Number(a.index_value).toFixed(2)}%`,
        old_value: Number(a.old_monthly_value),
        new_value: Number(a.new_monthly_value),
        percentage: Number(a.index_value),
        notes: a.notes,
      }));

      const renegotiations: AdjustmentHistoryEntry[] = (histRes.data ?? [])
        .map((h) => {
          const ch = (h.changes ?? {}) as { old_value?: number; new_value?: number };
          const oldV = Number(ch.old_value ?? 0);
          const newV = Number(ch.new_value ?? 0);
          if (!oldV && !newV) return null;
          const pct = oldV > 0 ? ((newV - oldV) / oldV) * 100 : 0;
          return {
            id: h.id,
            date: (h.created_at as string).split("T")[0],
            type: "renegotiation" as const,
            label: "Renegociação",
            old_value: oldV,
            new_value: newV,
            percentage: pct,
            notes: h.comment,
          };
        })
        .filter((x): x is AdjustmentHistoryEntry => x !== null);

      return [...adjustments, ...renegotiations].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0
      );
    },
  });
}
