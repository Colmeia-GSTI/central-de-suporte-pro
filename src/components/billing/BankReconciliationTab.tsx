import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  ArrowRightLeft,
  Loader2,
  XCircle,
  Link2,
  Sparkles,
  Wand2,
  Check,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { AgingReportWidget } from "./AgingReportWidget";
import { EconomicIndicesWidget } from "./EconomicIndicesWidget";
import { ReconciliationMatchDialog } from "./ReconciliationMatchDialog";

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pending: { label: "Pendente", icon: <Clock className="h-3 w-3" />, className: "bg-status-warning/20 text-status-warning border-status-warning/30" },
  matched: { label: "Conciliado", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-status-success/20 text-status-success border-status-success/30" },
  suggested: { label: "Sugerido", icon: <Sparkles className="h-3 w-3" />, className: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  unmatched: { label: "Não conciliado", icon: <AlertTriangle className="h-3 w-3" />, className: "bg-status-danger/20 text-status-danger border-status-danger/30" },
  ignored: { label: "Ignorado", icon: <XCircle className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
};

export function BankReconciliationTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [matchDialog, setMatchDialog] = useState<{ open: boolean; entry: any | null }>({ open: false, entry: null });
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  const autoReconcileMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("auto_reconcile_bank_entries");
      if (error) throw error;
      return data as { matched: number; suggested: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      toast.success(`Conciliação automática: ${data.matched} conciliados, ${data.suggested} sugeridos`);
    },
    onError: () => {
      toast.error("Erro ao executar conciliação automática");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const entry = entries.find((e: any) => e.id === entryId);
      if (!entry) throw new Error("Entrada não encontrada");

      const { error } = await supabase
        .from("bank_reconciliation")
        .update({
          status: "matched",
          matched_at: new Date().toISOString(),
          matched_by: user?.id || null,
        })
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      toast.success("Sugestão aprovada");
    },
    onError: () => {
      toast.error("Erro ao aprovar sugestão");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from("bank_reconciliation")
        .update({
          status: "unmatched",
          invoice_id: null,
          match_score: null,
          match_candidates: null,
        })
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      toast.success("Sugestão rejeitada");
    },
    onError: () => {
      toast.error("Erro ao rejeitar sugestão");
    },
  });

  const filteredEntries = entries.filter((e: any) =>
    !search || e.bank_description?.toLowerCase().includes(search.toLowerCase()) ||
    e.bank_reference?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    pending: entries.filter((e: any) => e.status === "pending").length,
    matched: entries.filter((e: any) => e.status === "matched").length,
    suggested: entries.filter((e: any) => e.status === "suggested").length,
    unmatched: entries.filter((e: any) => e.status === "unmatched").length,
    total: entries.length,
  };

  const matchRate = stats.total > 0 ? ((stats.matched / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
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
            <CardTitle className="text-sm font-medium">Sugeridos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.suggested}</div>
            <p className="text-xs text-muted-foreground">aguardando aprovação</p>
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
            <Button
              onClick={() => autoReconcileMutation.mutate()}
              disabled={autoReconcileMutation.isPending || stats.pending === 0}
              variant="outline"
              className="gap-2"
            >
              {autoReconcileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Conciliar Automaticamente
            </Button>
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
                <SelectItem value="suggested">Sugeridos</SelectItem>
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
                  <TableHead className="text-right">Ações</TableHead>
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={config.className}>
                                {config.icon}
                                <span className="ml-1">{config.label}</span>
                                {entry.match_score != null && (
                                  <span className="ml-1 text-[10px] opacity-70">({entry.match_score}pts)</span>
                                )}
                              </Badge>
                            </TooltipTrigger>
                            {entry.match_score != null && (
                              <TooltipContent>
                                <p>Score de match: {entry.match_score} pontos</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {entry.status === "suggested" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => approveMutation.mutate(entry.id)}
                                disabled={approveMutation.isPending}
                              >
                                <Check className="h-4 w-4 text-status-success" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => rejectMutation.mutate(entry.id)}
                                disabled={rejectMutation.isPending}
                              >
                                <X className="h-4 w-4 text-status-danger" />
                              </Button>
                            </>
                          )}
                          {(entry.status === "pending" || entry.status === "unmatched") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              onClick={() => setMatchDialog({ open: true, entry })}
                            >
                              <Link2 className="h-3 w-3" />
                              Vincular
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Manual Match Dialog */}
      {matchDialog.entry && (
        <ReconciliationMatchDialog
          open={matchDialog.open}
          onOpenChange={(open) => setMatchDialog({ ...matchDialog, open })}
          entryId={matchDialog.entry.id}
          bankAmount={matchDialog.entry.bank_amount}
          bankDescription={matchDialog.entry.bank_description}
        />
      )}
    </div>
  );
}
