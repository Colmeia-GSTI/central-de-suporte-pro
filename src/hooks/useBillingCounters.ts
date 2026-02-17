import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BillingCounters {
  overdueInvoices: number;
  processingBoletos: number;
  pendingNfse: number;
  errorCount: number;
}

export function useBillingCounters() {
  return useQuery({
    queryKey: ["billing-counters"],
    queryFn: async (): Promise<BillingCounters> => {
      const today = new Date().toISOString().split("T")[0];

      const [overdueResult, processingResult, pendingNfseResult, boletoErrorResult, nfseErrorResult, emailErrorResult] = await Promise.all([
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`),

        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("payment_method", "boleto")
          .eq("status", "pending")
          .not("notes", "is", null)
          .is("boleto_barcode", null),

        supabase
          .from("nfse_history")
          .select("id", { count: "exact", head: true })
          .in("status", ["pendente", "processando"]),

        // Boleto errors
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("boleto_status", "erro"),

        // NFS-e errors
        supabase
          .from("nfse_history")
          .select("id", { count: "exact", head: true })
          .in("status", ["erro", "rejeitada"]),

        // Email errors
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("email_status", "erro"),
      ]);

      return {
        overdueInvoices: overdueResult.count || 0,
        processingBoletos: processingResult.count || 0,
        pendingNfse: pendingNfseResult.count || 0,
        errorCount: (boletoErrorResult.count || 0) + (nfseErrorResult.count || 0) + (emailErrorResult.count || 0),
      };
    },
    refetchInterval: 300000,
    staleTime: 120000,
  });
}
