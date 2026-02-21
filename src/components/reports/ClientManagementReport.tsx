import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Ticket,
  ShieldCheck,
  Clock,
  DollarSign,
  Monitor,
  TrendingUp,
  Download,
} from "lucide-react";
import { ExportButton } from "@/components/export/ExportButton";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientManagementReportProps {
  clientId: string;
}

interface ReportData {
  tickets: {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    avg_resolution_hours: number;
    by_priority: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };
  sla: {
    total_with_deadline: number;
    met: number;
    percentage: number;
  };
  time: {
    total_minutes: number;
    billable_minutes: number;
    non_billable_minutes: number;
  };
  financial: {
    total_billed: number;
    total_paid: number;
    total_pending: number;
    total_overdue: number;
  };
  assets: {
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  };
  monthly_trend: Array<{
    month: string;
    opened: number;
    resolved: number;
  }>;
}

const PRIORITY_COLORS = ["hsl(var(--muted-foreground))", "hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--destructive))"];
const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function ClientManagementReport({ clientId }: ClientManagementReportProps) {
  const [period, setPeriod] = useState("90");

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = subDays(end, parseInt(period));
    return { start: start.toISOString(), end: end.toISOString() };
  }, [period]);

  const { data: report, isLoading } = useQuery({
    queryKey: ["client-management-report", clientId, period],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_client_management_report", {
        p_client_id: clientId,
        p_start_date: dateRange.start,
        p_end_date: dateRange.end,
      });
      if (error) throw error;
      return data as unknown as ReportData;
    },
    enabled: !!clientId,
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ""}`;
  };

  const priorityData = report
    ? Object.entries(report.tickets.by_priority)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({
          name: PRIORITY_LABELS[key] || key,
          value,
        }))
    : [];

  const trendData = report?.monthly_trend.map((item) => ({
    ...item,
    month: format(new Date(item.month + "-01"), "MMM/yy", { locale: ptBR }),
  })) || [];

  const exportData = report
    ? [
        {
          periodo: `Últimos ${period} dias`,
          total_chamados: report.tickets.total,
          chamados_abertos: report.tickets.open,
          chamados_resolvidos: report.tickets.resolved,
          sla_percentual: `${report.sla.percentage}%`,
          horas_trabalhadas: formatHours(report.time.total_minutes),
          valor_faturado: formatCurrency(report.financial.total_billed),
          valor_pago: formatCurrency(report.financial.total_paid),
          valor_pendente: formatCurrency(report.financial.total_pending),
          valor_vencido: formatCurrency(report.financial.total_overdue),
          ativos_total: report.assets.total,
        },
      ]
    : [];

  const exportColumns = [
    { key: "periodo" as const, label: "Período" },
    { key: "total_chamados" as const, label: "Total Chamados" },
    { key: "chamados_abertos" as const, label: "Abertos" },
    { key: "chamados_resolvidos" as const, label: "Resolvidos" },
    { key: "sla_percentual" as const, label: "SLA %" },
    { key: "horas_trabalhadas" as const, label: "Horas Trabalhadas" },
    { key: "valor_faturado" as const, label: "Valor Faturado" },
    { key: "valor_pago" as const, label: "Valor Pago" },
    { key: "valor_pendente" as const, label: "Valor Pendente" },
    { key: "valor_vencido" as const, label: "Valor Vencido" },
    { key: "ativos_total" as const, label: "Total Ativos" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Relatório Gerencial</h3>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 6 meses</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
            </SelectContent>
          </Select>
          <ExportButton
            data={exportData}
            filename={`relatorio-gerencial-${format(new Date(), "yyyy-MM-dd")}`}
            columns={exportColumns}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chamados Resolvidos
            </CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{report.tickets.resolved + report.tickets.closed}</p>
            <p className="text-xs text-muted-foreground">
              de {report.tickets.total} total • Tempo médio: {report.tickets.avg_resolution_hours}h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              SLA Cumprido
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{report.sla.percentage}%</p>
            <p className="text-xs text-muted-foreground">
              {report.sla.met} de {report.sla.total_with_deadline} com prazo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Horas Trabalhadas
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatHours(report.time.total_minutes)}</p>
            <p className="text-xs text-muted-foreground">
              {formatHours(report.time.billable_minutes)} faturáveis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Faturado
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(report.financial.total_billed)}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(report.financial.total_paid)} pago
              {report.financial.total_overdue > 0 && (
                <span className="text-destructive">
                  {" "}• {formatCurrency(report.financial.total_overdue)} vencido
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendência de Chamados</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="opened"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.3)"
                    name="Abertos"
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    stackId="2"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2) / 0.3)"
                    name="Resolvidos"
                  />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem dados no período selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {priorityData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[index % PRIORITY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem chamados no período
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assets Summary */}
      {report.assets.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Inventário de Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{report.assets.total}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ativos</p>
                <p className="text-xl font-bold text-green-600">{report.assets.active}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inativos</p>
                <p className="text-xl font-bold text-muted-foreground">{report.assets.inactive}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Manutenção</p>
                <p className="text-xl font-bold text-amber-600">{report.assets.maintenance}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
