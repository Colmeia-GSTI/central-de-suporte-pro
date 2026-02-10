import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InvoiceActionsPopover } from "@/components/billing/InvoiceActionsPopover";
import {
  Search, Plus, DollarSign, TrendingUp, Receipt, CheckCircle2, Clock,
  AlertTriangle, Loader2, FileText, Send, Zap, XCircle, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { logger, retryWithBackoff } from "@/lib/logger";
import { InvoiceForm } from "@/components/financial/InvoiceForm";
import { EmitNfseDialog } from "@/components/financial/EmitNfseDialog";
import { EmitNfseAvulsaDialog } from "@/components/financial/EmitNfseAvulsaDialog";
import { PixCodeDialog } from "@/components/financial/PixCodeDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { InvoiceActionIndicators } from "@/components/billing/InvoiceActionIndicators";
import { BillingBatchProcessing } from "@/components/billing/BillingBatchProcessing";
import { InvoiceProcessingHistory } from "@/components/billing/InvoiceProcessingHistory";
import { ManualPaymentDialog } from "@/components/billing/ManualPaymentDialog";
import { SecondCopyDialog } from "@/components/billing/SecondCopyDialog";
import { RenegotiateInvoiceDialog } from "@/components/billing/RenegotiateInvoiceDialog";
import { CancelNfseDialog } from "@/components/billing/CancelNfseDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useInvoiceActions } from "@/hooks/useInvoiceActions";
import type { Tables, Enums } from "@/integrations/supabase/types";

type InvoiceWithClient = Tables<"invoices"> & {
  clients: { name: string } | null;
  contract_id: string | null;
  billing_provider: string | null;
};

type NfseByInvoice = Record<string, { status: string; numero_nfse: string | null }>;

const statusLabels: Record<Enums<"invoice_status">, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const statusColors: Record<Enums<"invoice_status">, string> = {
  pending: "bg-status-warning text-white",
  paid: "bg-status-success text-white",
  overdue: "bg-status-danger text-white",
  cancelled: "bg-muted text-muted-foreground",
};

const statusIcons: Record<Enums<"invoice_status">, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  paid: <CheckCircle2 className="h-3 w-3" />,
  overdue: <AlertTriangle className="h-3 w-3" />,
  cancelled: null,
};

const nfseStatusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  autorizada: { label: "Autorizada", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-status-success/20 text-status-success border-status-success/30" },
  processando: { label: "Processando", icon: <RefreshCw className="h-3 w-3 animate-spin" />, className: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400" },
  pendente: { label: "Pendente", icon: <Clock className="h-3 w-3" />, className: "bg-status-warning/20 text-status-warning border-status-warning/30" },
  rejeitada: { label: "Rejeitada", icon: <XCircle className="h-3 w-3" />, className: "bg-status-danger/20 text-status-danger border-status-danger/30" },
  erro: { label: "Erro", icon: <XCircle className="h-3 w-3" />, className: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400" },
  cancelada: { label: "Cancelada", icon: <XCircle className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
};

// Map nfse_history status to InvoiceActionIndicators nfseStatus
function mapNfseStatus(historyStatus: string | undefined): "pendente" | "gerada" | "erro" {
  if (!historyStatus) return "pendente";
  if (historyStatus === "autorizada") return "gerada";
  if (["erro", "rejeitada", "cancelada"].includes(historyStatus)) return "erro";
  return "pendente"; // processando, pendente
}

export function BillingInvoicesTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [nfseInvoice, setNfseInvoice] = useState<InvoiceWithClient | null>(null);
  const [pixDialogInvoice, setPixDialogInvoice] = useState<InvoiceWithClient | null>(null);
  const [isNfseAvulsaOpen, setIsNfseAvulsaOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isBatchProcessingOpen, setIsBatchProcessingOpen] = useState(false);
  const [historyInvoice, setHistoryInvoice] = useState<InvoiceWithClient | null>(null);
  const [manualPaymentInvoice, setManualPaymentInvoice] = useState<InvoiceWithClient | null>(null);
  const [secondCopyInvoice, setSecondCopyInvoice] = useState<InvoiceWithClient | null>(null);
  const [renegotiateInvoice, setRenegotiateInvoice] = useState<InvoiceWithClient | null>(null);
  const [cancelNfseInvoice, setCancelNfseInvoice] = useState<InvoiceWithClient | null>(null);
  const [cancelBoletoInvoice, setCancelBoletoInvoice] = useState<InvoiceWithClient | null>(null);
  const [isCancellingBoleto, setIsCancellingBoleto] = useState(false);
  const queryClient = useQueryClient();

  // Centralized invoice actions hook
  const {
    generatingPayment,
    processingComplete,
    sendingNotification,
    markAsPaidMutation,
    handleGeneratePayment,
    handleResendNotification,
    handleEmitComplete,
  } = useInvoiceActions();

  // FIX #1 & #2: Remove search from queryKey, add .limit(500)
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, clients(name), contract_id, billing_provider")
        .order("due_date", { ascending: false })
        .limit(500);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as Enums<"invoice_status">);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InvoiceWithClient[];
    },
  });

  // FIX #1: Frontend search filter
  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const term = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      const clientName = inv.clients?.name?.toLowerCase() || "";
      const invoiceNum = String(inv.invoice_number);
      return clientName.includes(term) || invoiceNum.includes(term);
    });
  }, [invoices, search]);

  // FIX #3: Only fetch NFS-e for visible invoice IDs
  const invoiceIds = useMemo(() => invoices.map((i) => i.id), [invoices]);
  const { data: nfseByInvoice = {} } = useQuery({
    queryKey: ["nfse-by-invoices", invoiceIds],
    queryFn: async () => {
      if (invoiceIds.length === 0) return {};
      const { data, error } = await supabase
        .from("nfse_history")
        .select("invoice_id, status, numero_nfse")
        .in("invoice_id", invoiceIds);

      if (error) throw error;

      return (data || []).reduce<NfseByInvoice>((acc, n) => {
        if (n.invoice_id) {
          acc[n.invoice_id] = { status: n.status, numero_nfse: n.numero_nfse };
        }
        return acc;
      }, {});
    },
    enabled: invoiceIds.length > 0,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Stats use ALL invoices (not filtered by search)
  const totalPending = invoices
    .filter((i) => i.status === "pending")
    .reduce((acc, i) => acc + i.amount, 0);

  const totalOverdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((acc, i) => acc + i.amount, 0);

  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + i.amount, 0);

  const [isGeneratingMonthly, setIsGeneratingMonthly] = useState(false);
  const [isBatchNotifying, setIsBatchNotifying] = useState(false);

  // FIX #8: Selection uses filteredInvoices
  const toggleInvoiceSelection = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map((i) => i.id)));
    }
  };

  const handleGenerateMonthlyInvoices = async () => {
    setIsGeneratingMonthly(true);
    const executionId = logger.generateExecutionId();
    const startTime = Date.now();

    await logger.billingOperation("generate-monthly-invoices", "start", {
      execution_id: executionId,
    }, true);

    try {
      const data = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase.functions.invoke("generate-monthly-invoices", {
            body: {},
          });
          if (error) throw error;
          return data;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error, delayMs) => {
            toast.warning(`Tentativa ${attempt}/3 falhou`, {
              description: `Retentando em ${delayMs / 1000}s...`,
            });
            logger.billingOperation("generate-monthly-invoices", "retry", {
              execution_id: executionId,
              error: error.message,
            });
          },
        }
      );

      const duration = Date.now() - startTime;

      if (data.success !== false) {
        const stats = data.stats || { generated: data.generated || 0, skipped: data.skipped || 0, failed: 0 };

        await logger.billingOperation("generate-monthly-invoices", "success", {
          execution_id: data.execution_id || executionId,
          contract_count: stats.total_contracts,
          generated: stats.generated,
          skipped: stats.skipped,
          failed: stats.failed,
          duration_ms: duration,
        }, true);

        if (stats.generated > 0) {
          toast.success("Faturas geradas com sucesso!", {
            description: `${stats.generated} faturas criadas${stats.skipped > 0 ? `, ${stats.skipped} ignoradas` : ""}${stats.failed > 0 ? `, ${stats.failed} com erro` : ""}`,
            action: data.execution_id ? {
              label: "Ver Logs",
              onClick: () => window.open("/settings?tab=integrations&subtab=logs", "_blank"),
            } : undefined,
          });
        } else if (stats.skipped > 0) {
          toast.info("Nenhuma fatura nova gerada", {
            description: `${stats.skipped} faturas já existentes para este mês`,
          });
        } else {
          toast.info("Nenhum contrato ativo encontrado");
        }

        if (data.errors && data.errors.length > 0) {
          for (const err of data.errors.slice(0, 3)) {
            toast.error(`Erro: ${err.contract_name}`, {
              description: err.message,
            });
          }
        }

        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      } else {
        await logger.billingOperation("generate-monthly-invoices", "error", {
          execution_id: data.execution_id || executionId,
          error: data.message || "Erro desconhecido",
          duration_ms: duration,
        }, true);

        toast.error("Erro ao gerar faturas", {
          description: data.message || "Erro desconhecido",
          action: {
            label: "Ver Logs",
            onClick: () => window.open("/settings?tab=integrations&subtab=logs", "_blank"),
          },
        });
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);

      await logger.billingOperation("generate-monthly-invoices", "error", {
        execution_id: executionId,
        error: errorMessage,
        duration_ms: Date.now() - startTime,
      }, true);

      toast.error("Erro ao gerar faturas mensais", {
        description: errorMessage,
        action: {
          label: "Ver Logs",
          onClick: () => window.open("/settings?tab=integrations&subtab=logs", "_blank"),
        },
      });
    } finally {
      setIsGeneratingMonthly(false);
    }
  };

  const handleBatchNotification = async () => {
    setIsBatchNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("batch-collection-notification", {
        body: { status: "pending" },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Notificações enviadas em lote!", {
          description: `${data.sent || 0} cobranças enviadas`,
        });
      } else {
        toast.error(data.error || "Erro ao enviar notificações");
      }
    } catch (error: unknown) {
      toast.error("Erro ao enviar notificações em lote", { description: getErrorMessage(error) });
    } finally {
      setIsBatchNotifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selection Bar */}
      {selectedInvoices.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="text-sm font-medium">
            {selectedInvoices.size} fatura(s) selecionada(s)
          </div>
          <PermissionGate module="financial" action="manage">
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black"
              onClick={() => setIsBatchProcessingOpen(true)}
            >
              <Zap className="mr-2 h-4 w-4" />
              Processar Selecionados
            </Button>
          </PermissionGate>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Link to="/billing/delinquency">
          <Button variant="outline" size="sm">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Inadimplência
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => setIsNfseAvulsaOpen(true)}>
          <FileText className="mr-2 h-4 w-4" />
          NFS-e Avulsa
        </Button>
        <PermissionGate module="financial" action="manage">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateMonthlyInvoices}
            disabled={isGeneratingMonthly}
          >
            {isGeneratingMonthly ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Receipt className="mr-2 h-4 w-4" />
            )}
            Gerar Faturas Mensais
          </Button>
        </PermissionGate>
        <PermissionGate module="financial" action="manage">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchNotification}
            disabled={isBatchNotifying}
          >
            {isBatchNotifying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Cobrança em Lote
          </Button>
        </PermissionGate>
        <div className="ml-auto flex-shrink-0">
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <PermissionGate module="financial" action="create">
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Fatura
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Fatura</DialogTitle>
              </DialogHeader>
              <InvoiceForm
                onSuccess={() => {
                  setIsFormOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
                }}
                onCancel={() => setIsFormOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {formatCurrency(totalPending)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencido</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(totalOverdue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {formatCurrency(totalPaid)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0
                      ? true
                      : selectedInvoices.size > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleSelectAll}
                  disabled={filteredInvoices.length === 0}
                />
              </TableHead>
              <TableHead>#</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
              <TableHead className="text-right">Menu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">
                    {search ? "Nenhuma fatura encontrada para esta busca" : "Nenhuma fatura encontrada"}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id} className={selectedInvoices.has(invoice.id) ? "bg-amber-500/5" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedInvoices.has(invoice.id)}
                      onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono">#{invoice.invoice_number}</TableCell>
                  <TableCell className="font-medium">{invoice.clients?.name || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.reference_month ? (
                      <span className="font-mono text-sm">
                        {invoice.reference_month.split("-").reverse().join("/")}
                      </span>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      {formatCurrency(invoice.amount)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={statusColors[invoice.status]}>
                        {statusIcons[invoice.status]}
                        <span className="ml-1">{statusLabels[invoice.status]}</span>
                      </Badge>
                      {nfseByInvoice[invoice.id] && (() => {
                        const nfseInfo = nfseByInvoice[invoice.id];
                        const config = nfseStatusConfig[nfseInfo.status] || nfseStatusConfig.pendente;
                        return (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${config.className}`}>
                            {config.icon}
                            <span>NFS-e</span>
                          </Badge>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <InvoiceActionIndicators
                      boletoStatus={
                        invoice.boleto_error_msg ? "erro" :
                        invoice.boleto_url ? "enviado" :
                        (invoice.boleto_status as "pendente" | "gerado" | "enviado" | "erro" | null) || "pendente"
                      }
                      boletoUrl={invoice.boleto_url}
                      boletoError={invoice.boleto_error_msg}
                      nfseStatus={mapNfseStatus(nfseByInvoice[invoice.id]?.status)}
                      nfseUrl={nfseByInvoice[invoice.id]?.status === "autorizada" ? "#nfse" : undefined}
                      nfseError={invoice.nfse_error_msg}
                      emailStatus={
                        invoice.email_status ||
                        (invoice.email_sent_at ? "enviado" : invoice.email_error_msg ? "erro" : "pendente")
                      }
                      emailError={invoice.email_error_msg}
                      size="sm"
                      onBoletoClick={() => {
                        if (invoice.boleto_url) {
                          window.open(invoice.boleto_url, "_blank");
                        } else if (invoice.status === "pending" || invoice.status === "overdue") {
                          handleGeneratePayment(invoice.id, "boleto", (invoice.billing_provider as "banco_inter" | "asaas") || "banco_inter");
                        }
                      }}
                      onNfseClick={() => {
                        if (invoice.contract_id) {
                          setNfseInvoice(invoice);
                        }
                      }}
                      onEmailClick={() => {
                        if (invoice.boleto_url || invoice.pix_code) {
                          handleResendNotification(invoice.id, ["email"]);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {invoice.status !== "cancelled" && (
                      <InvoiceActionsPopover
                        invoice={invoice}
                        nfseInfo={nfseByInvoice[invoice.id]}
                        generatingPayment={generatingPayment}
                        processingComplete={processingComplete}
                        sendingNotification={sendingNotification}
                        onEmitComplete={() => handleEmitComplete(invoice, nfseByInvoice)}
                        onGeneratePayment={handleGeneratePayment}
                        onManualPayment={() => setManualPaymentInvoice(invoice)}
                        onMarkAsPaid={() => markAsPaidMutation.mutate(invoice.id)}
                        onSecondCopy={() => setSecondCopyInvoice(invoice)}
                        onRenegotiate={() => setRenegotiateInvoice(invoice)}
                        onResendNotification={handleResendNotification}
                        onEmitNfse={() => setNfseInvoice(invoice)}
                        onCancelBoleto={() => setCancelBoletoInvoice(invoice)}
                        onCancelNfse={() => setCancelNfseInvoice(invoice)}
                        onViewHistory={() => setHistoryInvoice(invoice)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Batch Processing Dialog */}
      <BillingBatchProcessing
        open={isBatchProcessingOpen}
        onOpenChange={setIsBatchProcessingOpen}
        selectedInvoiceIds={Array.from(selectedInvoices)}
        selectedInvoiceCount={selectedInvoices.size}
        onProcessingComplete={() => {
          setSelectedInvoices(new Set());
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
          queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
        }}
      />

      {/* Dialogs */}
      {nfseInvoice && (
        <EmitNfseDialog
          open={!!nfseInvoice}
          onOpenChange={(open) => !open && setNfseInvoice(null)}
          invoice={nfseInvoice}
        />
      )}

      <EmitNfseAvulsaDialog
        open={isNfseAvulsaOpen}
        onOpenChange={setIsNfseAvulsaOpen}
      />

      {pixDialogInvoice && (
        <PixCodeDialog
          open={!!pixDialogInvoice}
          onOpenChange={(open) => !open && setPixDialogInvoice(null)}
          pixCode={pixDialogInvoice.pix_code || ""}
          invoiceNumber={pixDialogInvoice.invoice_number}
          amount={pixDialogInvoice.amount}
          clientName={pixDialogInvoice.clients?.name || "Cliente"}
        />
      )}

      <InvoiceProcessingHistory
        open={!!historyInvoice}
        onOpenChange={(open) => !open && setHistoryInvoice(null)}
        invoice={historyInvoice}
      />

      <ManualPaymentDialog
        open={!!manualPaymentInvoice}
        onOpenChange={(open) => !open && setManualPaymentInvoice(null)}
        invoice={manualPaymentInvoice ? {
          id: manualPaymentInvoice.id,
          invoice_number: manualPaymentInvoice.invoice_number,
          amount: manualPaymentInvoice.amount,
          fine_amount: manualPaymentInvoice.fine_amount || 0,
          interest_amount: manualPaymentInvoice.interest_amount || 0,
          contract_id: manualPaymentInvoice.contract_id,
          client_name: manualPaymentInvoice.clients?.name,
        } : null}
      />

      <SecondCopyDialog
        open={!!secondCopyInvoice}
        onOpenChange={(open) => !open && setSecondCopyInvoice(null)}
        invoice={secondCopyInvoice ? {
          id: secondCopyInvoice.id,
          invoice_number: secondCopyInvoice.invoice_number,
          amount: secondCopyInvoice.amount,
          due_date: secondCopyInvoice.due_date,
          fine_amount: secondCopyInvoice.fine_amount,
          interest_amount: secondCopyInvoice.interest_amount,
          client_name: secondCopyInvoice.clients?.name,
        } : null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
        }}
      />

      <RenegotiateInvoiceDialog
        open={!!renegotiateInvoice}
        onOpenChange={(open) => !open && setRenegotiateInvoice(null)}
        invoice={renegotiateInvoice ? {
          id: renegotiateInvoice.id,
          invoice_number: renegotiateInvoice.invoice_number,
          amount: renegotiateInvoice.amount,
          due_date: renegotiateInvoice.due_date,
          fine_amount: renegotiateInvoice.fine_amount,
          interest_amount: renegotiateInvoice.interest_amount,
          client_name: renegotiateInvoice.clients?.name,
        } : null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
        }}
      />

      {/* Cancel NFS-e Dialog */}
      <CancelNfseDialog
        open={!!cancelNfseInvoice}
        onOpenChange={(open) => !open && setCancelNfseInvoice(null)}
        invoiceNumber={cancelNfseInvoice?.invoice_number}
        nfseNumber={cancelNfseInvoice ? nfseByInvoice[cancelNfseInvoice.id]?.numero_nfse : null}
        onConfirm={async (justification) => {
          if (!cancelNfseInvoice) return;
          const nfseInfo = nfseByInvoice[cancelNfseInvoice.id];
          // We need the asaas_invoice_id - fetch from nfse_history
          const { data: nfseRecord } = await supabase
            .from("nfse_history")
            .select("id, asaas_invoice_id")
            .eq("invoice_id", cancelNfseInvoice.id)
            .eq("status", "autorizada")
            .maybeSingle();

          if (!nfseRecord?.asaas_invoice_id) {
            toast.error("NFS-e não encontrada ou sem ID do Asaas");
            throw new Error("Missing asaas_invoice_id");
          }

          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: {
              action: "cancel",
              invoice_id: nfseRecord.asaas_invoice_id,
              nfse_history_id: nfseRecord.id,
              justification,
            },
          });

          if (error) {
            toast.error("Erro ao cancelar NFS-e", { description: getErrorMessage(error) });
            throw error;
          }

          if (data?.success === false) {
            const msg = data.error || "Erro desconhecido";
            toast.error("Falha no cancelamento", { description: msg });
            throw new Error(msg);
          }

          toast.success("NFS-e cancelada com sucesso");
          queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
        }}
      />

      {/* Cancel Boleto Confirm Dialog */}
      <ConfirmDialog
        open={!!cancelBoletoInvoice}
        onOpenChange={(open) => !open && setCancelBoletoInvoice(null)}
        title="Cancelar Boleto"
        description={`Deseja cancelar o boleto da fatura #${cancelBoletoInvoice?.invoice_number}? Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar Boleto"
        variant="destructive"
        isLoading={isCancellingBoleto}
        onConfirm={async () => {
          if (!cancelBoletoInvoice) return;
          setIsCancellingBoleto(true);
          try {
            const { data, error } = await supabase.functions.invoke("banco-inter", {
              body: { action: "cancel", invoice_id: cancelBoletoInvoice.id },
            });

            if (error) throw error;
            if (data?.error) {
              toast.error("Erro ao cancelar boleto", { description: data.error });
              return;
            }

            toast.success("Boleto cancelado com sucesso");
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
            setCancelBoletoInvoice(null);
          } catch (err: unknown) {
            toast.error("Erro ao cancelar boleto", { description: getErrorMessage(err) });
          } finally {
            setIsCancellingBoleto(false);
          }
        }}
      />
    </div>
  );
}