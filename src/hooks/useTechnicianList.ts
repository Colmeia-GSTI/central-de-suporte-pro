import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTechnicianList() {
  return useQuery({
    queryKey: ["technicians-list"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["technician", "manager", "admin"]);
      if (rolesError) throw rolesError;

      const staffIds = [...new Set((rolesData || []).map((r) => r.user_id))];
      if (staffIds.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", staffIds)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}
