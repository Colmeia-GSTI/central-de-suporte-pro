import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conta convites ainda pendentes (não aceitos e não expirados).
 * Usado para badge no menu de Configurações.
 */
export function usePendingInvitesCount() {
  return useQuery({
    queryKey: ["pending-invites-count"],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("pending_invites")
        .select("id", { count: "exact", head: true })
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString());
      if (error) {
        // tabela ainda não existe? não quebrar UI
        console.warn("[usePendingInvitesCount]", error.message);
        return 0;
      }
      return count ?? 0;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}
