import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClientMonitoredDevice = {
  id: string;
  hostname: string | null;
  name: string | null;
  is_online: boolean | null;
};

export function useClientMonitoredDevices(clientId: string | null | undefined) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["client-monitored-devices", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, hostname, name, is_online")
        .eq("client_id", clientId)
        .order("hostname", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ClientMonitoredDevice[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
  return { items, isLoading };
}
