import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CredentialOption {
  id: string;
  label: string;
}

export function useDocCredentialOptions(clientId: string) {
  const { data: options = [], isLoading } = useQuery({
    queryKey: ["doc_credentials_options", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("doc_credentials") as any)
        .select("id, access_type, system_name")
        .eq("client_id", clientId)
        .order("system_name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        label: `[${c.access_type || "—"}] — ${c.system_name || "Sem nome"}`,
      })) as CredentialOption[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  return { options, isLoading };
}
