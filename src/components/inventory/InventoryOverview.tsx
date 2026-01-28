import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  WifiOff, 
  Wifi, 
  AlertTriangle, 
  Calendar,
  ExternalLink,
  Ticket,
  CheckCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface MonitoredDevice {
  id: string;
  name: string | null;
  hostname: string | null;
  ip_address: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  device_type: string | null;
  external_source: string | null;
  client_id: string | null;
  clients: { name: string } | null;
}

interface MonitoringAlert {
  id: string;
  level: string;
  title: string;
  message: string | null;
  status: string;
  created_at: string;
  device_id: string;
  monitored_devices: {
    name: string | null;
    hostname: string | null;
    ip_address: string | null;
    client_id: string | null;
    clients: { name: string } | null;
  } | null;
}

interface SoftwareLicense {
  id: string;
  software_name: string;
  expire_date: string | null;
  clients: { name: string } | null;
}

const alertLevelColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  warning: "bg-status-warning text-white",
  info: "bg-status-info text-white",
};

const alertLevelLabels: Record<string, string> = {
  critical: "Crítico",
  warning: "Aviso",
  info: "Informação",
};

export function InventoryOverview() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query: Contadores
  const { data: counters, isLoading: countersLoading } = useQuery({
    queryKey: ["inventory-counters"],
    queryFn: async () => {
      const [devicesResult, alertsResult, licensesResult] = await Promise.all([
        supabase
          .from("monitored_devices")
          .select("is_online", { count: "exact" }),
        supabase
          .from("monitoring_alerts")
          .select("id", { count: "exact" })
          .eq("status", "active"),
        supabase
          .from("software_licenses")
          .select("id", { count: "exact" })
          .gte("expire_date", new Date().toISOString())
          .lte("expire_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
      ]);

      const devices = devicesResult.data || [];
      const online = devices.filter(d => d.is_online).length;
      const offline = devices.filter(d => !d.is_online).length;

      return {
        online,
        offline,
        alerts: alertsResult.count || 0,
        expiringLicenses: licensesResult.count || 0,
      };
    },
  });

  // Query: Dispositivos offline
  const { data: offlineDevices, isLoading: devicesLoading } = useQuery({
    queryKey: ["offline-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, hostname, ip_address, is_online, last_seen_at, device_type, external_source, client_id, clients(name)")
        .eq("is_online", false)
        .order("last_seen_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as MonitoredDevice[];
    },
  });

  // Query: Alertas ativos
  const { data: activeAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoring_alerts")
        .select(`
          id, level, title, message, status, created_at, device_id,
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
        .limit(10);
      
      if (error) throw error;
      return data as MonitoringAlert[];
    },
  });

  // Query: Licenças expirando
  const { data: expiringLicenses, isLoading: licensesLoading } = useQuery({
    queryKey: ["expiring-licenses"],
    queryFn: async () => {
      const now = new Date();
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from("software_licenses")
        .select("id, name, expire_date, clients(name)")
        .gte("expire_date", now.toISOString())
        .lte("expire_date", thirtyDaysFromNow.toISOString())
        .order("expire_date", { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return (data || []).map(d => ({ ...d, software_name: d.name })) as SoftwareLicense[];
    },
  });

  // Mutation: Acknowledge alert
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("monitoring_alerts")
        .update({ status: "acknowledged" })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-counters"] });
      toast({ title: "Alerta reconhecido" });
    },
  });

  const formatLastSeen = (date: string | null) => {
    if (!date) return "Nunca";
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  const getDaysUntilExpiry = (date: string | null) => {
    if (!date) return null;
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={counters?.offline ? "border-destructive/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {countersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-destructive">
                {counters?.offline || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">dispositivos desconectados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Wifi className="h-4 w-4 text-status-success" />
          </CardHeader>
          <CardContent>
            {countersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-status-success">
                {counters?.online || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">dispositivos conectados</p>
          </CardContent>
        </Card>

        <Card className={counters?.alerts ? "border-status-warning/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-status-warning" />
          </CardHeader>
          <CardContent>
            {countersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-status-warning">
                {counters?.alerts || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">alertas pendentes</p>
          </CardContent>
        </Card>

        <Card className={counters?.expiringLicenses ? "border-status-info/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Licenças a Vencer</CardTitle>
            <Calendar className="h-4 w-4 text-status-info" />
          </CardHeader>
          <CardContent>
            {countersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-status-info">
                {counters?.expiringLicenses || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">próximos 30 dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Offline Devices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-destructive" />
            Dispositivos Offline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devicesLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !offlineDevices?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wifi className="h-12 w-12 mx-auto mb-2 text-status-success" />
              <p>Todos os dispositivos estão online!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Última Atividade</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offlineDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      {device.name || device.hostname || "Sem nome"}
                    </TableCell>
                    <TableCell>{device.clients?.name || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {device.ip_address || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="text-xs">
                        {formatLastSeen(device.last_seen_at)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {device.external_source || "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const deviceName = device.name || device.hostname || "Dispositivo";
                          const clientName = device.clients?.name || "";
                          const params = new URLSearchParams({
                            action: "new",
                            title: `[${deviceName}] Dispositivo offline`,
                            description: `Dispositivo: ${deviceName}\nIP: ${device.ip_address || "N/A"}\nCliente: ${clientName}\nÚltima atividade: ${formatLastSeen(device.last_seen_at)}`,
                            ...(device.client_id && { client_id: device.client_id }),
                            priority: "high",
                          });
                          navigate(`/tickets?${params.toString()}`);
                        }}
                      >
                        <Ticket className="h-4 w-4 mr-1" />
                        Abrir Ticket
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning" />
            Alertas de Monitoramento Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !activeAlerts?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-status-success" />
              <p>Nenhum alerta ativo no momento</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nível</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Criado há</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAlerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge className={alertLevelColors[alert.level] || "bg-muted"}>
                        {alertLevelLabels[alert.level] || alert.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{alert.title}</TableCell>
                    <TableCell>
                      {alert.monitored_devices?.name || alert.monitored_devices?.hostname || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatLastSeen(alert.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const deviceName =
                              alert.monitored_devices?.name ||
                              alert.monitored_devices?.hostname ||
                              "Dispositivo";
                            const clientName = alert.monitored_devices?.clients?.name || "";
                            const levelLabel = alertLevelLabels[alert.level] || alert.level;

                            const params = new URLSearchParams({
                              action: "new",
                              title: `[Alerta ${levelLabel}] ${alert.title}`,
                              description: [
                                `Alerta: ${alert.title}`,
                                `Nível: ${levelLabel}`,
                                `Mensagem: ${alert.message || "N/A"}`,
                                ``,
                                `Dispositivo: ${deviceName}`,
                                `IP: ${alert.monitored_devices?.ip_address || "N/A"}`,
                                `Cliente: ${clientName}`,
                              ].join("\n"),
                            });

                            if (alert.monitored_devices?.client_id) {
                              params.set("client_id", alert.monitored_devices.client_id);
                            }

                            navigate(`/tickets?${params.toString()}`);
                          }}
                        >
                          <Ticket className="h-4 w-4 mr-1" />
                          Ticket
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Reconhecer
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Expiring Licenses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-status-info" />
            Licenças Próximas ao Vencimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {licensesLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !expiringLicenses?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma licença expirando nos próximos 30 dias</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Software</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Dias Restantes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringLicenses.map((license) => {
                  const daysLeft = getDaysUntilExpiry(license.expire_date);
                  return (
                    <TableRow key={license.id}>
                      <TableCell className="font-medium">{license.software_name}</TableCell>
                      <TableCell>{license.clients?.name || "-"}</TableCell>
                      <TableCell>
                        {license.expire_date 
                          ? new Date(license.expire_date).toLocaleDateString("pt-BR")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={daysLeft && daysLeft <= 7 ? "destructive" : "secondary"}
                        >
                          {daysLeft} dias
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
