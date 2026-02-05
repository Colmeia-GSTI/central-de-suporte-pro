import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  ArrowRightLeft,
  Loader2,
  XCircle,
  Link2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { AgingReportWidget } from "./AgingReportWidget";
import { EconomicIndicesWidget } from "./EconomicIndicesWidget";

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pending: { label: "Pendente", icon: <Clock className="h-3 w-3" />, className: "bg-status-warning/20 text-status-warning border-status-warning/30" },
  matched: { label: "Conciliado", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-status-success/20 text-status-success border-status-success/30" },
  unmatched: { label: "Não conciliado", icon: <AlertTriangle className="h-3 w-3" />, className: "bg-status-danger/20 text-status-danger border-status-danger/30" },
  ignored: { label: "Ignorado", icon: <XCircle className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
};

export function BankReconciliationTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["bank-reconciliation", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("bank_reconciliation")
        .select("*, invoices(invoice_number, amount, client_id, clients(name))")
        .order("bank_date", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: unmatchedInvoices = [] } = useQuery({
    queryKey: ["unmatched-paid-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, paid_date, client_id, clients(name)")
        .eq("status", "paid")
        .order("paid_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

  const filteredEntries = entries.filter((e: any) =>
    !search || e.bank_description?.toLowerCase().includes(search.toLowerCase()) ||
    e.bank_reference?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    pending: entries.filter((e: any) => e.status === "pending").length,
    matched: entries.filter((e: any) => e.status === "matched").length,
    unmatched: entries.filter((e: any) => e.status === "unmatched").length,
    total: entries.length,
  };

  const matchRate = stats.total > 0 ? ((stats.matched / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-warning">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">aguardando conciliação</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conciliados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-success">{stats.matched}</div>
            <p className="text-xs text-muted-foreground">vinculados a faturas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Não Conciliados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-danger">{stats.unmatched}</div>
            <p className="text-xs text-muted-foreground">sem correspondência</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conciliação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matchRate}%</div>
            <p className="text-xs text-muted-foreground">de {stats.total} lançamentos</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging + Indices Side-by-Side */}
      <div className="grid gap-4 md:grid-cols-2">
        <AgingReportWidget />
        <EconomicIndicesWidget />
      </div>

      {/* Reconciliation Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Lançamentos Bancários
              </CardTitle>
              <CardDescription>
                Compare lançamentos do extrato bancário com faturas do sistema
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="matched">Conciliados</SelectItem>
                <SelectItem value="unmatched">Não conciliados</SelectItem>
                <SelectItem value="ignored">Ignorados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Nenhum lançamento bancário</p>
              <p className="text-sm">Os lançamentos serão importados automaticamente via webhook do banco.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry: any) => {
                  const config = statusConfig[entry.status] || statusConfig.pending;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">
                        {format(new Date(entry.bank_date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {entry.bank_description}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(entry.bank_amount)}
                      </TableCell>
                      <TableCell>
                        {entry.invoices ? (
                          <div className="flex items-center gap-1">
                            <Link2 className="h-3 w-3 text-status-success" />
                            <span className="font-mono text-xs">#{entry.invoices.invoice_number}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={config.className}>
                          {config.icon}
                          <span className="ml-1">{config.label}</span>
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
