import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useTechnicianTicketCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["technician-ticket-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      
      const { count, error } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", user.id)
        .in("status", ["open", "in_progress", "waiting"]);
      
      if (error) {
        console.error("Error fetching ticket count:", error);
        return 0;
      }
      
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 120, // 2 minutes (was 30s)
    refetchInterval: 1000 * 300, // 5 minutes (was 1 min)
  });
}
