import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Mail, MessageCircle, Send, CheckCircle, XCircle, Clock, Eye, Loader2 } from "lucide-react";

interface MessageStats {
  channel: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
}

export function MessageMetricsDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["message-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_logs")
        .select("channel, status");
      
      if (error) throw error;

      const grouped: Record<string, MessageStats> = {};
      
      (data || []).forEach((msg) => {
        if (!grouped[msg.channel]) {
          grouped[msg.channel] = {
            channel: msg.channel,
            total: 0,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            pending: 0,
          };
        }
        grouped[msg.channel].total++;
        grouped[msg.channel][msg.status as keyof Omit<MessageStats, "channel" | "total">]++;
      });

      return Object.values(grouped);
    },
    refetchInterval: 300000, // 5 minutes (was 30s - reduced 10x)
    staleTime: 120000,
  });

  const totalMessages = stats?.reduce((acc, s) => acc + s.total, 0) || 0;
  const totalDelivered = stats?.reduce((acc, s) => acc + s.delivered + s.read, 0) || 0;
  const totalFailed = stats?.reduce((acc, s) => acc + s.failed, 0) || 0;
  const successRate = totalMessages > 0 ? ((totalDelivered / totalMessages) * 100).toFixed(1) : "0";

  const channelColors: Record<string, string> = {
    email: "hsl(var(--chart-1))",
    whatsapp: "hsl(var(--chart-2))",
    telegram: "hsl(var(--chart-3))",
  };

  const channelIcons: Record<string, React.ReactNode> = {
    email: <Mail className="h-4 w-4" />,
    whatsapp: <MessageCircle className="h-4 w-4" />,
    telegram: <Send className="h-4 w-4" />,
  };

  const channelLabels: Record<string, string> = {
    email: "Email",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
  };

  const pieData = stats?.map((s) => ({
    name: channelLabels[s.channel] || s.channel,
    value: s.total,
    color: channelColors[s.channel] || "hsl(var(--muted-foreground))",
  })) || [];

  const barData = stats?.map((s) => ({
    name: channelLabels[s.channel] || s.channel,
    Enviados: s.sent,
    Entregues: s.delivered,
    Lidos: s.read,
    Falhas: s.failed,
    Pendentes: s.pending,
  })) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enviadas</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages}</div>
            <p className="text-xs text-muted-foreground">mensagens no sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregues</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalDelivered}</div>
            <p className="text-xs text-muted-foreground">entregues ou lidas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhas</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{totalFailed}</div>
            <p className="text-xs text-muted-foreground">não enviadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">entrega efetiva</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pie Chart - Distribution by Channel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Canal</CardTitle>
            <CardDescription>Total de mensagens enviadas por canal</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Nenhuma mensagem registrada
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart - Status by Channel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status por Canal</CardTitle>
            <CardDescription>Detalhamento de status de entrega</CardDescription>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Enviados" fill="hsl(var(--chart-1))" />
                  <Bar dataKey="Entregues" fill="hsl(var(--chart-2))" />
                  <Bar dataKey="Lidos" fill="hsl(var(--chart-3))" />
                  <Bar dataKey="Falhas" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Nenhuma mensagem registrada
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channel Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes por Canal</CardTitle>
          <CardDescription>Métricas detalhadas de cada canal</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {stats?.map((s) => {
              const channelRate = s.total > 0 ? (((s.delivered + s.read) / s.total) * 100).toFixed(1) : "0";
              return (
                <Card key={s.channel} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      {channelIcons[s.channel]}
                      <span className="font-medium">{channelLabels[s.channel] || s.channel}</span>
                      <Badge variant="outline" className="ml-auto">
                        {channelRate}% sucesso
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-medium">{s.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Enviados:</span>
                        <span className="font-medium">{s.sent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Entregues:</span>
                        <span className="font-medium text-green-600">{s.delivered}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lidos:</span>
                        <span className="font-medium text-blue-600">{s.read}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pendentes:</span>
                        <span className="font-medium text-yellow-600">{s.pending}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Falhas:</span>
                        <span className="font-medium text-destructive">{s.failed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(!stats || stats.length === 0) && (
              <div className="col-span-3 text-center text-muted-foreground py-8">
                Nenhuma mensagem registrada ainda
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
