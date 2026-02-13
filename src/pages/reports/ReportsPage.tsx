import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TimeReportTab } from "@/components/reports/TimeReportTab";
import { AdditionalChargesReportTab } from "@/components/reports/AdditionalChargesReportTab";
import { format } from "date-fns";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  paused: "Pausado",
  waiting_third_party: "Aguardando Terceiro",
  no_contact: "Sem Contato",
  resolved: "Resolvido",
  closed: "Fechado",
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

interface TicketReportStats {
  by_status: { status: string; count: number }[] | null;
  by_priority: { priority: string; count: number }[] | null;
  daily_trend: { date: string; created: number; resolved: number }[] | null;
  sla_metrics: { total: number; with_response: number; resolved: number } | null;
}

interface InvoiceReportStats {
  pending_amount: number;
  paid_amount: number;
  overdue_amount: number;
  total_count: number;
  pending_count: number;
  paid_count: number;
  overdue_count: number;
}

interface TechnicianRanking {
  name: string;
  points: number;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState("30");

  const startDate = useMemo(() => 
    subDays(new Date(), parseInt(period)), 
    [period]
  );

  // Single RPC call for all ticket stats
  const { data: ticketStats } = useQuery({
    queryKey: ["report-tickets-rpc", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ticket_report_stats", {
        start_date: startDate.toISOString(),
      });
      if (error) throw error;
      return data as unknown as TicketReportStats;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Single RPC call for invoice stats
  const { data: invoiceStats } = useQuery({
    queryKey: ["report-invoices-rpc", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invoice_report_stats", {
        start_date: startDate.toISOString(),
      });
      if (error) throw error;
      return data as unknown as InvoiceReportStats;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Single RPC call for technician ranking
  const { data: technicianRanking } = useQuery({
    queryKey: ["report-technicians-rpc", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_technician_ranking", {
        start_date: startDate.toISOString(),
        limit_count: 10,
      });
      if (error) throw error;
      return (data as unknown as TechnicianRanking[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Process data for charts (already aggregated from DB)
  const statusData = useMemo(() => 
    ticketStats?.by_status?.map((s) => ({
      name: statusLabels[s.status] || s.status,
      value: s.count,
    })) || [],
    [ticketStats?.by_status]
  );

  const priorityData = useMemo(() => 
    ticketStats?.by_priority?.map((p) => ({
      name: priorityLabels[p.priority] || p.priority,
      value: p.count,
    })) || [],
    [ticketStats?.by_priority]
  );

  const dailyData = useMemo(() => 
    ticketStats?.daily_trend?.map((d) => ({
      date: format(new Date(d.date), "dd/MM", { locale: ptBR }),
      criados: d.created,
      resolvidos: d.resolved,
    })) || [],
    [ticketStats?.daily_trend]
  );

  const slaMetrics = ticketStats?.sla_metrics || { total: 0, with_response: 0, resolved: 0 };

  // Financial data from RPC
  const financialData = useMemo(() => [
    { name: "Pendente", value: invoiceStats?.pending_amount || 0 },
    { name: "Pago", value: invoiceStats?.paid_amount || 0 },
    { name: "Vencido", value: invoiceStats?.overdue_amount || 0 },
  ], [invoiceStats]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
            <p className="text-muted-foreground">
              Análise de desempenho e métricas
            </p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="tickets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tickets">Chamados</TabsTrigger>
            <TabsTrigger value="time">Horas</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
            <TabsTrigger value="services">Serviços</TabsTrigger>
            <TabsTrigger value="performance">Desempenho</TabsTrigger>
            <TabsTrigger value="additionals">Adicionais</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Chamados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{slaMetrics.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Resolvidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">{slaMetrics.resolved}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Taxa de Resolução
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {slaMetrics.total > 0
                      ? ((slaMetrics.resolved / slaMetrics.total) * 100).toFixed(1)
                      : 0}
                    %
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Taxa de Resposta
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {slaMetrics.total > 0
                      ? ((slaMetrics.with_response / slaMetrics.total) * 100).toFixed(1)
                      : 0}
                    %
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Chamados por Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name} (${(percent * 100).toFixed(0)}%)`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Chamados por Prioridade</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={priorityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Tendência de Chamados</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="criados"
                      stackId="1"
                      stroke="#8884d8"
                      fill="#8884d8"
                    />
                    <Area
                      type="monotone"
                      dataKey="resolvidos"
                      stackId="2"
                      stroke="#82ca9d"
                      fill="#82ca9d"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time">
            <TimeReportTab />
          </TabsContent>

          <TabsContent value="financial" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {financialData.map((item) => (
                <Card key={item.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {item.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
                        item.name === "Pago"
                          ? "text-green-600"
                          : item.name === "Vencido"
                          ? "text-destructive"
                          : ""
                      }`}
                    >
                      {formatCurrency(item.value)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição Financeira</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={financialData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {financialData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Receita por Serviço</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Relatório disponível após cadastrar serviços e vincular a contratos ativos.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ranking de Técnicos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={technicianRanking || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip />
                    <Bar dataKey="points" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="additionals" className="space-y-4">
            <AdditionalChargesReportTab startDate={startDate} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
