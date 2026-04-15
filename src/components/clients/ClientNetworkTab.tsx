import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Wifi, Router, Radio, CheckCircle2, XCircle, AlertTriangle, Network, Shield, FileText, ExternalLink } from "lucide-react";
import { NetworkTopologyMap } from "./NetworkTopologyMap";
import { UnifiConfigForm } from "@/components/settings/integrations/UnifiConfigForm";
import { SourceBadge } from "./documentation/shared/SourceBadge";
import { useUnifiedNetworkDevices } from "@/hooks/useUnifiedNetworkDevices";

interface ClientNetworkTabProps {
  clientId: string;
}

export function ClientNetworkTab({ clientId }: ClientNetworkTabProps) {
  const [, setSearchParams] = useSearchParams();

  const { items: networkDevices, isLoading: loadingDevices, totalCount, onlineCount } = useUnifiedNetworkDevices(clientId);

  // Fetch sites
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

  // Topology
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

  // VLANs
  const { data: vlans = [], isLoading: loadingVlans } = useQuery({
    queryKey: ["doc-vlans-network", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_vlans")
        .select("id, vlan_id, name, purpose, ip_range, gateway, dhcp_enabled, isolated, data_source")
        .eq("client_id", clientId)
        .order("vlan_id");
      if (error) throw error;
      return data;
    },
  });

  // Firewall rules count
  const { data: firewallCount = 0 } = useQuery({
    queryKey: ["doc-firewall-count", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("doc_firewall_rules")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId);
      if (error) throw error;
      return count || 0;
    },
  });

  const isLoading = loadingSites || loadingDevices;
  const hasSites = sites && sites.length > 0;

  function goToDocumentation() {
    setSearchParams({ tab: "documentation" });
  }

  return (
    <div className="space-y-6">
      <UnifiConfigForm clientId={clientId} />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dispositivos de Rede</p>
                <p className="text-2xl font-bold">{loadingDevices ? "—" : `${onlineCount}/${totalCount}`}</p>
                <p className="text-xs text-muted-foreground">online</p>
              </div>
              <Network className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">VLANs Configuradas</p>
                <p className="text-2xl font-bold">{loadingVlans ? "—" : vlans.length}</p>
              </div>
              <Wifi className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={goToDocumentation}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Regras de Firewall</p>
                <p className="text-2xl font-bold">{firewallCount}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Ver em Documentação <ExternalLink className="h-3 w-3" />
                </p>
              </div>
              <Shield className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* Topology Map */}
          {topology && topology.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mapa de Topologia</CardTitle>
              </CardHeader>
              <CardContent>
                <NetworkTopologyMap
                  devices={networkDevices.filter((d) => d.monitoredDevice).map((d) => d.monitoredDevice!)}
                  topology={topology}
                />
              </CardContent>
            </Card>
          )}

          {/* Network devices table */}
          {networkDevices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dispositivos de Rede</CardTitle>
              </CardHeader>
              <CardContent>
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Modelo</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>SSIDs/Portas</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Documentado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {networkDevices.map((dev) => (
                        <TableRow key={dev.key}>
                          <TableCell className="font-medium">{dev.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {getDeviceIcon(dev.deviceType)}
                              <span className="text-xs">{getDeviceTypeLabel(dev.deviceType)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{dev.brandModel || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{dev.ip || "—"}</TableCell>
                          <TableCell className="text-xs">
                            {dev.ssids ? (
                              <span className="text-muted-foreground">{dev.ssids}</span>
                            ) : dev.portCount ? (
                              <span className="text-muted-foreground">{dev.portCount} portas</span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{dev.physicalLocation || "—"}</TableCell>
                          <TableCell>
                            {dev.isOnline === true ? (
                              <Badge className="bg-status-success text-white gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Online
                              </Badge>
                            ) : dev.isOnline === false ? (
                              <Badge className="bg-destructive text-destructive-foreground gap-1">
                                <XCircle className="h-3 w-3" /> Offline
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Desconhecido</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {dev.documented ? (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Sim
                              </Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                    Não
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Este dispositivo não está na Documentação Técnica</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </CardContent>
            </Card>
          )}

          {/* Sites */}
          {hasSites && sites.map((site) => {
            const siteDevices = networkDevices.filter((d) => d.siteId === site.id);
            const ctrl = (site as Record<string, unknown>).unifi_controllers as { name?: string; connection_method?: string } | undefined;
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
                      <span>{siteDevices.length} devices</span>
                      {!isDirect && (
                        <Badge variant="secondary" className="text-xs">Cloud</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {siteDevices.length > 0 ? (
                    <SiteDeviceGrid devices={siteDevices} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum device neste site</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Cloud-only warning */}
          {hasSites && sites.every((s) => {
            const ctrl = (s as Record<string, unknown>).unifi_controllers as { connection_method?: string } | undefined;
            return ctrl?.connection_method === "cloud";
          }) && (
            <div className="flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Topologia detalhada e alarmes estão disponíveis apenas com conexão direta (IP/DDNS). Este cliente usa conexão via Portal UniFi.</p>
            </div>
          )}
        </>
      )}

      {/* VLANs section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">VLANs</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingVlans ? (
            <Skeleton className="h-24 w-full" />
          ) : vlans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID VLAN</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Range IP</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>DHCP</TableHead>
                  <TableHead>Isolada</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vlans.map((vlan) => (
                  <TableRow key={vlan.id}>
                    <TableCell className="font-mono font-medium">{vlan.vlan_id ?? "—"}</TableCell>
                    <TableCell>{vlan.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{vlan.purpose || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{vlan.ip_range || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{vlan.gateway || "—"}</TableCell>
                    <TableCell>{vlan.dhcp_enabled ? "Sim" : "Não"}</TableCell>
                    <TableCell>{vlan.isolated ? "Sim" : "Não"}</TableCell>
                    <TableCell><SourceBadge source={vlan.data_source} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <Network className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">Nenhuma VLAN documentada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sincronize o UniFi na aba Documentação → Seção 12 para importar VLANs automaticamente.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={goToDocumentation}>
                <FileText className="h-4 w-4 mr-1" />
                Ir para Documentação
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* Compact device grid for site cards */
function SiteDeviceGrid({ devices }: { devices: Array<{ key: string; name: string; isOnline: boolean | null; deviceType: string; ip: string; brandModel: string; documented: boolean }> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {devices.map((dev) => (
        <div key={dev.key} className="flex items-center gap-3 rounded-lg border p-3">
          <div className={`p-2 rounded-lg ${dev.isOnline ? "bg-status-success/10 text-status-success" : dev.isOnline === false ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
            {getDeviceIcon(dev.deviceType)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{dev.name}</p>
              {dev.isOnline === true ? (
                <CheckCircle2 className="h-3 w-3 text-status-success shrink-0" />
              ) : dev.isOnline === false ? (
                <XCircle className="h-3 w-3 text-destructive shrink-0" />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>{getDeviceTypeLabel(dev.deviceType)}</span>
              {dev.ip && <span>{dev.ip}</span>}
              {dev.brandModel && <span>{dev.brandModel}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getDeviceIcon(type: string) {
  switch (type) {
    case "gateway":
    case "router":
      return <Router className="h-4 w-4" />;
    case "access_point":
      return <Radio className="h-4 w-4" />;
    default:
      return <Network className="h-4 w-4" />;
  }
}

function getDeviceTypeLabel(type: string) {
  switch (type) {
    case "gateway": return "Gateway";
    case "router": return "Roteador";
    case "switch": return "Switch";
    case "access_point": return "AP";
    case "nas": return "NAS";
    default: return "Outro";
  }
}
