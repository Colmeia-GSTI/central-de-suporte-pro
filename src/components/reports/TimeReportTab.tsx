import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExportButton } from "@/components/export/ExportButton";
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
  Cell
} from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Users, Building2, DollarSign } from "lucide-react";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82ca9d"];

interface TimeEntry {
  id: string;
  ticket_id: string;
  user_id: string;
  duration_minutes: number;
  is_billable: boolean;
  started_at: string;
  description: string | null;
  entry_type: string;
  tickets: {
    title: string;
    clients: { id: string; name: string } | null;
  } | null;
  profiles: { full_name: string } | null;
}

export function TimeReportTab() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterTechnician, setFilterTechnician] = useState<string>("all");

  // Buscar entradas de tempo
  const { data: timeEntries = [], isLoading } = useQuery({
    queryKey: ["time-entries-report", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_time_entries")
        .select(`
          id,
          ticket_id,
          user_id,
          duration_minutes,
          is_billable,
          started_at,
          description,
          entry_type,
          tickets!inner(
            title,
            clients(id, name)
          ),
          profiles:user_id(full_name)
        `)
        .gte("started_at", `${dateFrom}T00:00:00`)
        .lte("started_at", `${dateTo}T23:59:59`)
        .order("started_at", { ascending: false });

      if (error) throw error;
      return data as unknown as TimeEntry[];
    },
  });

  // Buscar clientes para filtro
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-filter"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Buscar técnicos para filtro
  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians-filter"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      return data || [];
    },
  });

  // Filtrar dados
  const filteredEntries = timeEntries.filter((entry) => {
    if (filterClient !== "all" && entry.tickets?.clients?.id !== filterClient) {
      return false;
    }
    if (filterTechnician !== "all" && entry.user_id !== filterTechnician) {
      return false;
    }
    return true;
  });

  // Calcular totais
  const totalMinutes = filteredEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const billableMinutes = filteredEntries.reduce(
    (sum, e) => sum + (e.is_billable ? e.duration_minutes : 0),
    0
  );
  const nonBillableMinutes = totalMinutes - billableMinutes;

  // Agrupar por técnico
  const byTechnician = Object.entries(
    filteredEntries.reduce((acc, entry) => {
      const name = entry.profiles?.full_name || "Desconhecido";
      if (!acc[name]) acc[name] = { total: 0, billable: 0 };
      acc[name].total += entry.duration_minutes;
      if (entry.is_billable) acc[name].billable += entry.duration_minutes;
      return acc;
    }, {} as Record<string, { total: number; billable: number }>)
  )
    .map(([name, data]) => ({
      name,
      total: Math.round(data.total / 60 * 10) / 10,
      billable: Math.round(data.billable / 60 * 10) / 10,
      nonBillable: Math.round((data.total - data.billable) / 60 * 10) / 10,
    }))
    .sort((a, b) => b.total - a.total);

  // Agrupar por cliente
  const byClient = Object.entries(
    filteredEntries.reduce((acc, entry) => {
      const name = entry.tickets?.clients?.name || "Sem cliente";
      if (!acc[name]) acc[name] = { total: 0, billable: 0 };
      acc[name].total += entry.duration_minutes;
      if (entry.is_billable) acc[name].billable += entry.duration_minutes;
      return acc;
    }, {} as Record<string, { total: number; billable: number }>)
  )
    .map(([name, data]) => ({
      name,
      value: Math.round(data.total / 60 * 10) / 10,
      billable: Math.round(data.billable / 60 * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value);

  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  // Dados para exportação
  const exportData = filteredEntries.map((entry) => ({
    Data: format(new Date(entry.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
    Técnico: entry.profiles?.full_name || "-",
    Cliente: entry.tickets?.clients?.name || "-",
    Chamado: entry.tickets?.title || "-",
    Duração: formatHours(entry.duration_minutes),
    Faturável: entry.is_billable ? "Sim" : "Não",
    Tipo: entry.entry_type === "stopwatch" ? "Cronômetro" : "Manual",
    Descrição: entry.description || "-",
  }));

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
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
            <div className="space-y-2">
              <Label>Técnico</Label>
              <Select value={filterTechnician} onValueChange={setFilterTechnician}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os técnicos</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.user_id} value={tech.user_id}>
                      {tech.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Total de Horas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatHours(totalMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Horas Faturáveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatHours(billableMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Não Faturáveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{formatHours(nonBillableMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Registros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredEntries.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Horas por Técnico</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byTechnician} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="h" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip formatter={(value: number) => `${value}h`} />
                <Legend />
                <Bar dataKey="billable" name="Faturável" fill="#22c55e" stackId="a" />
                <Bar dataKey="nonBillable" name="Não Faturável" fill="#94a3b8" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horas por Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byClient.slice(0, 6)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}h`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {byClient.slice(0, 6).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value}h`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalhamento de Horas</CardTitle>
          <ExportButton
            data={exportData}
            filename={`relatorio-horas-${dateFrom}-${dateTo}`}
            columns={[
              { key: "Data", label: "Data" },
              { key: "Técnico", label: "Técnico" },
              { key: "Cliente", label: "Cliente" },
              { key: "Chamado", label: "Chamado" },
              { key: "Duração", label: "Duração" },
              { key: "Faturável", label: "Faturável" },
              { key: "Tipo", label: "Tipo" },
              { key: "Descrição", label: "Descrição" },
            ]}
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Chamado</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead>Faturável</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <p className="mt-2 text-muted-foreground">
                        Nenhum registro de tempo encontrado
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.slice(0, 50).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {format(new Date(entry.started_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>{entry.profiles?.full_name || "-"}</TableCell>
                      <TableCell>{entry.tickets?.clients?.name || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {entry.tickets?.title || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatHours(entry.duration_minutes)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.is_billable ? "default" : "secondary"}>
                          {entry.is_billable ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {entry.entry_type === "stopwatch" ? "Cronômetro" : "Manual"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredEntries.length > 50 && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Mostrando 50 de {filteredEntries.length} registros. Exporte para ver todos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
