import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Activity, TrendingUp, Server } from "lucide-react";
import { format, subDays, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UptimeHistoryEntry {
  id: string;
  device_id: string;
  is_online: boolean;
  uptime_percent: number | null;
  checked_at: string;
  response_time_ms: number | null;
}

export function UptimeCharts() {
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("24h");

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-charts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, client_id, clients(name), uptime_percent")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-charts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const getTimeRangeStart = () => {
    const now = new Date();
    switch (timeRange) {
      case "1h":
        return subHours(now, 1).toISOString();
      case "6h":
        return subHours(now, 6).toISOString();
      case "24h":
        return subDays(now, 1).toISOString();
      case "7d":
        return subDays(now, 7).toISOString();
      case "30d":
        return subDays(now, 30).toISOString();
      default:
        return subDays(now, 1).toISOString();
    }
  };

  const { data: uptimeHistory = [], isLoading } = useQuery({
    queryKey: ["uptime-history", selectedDevice, selectedClient, timeRange],
    queryFn: async () => {
      let query = supabase
        .from("uptime_history")
        .select("*, monitored_devices!inner(name, client_id)")
        .gte("checked_at", getTimeRangeStart())
        .order("checked_at", { ascending: true });

      if (selectedDevice !== "all") {
        query = query.eq("device_id", selectedDevice);
      }

      if (selectedClient !== "all") {
        query = query.eq("monitored_devices.client_id", selectedClient);
      }

      const { data, error } = await query.limit(1000);
      if (error) throw error;
      return data as (UptimeHistoryEntry & { monitored_devices: { name: string; client_id: string } })[];
    },
  });

  // Process data for charts
  const processedData = uptimeHistory.reduce((acc, entry) => {
    const hour = format(new Date(entry.checked_at), "HH:mm", { locale: ptBR });
    const existing = acc.find((d) => d.time === hour);
    
    if (existing) {
      existing.count++;
      existing.online += entry.is_online ? 1 : 0;
      existing.uptimeSum += entry.uptime_percent || 0;
      existing.responseSum += entry.response_time_ms || 0;
    } else {
      acc.push({
        time: hour,
        count: 1,
        online: entry.is_online ? 1 : 0,
        uptimeSum: entry.uptime_percent || 0,
        responseSum: entry.response_time_ms || 0,
      });
    }
    return acc;
  }, [] as { time: string; count: number; online: number; uptimeSum: number; responseSum: number }[]);

  const chartData = processedData.map((d) => ({
    time: d.time,
    uptime: d.count > 0 ? (d.uptimeSum / d.count).toFixed(1) : 0,
    availability: d.count > 0 ? ((d.online / d.count) * 100).toFixed(1) : 0,
    responseTime: d.count > 0 ? Math.round(d.responseSum / d.count) : 0,
  }));

  // Calculate stats per client
  const clientStats = clients.map((client) => {
    const clientDevices = devices.filter((d) => d.client_id === client.id);
    const avgUptime = clientDevices.length > 0
      ? clientDevices.reduce((sum, d) => sum + (d.uptime_percent || 0), 0) / clientDevices.length
      : 0;
    return {
      name: client.name,
      devices: clientDevices.length,
      uptime: avgUptime.toFixed(1),
    };
  }).filter((c) => c.devices > 0);

  // Filter devices by selected client
  const filteredDevices = selectedClient === "all"
    ? devices
    : devices.filter((d) => d.client_id === selectedClient);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Última hora</SelectItem>
              <SelectItem value="6h">Últimas 6 horas</SelectItem>
              <SelectItem value="24h">Últimas 24 horas</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedDevice("all"); }}>
            <SelectTrigger>
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <SelectTrigger>
              <SelectValue placeholder="Dispositivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os dispositivos</SelectItem>
              {filteredDevices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="uptime" className="space-y-4">
        <TabsList>
          <TabsTrigger value="uptime" className="gap-2">
            <Activity className="h-4 w-4" />
            Histórico de Uptime
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Por Cliente
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2">
            <Server className="h-4 w-4" />
            Por Dispositivo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uptime">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Uptime e Disponibilidade</CardTitle>
              <CardDescription>
                Evolução do uptime ao longo do tempo
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">Carregando dados...</p>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">
                    Nenhum dado de histórico disponível. Os dados serão coletados durante as sincronizações.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="uptime"
                      name="Uptime %"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="availability"
                      name="Disponibilidade %"
                      stroke="hsl(142.1 76.2% 36.3%)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle>Uptime por Cliente</CardTitle>
              <CardDescription>
                Média de uptime de dispositivos por cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {clientStats.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">Nenhum dispositivo monitorado</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={clientStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={150}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="uptime"
                      name="Uptime %"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle>Uptime por Dispositivo</CardTitle>
              <CardDescription>
                Comparativo de uptime entre dispositivos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredDevices.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">Nenhum dispositivo encontrado</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(300, filteredDevices.length * 40)}>
                  <BarChart 
                    data={filteredDevices.map((d) => ({
                      name: d.name,
                      uptime: d.uptime_percent || 0,
                    }))} 
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={150}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="uptime"
                      name="Uptime %"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
