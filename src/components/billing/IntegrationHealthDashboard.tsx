import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Activity, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function IntegrationHealthDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["integration-health-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_integration_health_stats");
      if (error) throw error;
      return data as {
        stale_boletos: number;
        stale_nfse: number;
        failure_rate_24h: number;
        avg_bank_return_hours: number;
        failures_by_hour: { hour: string; count: number }[];
      };
    },
    refetchInterval: 60_000, // refresh every minute
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
      </div>
    );
  }

  const chartData = (stats?.failures_by_hour || []).map(item => ({
    hour: format(new Date(item.hour), "HH:mm", { locale: ptBR }),
    falhas: item.count,
  }));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-status-warning" />
              Boletos Pendentes &gt; 1h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${(stats?.stale_boletos || 0) > 0 ? "text-status-warning" : "text-status-success"}`}>
              {stats?.stale_boletos || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">aguardando processamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-danger" />
              NFS-e Processando &gt; 2h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${(stats?.stale_nfse || 0) > 0 ? "text-status-danger" : "text-status-success"}`}>
              {stats?.stale_nfse || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">notas paradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              Tempo Médio Banco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.avg_bank_return_hours || 0}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">retorno boletos (30 dias)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-status-danger" />
              Taxa de Falha 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${(stats?.failure_rate_24h || 0) > 5 ? "text-status-danger" : "text-foreground"}`}>
              {stats?.failure_rate_24h || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">billing / nfse / banco</p>
          </CardContent>
        </Card>
      </div>

      {/* Failures by Hour Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Falhas por Hora (últimas 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              <div className="text-center">
                <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma falha registrada nas últimas 24h</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(label) => `Hora: ${label}`}
                />
                <Bar dataKey="falhas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
