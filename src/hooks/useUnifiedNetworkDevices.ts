import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DocDevice {
  id: string;
  name: string | null;
  device_type: string | null;
  brand_model: string | null;
  ip_local: string | null;
  mac_address: string | null;
  firmware: string | null;
  physical_location: string | null;
  port_count: number | null;
  ssids: string | null;
  status: string | null;
  data_source: string | null;
  unifi_device_id: string | null;
  connected_clients: number | null;
}

interface MonitoredDevice {
  id: string;
  name: string | null;
  hostname: string | null;
  ip_address: string | null;
  mac_address: string | null;
  model: string | null;
  firmware_version: string | null;
  is_online: boolean | null;
  device_type: string | null;
  last_seen_at: string | null;
  site_id: string | null;
  service_data: unknown;
}

export interface UnifiedNetworkDevice {
  key: string;
  name: string;
  deviceType: string;
  brandModel: string;
  ip: string;
  ssids: string;
  portCount: number | null;
  physicalLocation: string;
  isOnline: boolean | null;
  lastSeenAt: string | null;
  documented: boolean;
  siteId: string | null;
  docDevice: DocDevice | null;
  monitoredDevice: MonitoredDevice | null;
}

const NETWORK_DEVICE_TYPES = ["switch", "access_point", "nas", "router", "other", "gateway"];

export function useUnifiedNetworkDevices(clientId: string) {
  const { data: docDevices = [], isLoading: loadingDoc } = useQuery({
    queryKey: ["doc-devices-network", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_devices")
        .select("id, name, device_type, brand_model, ip_local, mac_address, firmware, physical_location, port_count, ssids, status, data_source, unifi_device_id, connected_clients")
        .eq("client_id", clientId)
        .in("device_type", NETWORK_DEVICE_TYPES)
        .order("name");
      if (error) throw error;
      return data as DocDevice[];
    },
  });

  const { data: monitoredDevices = [], isLoading: loadingMonitored } = useQuery({
    queryKey: ["unifi-devices", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, hostname, ip_address, mac_address, model, firmware_version, is_online, device_type, last_seen_at, site_id, service_data")
        .eq("client_id", clientId)
        .eq("external_source", "unifi")
        .order("name");
      if (error) throw error;
      return data as MonitoredDevice[];
    },
  });

  const items = useMemo(() => {
    const result: UnifiedNetworkDevice[] = [];
    const usedMonitoredIds = new Set<string>();

    // Match doc_devices with monitored_devices
    for (const doc of docDevices) {
      let matched: MonitoredDevice | null = null;

      if (doc.unifi_device_id) {
        matched = monitoredDevices.find(
          (m) => m.name?.toLowerCase() === doc.name?.toLowerCase()
        ) || null;
      }
      if (!matched) {
        matched = monitoredDevices.find(
          (m) => !usedMonitoredIds.has(m.id) && m.name?.toLowerCase() === doc.name?.toLowerCase()
        ) || null;
      }
      if (!matched && doc.mac_address) {
        matched = monitoredDevices.find(
          (m) => !usedMonitoredIds.has(m.id) && m.mac_address?.toLowerCase() === doc.mac_address?.toLowerCase()
        ) || null;
      }

      if (matched) usedMonitoredIds.add(matched.id);

      result.push({
        key: `doc-${doc.id}`,
        name: doc.name || "Sem nome",
        deviceType: doc.device_type || "other",
        brandModel: doc.brand_model || matched?.model || "",
        ip: doc.ip_local
          ? doc.ip_local.split(",")[0].trim()
          : matched?.ip_address || "",
        ssids: doc.ssids || "",
        portCount: doc.port_count,
        physicalLocation: doc.physical_location || "",
        isOnline: matched ? matched.is_online : null,
        lastSeenAt: matched?.last_seen_at || null,
        documented: true,
        siteId: matched?.site_id || null,
        docDevice: doc,
        monitoredDevice: matched,
      });
    }

    // Remaining monitored_devices not matched to any doc
    for (const mon of monitoredDevices) {
      if (usedMonitoredIds.has(mon.id)) continue;

      result.push({
        key: `mon-${mon.id}`,
        name: mon.name || mon.hostname || "Sem nome",
        deviceType: mon.device_type || "other",
        brandModel: mon.model || "",
        ip: mon.ip_address || "",
        ssids: "",
        portCount: null,
        physicalLocation: "",
        isOnline: mon.is_online,
        lastSeenAt: mon.last_seen_at,
        documented: false,
        siteId: mon.site_id,
        docDevice: null,
        monitoredDevice: mon,
      });
    }

    return result;
  }, [docDevices, monitoredDevices]);

  const onlineCount = items.filter((d) => d.isOnline === true).length;

  return {
    items,
    isLoading: loadingDoc || loadingMonitored,
    totalCount: items.length,
    onlineCount,
    monitoredDevices,
  };
}
