import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BillingCounters {
  overdueInvoices: number;
  processingBoletos: number;
  pendingNfse: number;
}

export function useBillingCounters() {
  return useQuery({
    queryKey: ["billing-counters"],
    queryFn: async (): Promise<BillingCounters> => {
      const today = new Date().toISOString().split("T")[0];

      // Parallel queries with head: true (no data returned, only count - reduces egress)
      const [overdueResult, processingResult, pendingNfseResult] = await Promise.all([
        // Overdue invoices: status = 'overdue' OR (status = 'pending' AND due_date < today)
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`),

        // Processing boletos: has boleto_url but still pending
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("payment_method", "boleto")
          .eq("status", "pending")
          .not("notes", "is", null)
          .is("boleto_barcode", null),

        // Pending NFS-e
        supabase
          .from("nfse_history")
          .select("id", { count: "exact", head: true })
          .in("status", ["pendente", "processando"]),
      ]);

      return {
        overdueInvoices: overdueResult.count || 0,
        processingBoletos: processingResult.count || 0,
        pendingNfse: pendingNfseResult.count || 0,
      };
    },
    refetchInterval: 300000, // 5 minutes (was 1 min - reduced 5x)
    staleTime: 120000,
  });
}
