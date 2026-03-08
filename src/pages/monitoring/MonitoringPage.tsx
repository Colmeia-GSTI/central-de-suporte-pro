import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { usePermissions } from "@/hooks/usePermissions";
import { useDebounce } from "@/hooks/useDebounce";
// Removed: useRealtimeMonitoring - now handled by unified realtime hook
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Server,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Bell,
  RefreshCw,
  BarChart3,
  Layers,
  Building2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { UptimeCharts } from "@/components/monitoring/UptimeCharts";
import { GroupedAlertsTable } from "@/components/monitoring/GroupedAlertsTable";

type DeviceWithClient = Tables<"monitored_devices"> & {
  clients: { name: string } | null;
};

type AlertWithDevice = Tables<"monitoring_alerts"> & {
  monitored_devices: {
    name: string;
    hostname: string | null;
    ip_address: string | null;
    client_id: string | null;
    clients: { name: string } | null;
  } | null;
};

type GroupBy = "none" | "client" | "device";

const STORAGE_KEYS = {
  groupBy: "monitoring_groupBy",
  levelFilter: "monitoring_levelFilter",
};

export default function MonitoringPage() {
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [levelFilter, setLevelFilter] = useState<Enums<"alert_level"> | "all">(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.levelFilter);
    return saved === "critical" || saved === "warning" || saved === "info" 
      ? saved 
      : "all";
  });
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.groupBy);
    return saved === "client" || saved === "device" ? saved : "none";
  });
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManageMonitoring = can("monitoring", "manage");

  // Persist preferences to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.levelFilter, levelFilter);
  }, [levelFilter]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.groupBy, groupBy);
  }, [groupBy]);

  // Debounce search to avoid excessive queries
  const debouncedSearch = useDebounce(search, 300);

  // Real-time updates now handled by useUnifiedRealtime in App.tsx

  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ["devices", debouncedSearch],
    queryFn: async () => {
      let query = supabase
        .from("monitored_devices")
        .select("*, clients(name)")
        .order("name");

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,hostname.ilike.%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DeviceWithClient[];
    },
  });

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ["alerts", levelFilter],
    queryFn: async () => {
      let query = supabase
        .from("monitoring_alerts")
        .select(`
          *, 
          monitored_devices(
            name, 
            hostname, 
            ip_address, 
            client_id, 
            clients(name)
          )
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);

      if (levelFilter !== "all") {
        query = query.eq("level", levelFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AlertWithDevice[];
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("monitoring_alerts")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const acknowledgeMultipleMutation = useMutation({
    mutationFn: async (alertIds: string[]) => {
      const { error } = await supabase
        .from("monitoring_alerts")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .in("id", alertIds);
      if (error) throw error;
      return alertIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success(`${count} alerta(s) reconhecido(s)`);
      setSelectedAlerts([]);
    },
  });

  const onlineDevices = devices.filter((d) => d.is_online).length;
  const offlineDevices = devices.filter((d) => !d.is_online).length;
  const criticalAlerts = alerts.filter((a) => a.level === "critical").length;
  const devicesWithUptime = devices.filter((d) => d.uptime_percent != null);
  const uptimeAverage = devicesWithUptime.length > 0
    ? devicesWithUptime.reduce((acc, d) => acc + (d.uptime_percent || 0), 0) / devicesWithUptime.length
    : 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Trigger sync from integrations
      const { data: checkmkSettings } = await supabase
        .from("integration_settings")
        .select("is_active")
        .eq("integration_type", "checkmk")
        .single();

      const { data: tacticalSettings } = await supabase
        .from("integration_settings")
        .select("is_active")
        .eq("integration_type", "tactical_rmm")
        .single();

      if (checkmkSettings?.is_active) {
        await supabase.functions.invoke("checkmk-sync", {
          body: { action: "sync" },
        });
      }

      if (tacticalSettings?.is_active) {
        await supabase.functions.invoke("tactical-rmm-sync", {
          body: { action: "sync" },
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["devices"] });
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Sincronização concluída");
    } catch (error) {
      logger.error("Error refreshing monitoring", "Monitoring", { error: String(error) });
      toast.error("Erro ao sincronizar");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Monitoramento</h1>
            <p className="text-muted-foreground">
              Status de dispositivos e alertas em tempo real
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Dispositivos</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{devices.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Online</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-status-success">{onlineDevices}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offline</CardTitle>
              <XCircle className="h-4 w-4 text-status-danger" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-status-danger">{offlineDevices}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alertas Críticos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-priority-critical" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-priority-critical">{criticalAlerts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uptime Médio</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{uptimeAverage.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="devices" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <TabsList>
                <TabsTrigger value="devices" className="gap-2">
                  <Server className="h-4 w-4" />
                  Dispositivos
                </TabsTrigger>
                <TabsTrigger value="alerts" className="gap-2">
                  <Bell className="h-4 w-4" />
                  Alertas ({alerts.length})
                </TabsTrigger>
                <TabsTrigger value="charts" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Gráficos
                </TabsTrigger>
              </TabsList>

              <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as Enums<"alert_level"> | "all")}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filtrar nível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os níveis</SelectItem>
                  <SelectItem value="critical">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-priority-critical" />
                      Crítico
                    </div>
                  </SelectItem>
                  <SelectItem value="warning">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-priority-high" />
                      Aviso
                    </div>
                  </SelectItem>
                  <SelectItem value="info">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-status-progress" />
                      Info
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
                <SelectTrigger className="w-[180px]">
                  <Layers className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Agrupar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem agrupamento</SelectItem>
                  <SelectItem value="client">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Por Cliente
                    </div>
                  </SelectItem>
                  <SelectItem value="device">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      Por Dispositivo
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar dispositivos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <TabsContent value="devices">
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Uptime</TableHead>
                    <TableHead>Última Verificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingDevices ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : devices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Server className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-2 text-muted-foreground">
                          Nenhum dispositivo monitorado
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    devices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          {device.is_online ? (
                            <Badge className="bg-status-success text-white">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Online
                            </Badge>
                          ) : (
                            <Badge className="bg-status-danger text-white">
                              <XCircle className="mr-1 h-3 w-3" />
                              Offline
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{device.name}</p>
                            {device.hostname && (
                              <p className="text-sm text-muted-foreground">
                                {device.hostname}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{device.clients?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {device.ip_address || "-"}
                        </TableCell>
                        <TableCell>
                          {device.uptime_percent ? (
                            <div className="flex items-center gap-2">
                              <Activity className="h-4 w-4 text-muted-foreground" />
                              <span>{device.uptime_percent.toFixed(1)}%</span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {device.last_seen_at ? (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(device.last_seen_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="alerts">
            {selectedAlerts.length > 0 && canManageMonitoring && (
              <div className="flex items-center gap-2 p-4 mb-4 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">
                  {selectedAlerts.length} selecionado(s)
                </span>
                <Button
                  size="sm"
                  onClick={() => acknowledgeMultipleMutation.mutate(selectedAlerts)}
                  disabled={acknowledgeMultipleMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Reconhecer Selecionados
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedAlerts([])}
                >
                  Limpar seleção
                </Button>
              </div>
            )}

            <GroupedAlertsTable
              alerts={alerts}
              isLoading={loadingAlerts}
              selectedAlerts={selectedAlerts}
              setSelectedAlerts={setSelectedAlerts}
              onAcknowledge={(alertId) => acknowledgeAlertMutation.mutate(alertId)}
              groupBy={groupBy}
            />
          </TabsContent>

          <TabsContent value="charts">
            <UptimeCharts />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
