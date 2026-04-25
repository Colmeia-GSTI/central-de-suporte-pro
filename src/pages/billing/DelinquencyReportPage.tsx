import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Mail,
  MessageSquare,
  Phone,
  Search,
  TrendingDown,
  Users,
  Calendar,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DelinquentInvoice {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  installment_number: number | null;
  total_installments: number | null;
  daysOverdue: number;
}

interface DelinquentClient {
  client: {
    id: string;
    name: string;
    email: string | null;
    financial_email: string | null;
    whatsapp: string | null;
    phone: string | null;
  };
  invoices: DelinquentInvoice[];
  totalOverdue: number;
  maxDaysOverdue: number;
}

const AGING_COLORS = {
  "0-15": "hsl(var(--status-warning))",
  "16-30": "hsl(var(--chart-3))",
  "31-60": "hsl(var(--chart-4))",
  "60+": "hsl(var(--destructive))",
};

export default function DelinquencyReportPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [minDaysFilter, setMinDaysFilter] = useState<string>("all");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const { data: delinquentData = [], isLoading } = useQuery({
    queryKey: ["delinquent-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id, invoice_number, amount, due_date, status,
          installment_number, total_installments,
          clients(id, name, email, financial_email, whatsapp, phone)
        `)
        .eq("status", "overdue")
        .order("due_date", { ascending: true });

      if (error) throw error;

      const today = new Date();
      const grouped: Record<string, DelinquentClient> = {};

      for (const inv of data || []) {
        if (!inv.clients) continue;
        
        const clientId = inv.clients.id;
        const daysOverdue = differenceInDays(today, new Date(inv.due_date));

        if (!grouped[clientId]) {
          grouped[clientId] = {
            client: inv.clients,
            invoices: [],
            totalOverdue: 0,
            maxDaysOverdue: 0,
          };
        }

        grouped[clientId].invoices.push({
          ...inv,
          daysOverdue,
        } as DelinquentInvoice);
        grouped[clientId].totalOverdue += Number(inv.amount);
        grouped[clientId].maxDaysOverdue = Math.max(
          grouped[clientId].maxDaysOverdue,
          daysOverdue
        );
      }

      return Object.values(grouped).sort((a, b) => b.totalOverdue - a.totalOverdue);
    },
  });

  const filteredData = useMemo(() => {
    return delinquentData.filter((client) => {
      const matchesSearch = client.client.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      
      const matchesDays = minDaysFilter === "all" || 
        client.maxDaysOverdue >= parseInt(minDaysFilter);

      return matchesSearch && matchesDays;
    });
  }, [delinquentData, searchTerm, minDaysFilter]);

  const summaryStats = useMemo(() => {
    const totalOverdue = delinquentData.reduce((sum, c) => sum + c.totalOverdue, 0);
    const totalClients = delinquentData.length;
    const totalInvoices = delinquentData.reduce((sum, c) => sum + c.invoices.length, 0);
    const avgDaysOverdue = totalInvoices > 0
      ? Math.round(
          delinquentData.reduce(
            (sum, c) => sum + c.invoices.reduce((s, i) => s + i.daysOverdue, 0),
            0
          ) / totalInvoices
        )
      : 0;

    return { totalOverdue, totalClients, totalInvoices, avgDaysOverdue };
  }, [delinquentData]);

  const agingDistribution = useMemo(() => {
    const buckets = { "0-15": 0, "16-30": 0, "31-60": 0, "60+": 0 };
    
    delinquentData.forEach((client) => {
      client.invoices.forEach((inv) => {
        if (inv.daysOverdue <= 15) buckets["0-15"] += inv.amount;
        else if (inv.daysOverdue <= 30) buckets["16-30"] += inv.amount;
        else if (inv.daysOverdue <= 60) buckets["31-60"] += inv.amount;
        else buckets["60+"] += inv.amount;
      });
    });

    return Object.entries(buckets).map(([name, value]) => ({
      name: `${name} dias`,
      value,
    }));
  }, [delinquentData]);

  const topClientsData = useMemo(() => {
    return filteredData.slice(0, 5).map((c) => ({
      name: c.client.name.length > 20 
        ? c.client.name.substring(0, 20) + "..." 
        : c.client.name,
      value: c.totalOverdue,
    }));
  }, [filteredData]);

  const toggleClientSelection = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const toggleClientExpand = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  const selectAll = () => {
    if (selectedClients.size === filteredData.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredData.map((c) => c.client.id)));
    }
  };

  const sendBatchCollection = useMutation({
    mutationFn: async (channel: "email" | "whatsapp") => {
      const selectedClientData = filteredData.filter((c) =>
        selectedClients.has(c.client.id)
      );
      
      const invoiceIds = selectedClientData.flatMap((c) =>
        c.invoices.map((i) => i.id)
      );

      const { data, error } = await supabase.functions.invoke(
        "batch-collection-notification",
        {
          body: {
            invoice_ids: invoiceIds,
            channels: [channel],
            message_template: "reminder",
          },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Cobrança enviada para ${selectedClients.size} cliente(s)`);
      setSelectedClients(new Set());
    },
    onError: (error) => {
      toast.error("Erro ao enviar cobranças: " + error.message);
    },
  });

  const getDaysOverdueBadge = (days: number) => {
    if (days <= 15) return <Badge variant="outline" className="bg-status-warning/20 text-status-warning border-status-warning">0-15 dias</Badge>;
    if (days <= 30) return <Badge variant="outline" className="bg-chart-3/20 text-chart-3 border-chart-3">16-30 dias</Badge>;
    if (days <= 60) return <Badge variant="outline" className="bg-chart-4/20 text-chart-4 border-chart-4">31-60 dias</Badge>;
    return <Badge variant="destructive">60+ dias</Badge>;
  };

  const exportCSV = () => {
    const rows = [
      ["Cliente", "Email", "Telefone", "Faturas Vencidas", "Valor Total", "Maior Atraso (dias)"],
      ...filteredData.map((c) => [
        c.client.name,
        c.client.email || c.client.financial_email || "",
        c.client.whatsapp || c.client.phone || "",
        c.invoices.length.toString(),
        c.totalOverdue.toFixed(2),
        c.maxDaysOverdue.toString(),
      ]),
    ];

    const csvContent = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inadimplencia_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/billing">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Relatório de Inadimplência
              </h1>
              <p className="text-muted-foreground">
                Clientes com faturas vencidas e ações de cobrança
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Vencido</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(summaryStats.totalOverdue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summaryStats.totalInvoices} fatura(s)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Inadimplentes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalClients}</div>
              <p className="text-xs text-muted-foreground">
                cliente(s) com pendências
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dias Médio de Atraso</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.avgDaysOverdue}</div>
              <p className="text-xs text-muted-foreground">dias em média</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Selecionados</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{selectedClients.size}</div>
              <p className="text-xs text-muted-foreground">para ação em lote</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Distribuição por Faixa de Atraso</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={agingDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) =>
                      value > 0 ? `${name}` : ""
                    }
                  >
                    {agingDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={Object.values(AGING_COLORS)[index]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 5 Clientes por Valor</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topClientsData} layout="vertical">
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--destructive))" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg">Clientes Inadimplentes</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-[200px]"
                  />
                </div>
                <Select value={minDaysFilter} onValueChange={setMinDaysFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filtrar atraso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os atrasos</SelectItem>
                    <SelectItem value="15">15+ dias</SelectItem>
                    <SelectItem value="30">30+ dias</SelectItem>
                    <SelectItem value="60">60+ dias</SelectItem>
                    <SelectItem value="90">90+ dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Batch Actions */}
            {selectedClients.size > 0 && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  {selectedClients.size} cliente(s) selecionado(s)
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendBatchCollection.mutate("email")}
                    disabled={sendBatchCollection.isPending}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar Email
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendBatchCollection.mutate("whatsapp")}
                    disabled={sendBatchCollection.isPending}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Enviar WhatsApp
                  </Button>
                </div>
              </div>
            )}

            {/* Client List */}
            <div className="space-y-2">
              {/* Header Row */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  checked={
                    selectedClients.size === filteredData.length &&
                    filteredData.length > 0
                  }
                  onCheckedChange={selectAll}
                />
                <span className="text-sm font-medium flex-1">Selecionar Todos</span>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando...
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">
                    Nenhum cliente inadimplente encontrado
                  </p>
                </div>
              ) : (
                filteredData.map((clientData) => (
                  <Collapsible
                    key={clientData.client.id}
                    open={expandedClients.has(clientData.client.id)}
                    onOpenChange={() => toggleClientExpand(clientData.client.id)}
                  >
                    <div className="border rounded-lg">
                      <div className="flex items-center gap-4 p-4">
                        <Checkbox
                          checked={selectedClients.has(clientData.client.id)}
                          onCheckedChange={() =>
                            toggleClientSelection(clientData.client.id)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        <CollapsibleTrigger className="flex-1 text-left">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{clientData.client.name}</p>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                <span>
                                  {clientData.invoices.length} fatura(s) vencida(s)
                                </span>
                                <span>|</span>
                                <span className="font-semibold text-destructive">
                                  {formatCurrency(clientData.totalOverdue)}
                                </span>
                                <span>|</span>
                                <span>
                                  Maior atraso: {clientData.maxDaysOverdue} dias
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                {(clientData.client.email ||
                                  clientData.client.financial_email) && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {clientData.client.financial_email ||
                                      clientData.client.email}
                                  </span>
                                )}
                                {(clientData.client.whatsapp ||
                                  clientData.client.phone) && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {clientData.client.whatsapp ||
                                      clientData.client.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getDaysOverdueBadge(clientData.maxDaysOverdue)}
                              {expandedClients.has(clientData.client.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent>
                        <div className="border-t px-4 pb-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Fatura</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Atraso</TableHead>
                                <TableHead>Parcela</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {clientData.invoices.map((invoice) => (
                                <TableRow key={invoice.id}>
                                  <TableCell className="font-medium">
                                    #{invoice.invoice_number}
                                  </TableCell>
                                  <TableCell>
                                    {formatCurrency(invoice.amount)}
                                  </TableCell>
                                  <TableCell>
                                    {format(
                                      new Date(invoice.due_date),
                                      "dd/MM/yyyy"
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {getDaysOverdueBadge(invoice.daysOverdue)}
                                  </TableCell>
                                  <TableCell>
                                    {invoice.installment_number &&
                                    invoice.total_installments ? (
                                      <Badge variant="outline">
                                        {invoice.installment_number}/
                                        {invoice.total_installments}
                                      </Badge>
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
