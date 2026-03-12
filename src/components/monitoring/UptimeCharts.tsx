import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Activity, Server } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SOURCE_COLORS: Record<string, string> = {
  tactical_rmm: "hsl(217 91% 60%)",
  checkmk: "hsl(142 76% 36%)",
  unifi: "hsl(270 70% 60%)",
  manual: "hsl(var(--muted-foreground))",
};

const SOURCE_LABELS: Record<string, string> = {
  tactical_rmm: "Tactical RMM",
  checkmk: "CheckMK",
  unifi: "UniFi",
};

export function UptimeCharts() {
  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-charts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, client_id, is_online, external_source, last_seen_at, clients(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Devices by source
  const sourceData = Object.entries(
    devices.reduce((acc, d) => {
      const src = d.external_source || "manual";
      if (!acc[src]) acc[src] = { online: 0, offline: 0 };
      if (d.is_online) acc[src].online++;
      else acc[src].offline++;
      return acc;
    }, {} as Record<string, { online: number; offline: number }>)
  ).map(([source, counts]) => ({
    name: SOURCE_LABELS[source] || source,
    online: counts.online,
    offline: counts.offline,
    total: counts.online + counts.offline,
    color: SOURCE_COLORS[source] || SOURCE_COLORS.manual,
  }));

  // Devices by client
  const clientData = Object.entries(
    devices.reduce((acc, d) => {
      const clientName = (d.clients as { name: string } | null)?.name || "Sem Cliente";
      if (!acc[clientName]) acc[clientName] = { online: 0, offline: 0 };
      if (d.is_online) acc[clientName].online++;
      else acc[clientName].offline++;
      return acc;
    }, {} as Record<string, { online: number; offline: number }>)
  )
    .map(([name, counts]) => ({
      name,
      online: counts.online,
      offline: counts.offline,
      total: counts.online + counts.offline,
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Pie chart data for online/offline
  const onlineCount = devices.filter((d) => d.is_online).length;
  const offlineCount = devices.filter((d) => !d.is_online).length;
  const pieData = [
    { name: "Online", value: onlineCount, color: "hsl(142 76% 36%)" },
    { name: "Offline", value: offlineCount, color: "hsl(0 84% 60%)" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sources" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sources" className="gap-2">
            <Activity className="h-4 w-4" />
            Por Origem
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <Server className="h-4 w-4" />
            Por Cliente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Dispositivos por Origem</CardTitle>
                <CardDescription>
                  Distribuição de dispositivos por sistema de monitoramento
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sourceData.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Nenhum dispositivo monitorado</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={sourceData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="online" name="Online" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="offline" name="Offline" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Geral</CardTitle>
                <CardDescription>Proporção de dispositivos online vs offline</CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Nenhum dispositivo</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle>Dispositivos por Cliente</CardTitle>
              <CardDescription>Status de dispositivos agrupados por cliente</CardDescription>
            </CardHeader>
            <CardContent>
              {clientData.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">Nenhum dispositivo monitorado</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(300, clientData.length * 40)}>
                  <BarChart data={clientData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
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
                    <Legend />
                    <Bar dataKey="online" name="Online" fill="hsl(142 76% 36%)" stackId="a" />
                    <Bar dataKey="offline" name="Offline" fill="hsl(0 84% 60%)" stackId="a" radius={[0, 4, 4, 0]} />
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
