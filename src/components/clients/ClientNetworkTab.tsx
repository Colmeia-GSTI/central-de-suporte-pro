import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, Monitor, Router, Radio, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { NetworkTopologyMap } from "./NetworkTopologyMap";

interface ClientNetworkTabProps {
  clientId: string;
}

export function ClientNetworkTab({ clientId }: ClientNetworkTabProps) {
  // Fetch sites for this client
  const { data: sites, isLoading: loadingSites } = useQuery({
    queryKey: ["network-sites", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("network_sites")
        .select("id, site_code, site_name, device_count, client_count, health_status, last_sync_at, controller_id, unifi_controllers(name, connection_method)")
        .eq("client_id", clientId)
        .order("site_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch UniFi devices for this client
  const { data: devices, isLoading: loadingDevices } = useQuery({
    queryKey: ["unifi-devices", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, hostname, ip_address, mac_address, model, firmware_version, is_online, device_type, last_seen_at, site_id, service_data")
        .eq("client_id", clientId)
        .eq("external_source", "unifi")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch topology for this client
  const { data: topology } = useQuery({
    queryKey: ["network-topology", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("network_topology")
        .select("id, device_mac, device_name, device_port, neighbor_mac, neighbor_name, neighbor_port, connection_type, site_id")
        .eq("client_id", clientId);
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingSites || loadingDevices;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!sites || sites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wifi className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">Nenhum site de rede encontrado para este cliente</p>
        <p className="text-xs text-muted-foreground mt-1">Configure um controller UniFi em Configurações → Integrações → Rede</p>
      </div>
    );
  }

  const onlineDevices = devices?.filter((d) => d.is_online).length || 0;
  const totalDevices = devices?.length || 0;

  function getDeviceIcon(type: string) {
    switch (type) {
      case "gateway": return <Router className="h-4 w-4" />;
      case "switch": return <Monitor className="h-4 w-4" />;
      case "access_point": return <Radio className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  }

  function getDeviceTypeLabel(type: string) {
    switch (type) {
      case "gateway": return "Gateway";
      case "switch": return "Switch";
      case "access_point": return "AP";
      default: return "Outro";
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sites</p>
                <p className="text-2xl font-bold">{sites.length}</p>
              </div>
              <Wifi className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Devices Online</p>
                <p className="text-2xl font-bold">{onlineDevices}/{totalDevices}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-status-success/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clientes Wi-Fi</p>
                <p className="text-2xl font-bold">{sites.reduce((s, site) => s + (site.client_count || 0), 0)}</p>
              </div>
              <Radio className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Topology Map (only if topology data exists) */}
      {topology && topology.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mapa de Topologia</CardTitle>
          </CardHeader>
          <CardContent>
            <NetworkTopologyMap devices={devices || []} topology={topology} />
          </CardContent>
        </Card>
      )}

      {/* Sites */}
      {sites.map((site) => {
        const siteDevices = devices?.filter((d) => d.site_id === site.id) || [];
        const ctrl = (site as any).unifi_controllers;
        const isDirect = ctrl?.connection_method === "direct";

        return (
          <Card key={site.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">{site.site_name}</CardTitle>
                  <Badge variant="outline" className="text-xs">{site.site_code}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{site.device_count} devices</span>
                  {!isDirect && (
                    <Badge variant="secondary" className="text-xs">Cloud</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {siteDevices.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {siteDevices.map((dev) => (
                    <div key={dev.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className={`p-2 rounded-lg ${dev.is_online ? "bg-status-success/10 text-status-success" : "bg-destructive/10 text-destructive"}`}>
                        {getDeviceIcon(dev.device_type || "")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{dev.name}</p>
                          {dev.is_online ? (
                            <CheckCircle2 className="h-3 w-3 text-status-success shrink-0" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive shrink-0" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>{getDeviceTypeLabel(dev.device_type || "")}</span>
                          {dev.ip_address && <span>{dev.ip_address}</span>}
                          {dev.model && <span>{dev.model}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum device neste site</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Warning for cloud-only */}
      {sites.every((s) => (s as any).unifi_controllers?.connection_method === "cloud") && (
        <div className="flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Topologia detalhada e alarmes estão disponíveis apenas com conexão direta (IP/DDNS). Este cliente usa conexão via Portal UniFi.</p>
        </div>
      )}
    </div>
  );
}
