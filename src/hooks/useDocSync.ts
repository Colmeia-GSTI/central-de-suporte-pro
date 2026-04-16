import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SyncLog {
  id: string;
  source: string;
  synced_at: string;
  devices_synced: number;
  details: Record<string, unknown>;
  status: string;
  error_message: string | null;
}

interface SyncResult {
  success: boolean;
  error?: string;
  synced?: number;
  conflicts?: string[];
  total?: number;
  devices?: number;
  vlans?: number;
  firewall?: number;
  vpns?: number;
}

export function useDocSync(clientId: string) {
  const queryClient = useQueryClient();
  const [syncingTrmm, setSyncingTrmm] = useState(false);
  const [syncingUnifi, setSyncingUnifi] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Last sync logs
  const { data: syncLogs } = useQuery({
    queryKey: ["doc-sync-log", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_sync_log" as any)
        .select("id, source, synced_at, devices_synced, details, status, error_message")
        .eq("client_id", clientId)
        .order("synced_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as unknown as SyncLog[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Check if TRMM is mapped for this client via client_external_mappings
  const { data: trmmConfigured } = useQuery({
    queryKey: ["trmm-configured", clientId],
    queryFn: async () => {
      const { data: mapping } = await supabase
        .from("client_external_mappings")
        .select("id")
        .eq("client_id", clientId)
        .eq("external_source", "tactical_rmm")
        .maybeSingle();

      if (!mapping) return false;

      const { data: settings } = await supabase
        .from("integration_settings")
        .select("is_active")
        .eq("integration_type", "tactical_rmm")
        .maybeSingle();

      return !!settings?.is_active;
    },
    staleTime: 300_000,
  });

  // Check if UniFi is configured for this client
  const { data: unifiConfigured } = useQuery({
    queryKey: ["unifi-configured", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("unifi_controllers")
        .select("id")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .limit(1);
      return (data?.length || 0) > 0;
    },
    staleTime: 300_000,
  });

  const lastTrmmSync = syncLogs?.find((l) => l.source === "trmm");
  const lastUnifiSync = syncLogs?.find((l) => l.source === "unifi");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["doc-sync-log", clientId] });
    queryClient.invalidateQueries({ queryKey: ["doc-table", "doc_devices", clientId] });
    queryClient.invalidateQueries({ queryKey: ["doc-table", "doc_vlans", clientId] });
    queryClient.invalidateQueries({ queryKey: ["doc-table", "doc_firewall_rules", clientId] });
    queryClient.invalidateQueries({ queryKey: ["doc-table", "doc_vpn", clientId] });
  };

  const runSync = async (action: "sync_trmm" | "sync_unifi" | "sync_all") => {
    const setLoading = action === "sync_trmm" ? setSyncingTrmm : action === "sync_unifi" ? setSyncingUnifi : setSyncingAll;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-doc-devices", {
        body: { action, client_id: clientId },
      });

      if (error) throw error;

      if (action === "sync_all") {
        const trmmResult = data?.trmm as SyncResult;
        const unifiResult = data?.unifi as SyncResult;
        const msgs: string[] = [];
        if (trmmResult?.success) msgs.push(`TRMM: ${trmmResult.synced || 0} dispositivos`);
        else if (trmmResult?.error) msgs.push(`TRMM: ${trmmResult.error}`);
        if (unifiResult?.success) {
          const parts = [];
          if (unifiResult.devices) parts.push(`${unifiResult.devices} disp.`);
          if (unifiResult.vlans) parts.push(`${unifiResult.vlans} VLANs`);
          if (unifiResult.firewall) parts.push(`${unifiResult.firewall} regras`);
          msgs.push(`UniFi: ${parts.join(", ") || "sincronizado"}`);
        } else if (unifiResult?.error) msgs.push(`UniFi: ${unifiResult.error}`);
        toast.success("Sincronização concluída", { description: msgs.join(" · ") });
      } else if (action === "sync_trmm") {
        const r = data as SyncResult;
        if (r.success) {
          let msg = `${r.synced || 0} dispositivos sincronizados`;
          if (r.conflicts && r.conflicts.length > 0) msg += ` · ${r.conflicts.length} conflitos`;
          toast.success("TRMM sincronizado", { description: msg });
        } else {
          toast.error("Erro no TRMM", { description: r.error });
        }
      } else {
        const r = data as SyncResult;
        if (r.success) {
          const parts = [];
          if (r.devices) parts.push(`${r.devices} dispositivos`);
          if (r.vlans) parts.push(`${r.vlans} VLANs`);
          if (r.firewall) parts.push(`${r.firewall} regras FW`);
          if (r.vpns) parts.push(`${r.vpns} VPNs`);
          toast.success("UniFi sincronizado", { description: parts.join(", ") || "Sincronizado" });
        } else {
          toast.error("Erro no UniFi", { description: r.error });
        }
      }

      invalidateAll();
    } catch (e: any) {
      console.error(`[useDocSync] ${action} error:`, e);
      toast.error("Erro na sincronização", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return {
    syncingTrmm,
    syncingUnifi,
    syncingAll,
    trmmConfigured: trmmConfigured ?? false,
    unifiConfigured: unifiConfigured ?? false,
    lastTrmmSync,
    lastUnifiSync,
    syncTrmm: () => runSync("sync_trmm"),
    syncUnifi: () => runSync("sync_unifi"),
    syncAll: () => runSync("sync_all"),
  };
}
