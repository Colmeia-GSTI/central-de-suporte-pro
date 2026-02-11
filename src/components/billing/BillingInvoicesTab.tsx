import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceActionsPopover } from "@/components/billing/InvoiceActionsPopover";
import { InvoiceInlineActions } from "@/components/billing/InvoiceInlineActions";
import {
  Search, Plus, DollarSign, Receipt, CheckCircle2, Clock,
  AlertTriangle, Loader2, FileText, Send, Zap, XCircle, RefreshCw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical,
  Filter, X, Ban,
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
  pending: "PENDENTE",
  paid: "PAGO",
  overdue: "VENCIDO",
  cancelled: "CANCELADO",
};

const statusColors: Record<Enums<"invoice_status">, string> = {
  pending: "bg-status-warning/20 text-status-warning border-status-warning/40",
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  overdue: "bg-destructive/20 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const nfseStatusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  autorizada: { label: "NFS-e", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  processando: { label: "NFS-e", icon: <RefreshCw className="h-3 w-3 animate-spin" />, className: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  pendente: { label: "NFS-e", icon: <Clock className="h-3 w-3" />, className: "bg-status-warning/20 text-status-warning border-status-warning/40" },
  rejeitada: { label: "NFS-e", icon: <XCircle className="h-3 w-3" />, className: "bg-destructive/20 text-destructive border-destructive/40" },
  erro: { label: "NFS-e", icon: <XCircle className="h-3 w-3" />, className: "bg-destructive/20 text-destructive border-destructive/40" },
  cancelada: { label: "NFS-e", icon: <XCircle className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
};

const ITEMS_PER_PAGE = 15;

export function BillingInvoicesTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
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

  const {
    generatingPayment,
    processingComplete,
    sendingNotification,
    markAsPaidMutation,
    handleGeneratePayment,
    handleResendNotification,
    handleEmitComplete,
  } = useInvoiceActions();

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

  const filteredInvoices = useMemo(() => {
    setCurrentPage(1);
    if (!search.trim()) return invoices;
    const term = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      const clientName = inv.clients?.name?.toLowerCase() || "";
      const invoiceNum = String(inv.invoice_number);
      return clientName.includes(term) || invoiceNum.includes(term);
    });
  }, [invoices, search, statusFilter]);

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
        if (n.invoice_id) acc[n.invoice_id] = { status: n.status, numero_nfse: n.numero_nfse };
        return acc;
      }, {});
    },
    enabled: invoiceIds.length > 0,
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const totalPending = invoices.filter((i) => i.status === "pending").reduce((acc, i) => acc + i.amount, 0);
  const totalOverdue = invoices.filter((i) => i.status === "overdue").reduce((acc, i) => acc + i.amount, 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((acc, i) => acc + i.amount, 0);

  const [isGeneratingMonthly, setIsGeneratingMonthly] = useState(false);
  const [isBatchNotifying, setIsBatchNotifying] = useState(false);

  const toggleInvoiceSelection = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) newSelected.delete(invoiceId);
    else newSelected.add(invoiceId);
    setSelectedInvoices(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === paginatedInvoices.length && paginatedInvoices.length > 0) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(paginatedInvoices.map((i) => i.id)));
    }
  };

  const handleGenerateMonthlyInvoices = async () => {
    setIsGeneratingMonthly(true);
    const executionId = logger.generateExecutionId();
    const startTime = Date.now();
    await logger.billingOperation("generate-monthly-invoices", "start", { execution_id: executionId }, true);
    try {
      const data = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase.functions.invoke("generate-monthly-invoices", { body: {} });
          if (error) throw error;
          return data;
        },
        {
          maxRetries: 3, baseDelayMs: 1000,
          onRetry: (attempt, error, delayMs) => {
            toast.warning(`Tentativa ${attempt}/3 falhou`, { description: `Retentando em ${delayMs / 1000}s...` });
            logger.billingOperation("generate-monthly-invoices", "retry", { execution_id: executionId, error: error.message });
          },
        }
      );
      const duration = Date.now() - startTime;
      if (data.success !== false) {
        const stats = data.stats || { generated: data.generated || 0, skipped: data.skipped || 0, failed: 0 };
        await logger.billingOperation("generate-monthly-invoices", "success", { execution_id: data.execution_id || executionId, generated: stats.generated, skipped: stats.skipped, failed: stats.failed, duration_ms: duration }, true);
        if (stats.generated > 0) {
          toast.success("Faturas geradas com sucesso!", { description: `${stats.generated} faturas criadas${stats.skipped > 0 ? `, ${stats.skipped} ignoradas` : ""}${stats.failed > 0 ? `, ${stats.failed} com erro` : ""}` });
        } else if (stats.skipped > 0) {
          toast.info("Nenhuma fatura nova gerada", { description: `${stats.skipped} faturas já existentes para este mês` });
        } else {
          toast.info("Nenhum contrato ativo encontrado");
        }
        if (data.errors?.length > 0) {
          for (const err of data.errors.slice(0, 3)) toast.error(`Erro: ${err.contract_name}`, { description: err.message });
        }
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      } else {
        await logger.billingOperation("generate-monthly-invoices", "error", { execution_id: data.execution_id || executionId, error: data.message || "Erro desconhecido", duration_ms: duration }, true);
        toast.error("Erro ao gerar faturas", { description: data.message || "Erro desconhecido" });
      }
    } catch (error: unknown) {
      await logger.billingOperation("generate-monthly-invoices", "error", { execution_id: executionId, error: getErrorMessage(error), duration_ms: Date.now() - startTime }, true);
      toast.error("Erro ao gerar faturas mensais", { description: getErrorMessage(error) });
    } finally {
      setIsGeneratingMonthly(false);
    }
  };

  const handleBatchNotification = async () => {
    setIsBatchNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("batch-collection-notification", { body: { status: "pending" } });
      if (error) throw error;
      if (data.success) toast.success("Notificações enviadas em lote!", { description: `${data.sent || 0} cobranças enviadas` });
      else toast.error(data.error || "Erro ao enviar notificações");
    } catch (error: unknown) {
      toast.error("Erro ao enviar notificações em lote", { description: getErrorMessage(error) });
    } finally {
      setIsBatchNotifying(false);
    }
  };

  const hasSelected = selectedInvoices.size > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header Row: Search + Filters + New Invoice */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente ou nº fatura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="h-9 px-2 text-muted-foreground">
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link to="/billing/delinquency">
            <Button variant="outline" size="sm" className="h-9">
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
              Inadimplência
            </Button>
          </Link>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <PermissionGate module="financial" action="create">
              <DialogTrigger asChild>
                <Button size="sm" className="h-9">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nova Fatura
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Fatura</DialogTitle>
              </DialogHeader>
              <InvoiceForm
                onSuccess={() => { setIsFormOpen(false); queryClient.invalidateQueries({ queryKey: ["billing-counters"] }); }}
                onCancel={() => setIsFormOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">A Receber</span>
          <span className="text-sm font-semibold text-emerald-400">{formatCurrency(totalPending)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Vencido</span>
          <span className="text-sm font-semibold text-destructive">{formatCurrency(totalOverdue)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Recebido</span>
          <span className="text-sm font-semibold text-emerald-400">{formatCurrency(totalPaid)}</span>
        </div>

        {hasSelected && (
          <div className="ml-auto flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5">
            <span className="text-xs font-medium">{selectedInvoices.size} selecionada(s)</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSelectedInvoices(new Set())}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Dense Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 px-2">
                <Checkbox
                  checked={paginatedInvoices.length > 0 && selectedInvoices.size === paginatedInvoices.length ? true : selectedInvoices.size > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  disabled={paginatedInvoices.length === 0}
                />
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Cliente</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Faturamento</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Vencimento</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Situação</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Valor (R$)</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-center">Ações</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="px-2"><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                </TableRow>
              ))
            ) : paginatedInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Receipt className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {search ? "Nenhuma fatura encontrada para esta busca" : "Nenhuma fatura encontrada"}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedInvoices.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className={`h-11 ${selectedInvoices.has(invoice.id) ? "bg-primary/5" : ""}`}
                >
                  <TableCell className="px-2 py-2">
                    <Checkbox
                      checked={selectedInvoices.has(invoice.id)}
                      onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <div>
                      <span className="text-sm font-medium leading-none">{invoice.clients?.name || "—"}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        #{invoice.invoice_number}
                        {invoice.reference_month && ` · ${invoice.reference_month.split("-").reverse().join("/")}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">
                    {format(new Date(invoice.created_at), "dd/MM/yy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {format(new Date(invoice.due_date), "dd/MM/yy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${statusColors[invoice.status]}`}>
                        {statusLabels[invoice.status]}
                      </Badge>
                      {nfseByInvoice[invoice.id] && (() => {
                        const nfseInfo = nfseByInvoice[invoice.id];
                        const config = nfseStatusConfig[nfseInfo.status] || nfseStatusConfig.pendente;
                        return (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${config.className}`}>
                            {config.icon}
                            <span>{config.label}</span>
                          </Badge>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(invoice.amount)}</span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <InvoiceInlineActions
                      invoice={invoice}
                      nfseInfo={nfseByInvoice[invoice.id]}
                      processingComplete={processingComplete}
                      generatingPayment={generatingPayment}
                      sendingNotification={sendingNotification}
                      onViewHistory={() => setHistoryInvoice(invoice)}
                      onEmitComplete={() => handleEmitComplete(invoice, nfseByInvoice)}
                      onBoletoClick={() => {
                        if (invoice.boleto_url) window.open(invoice.boleto_url, "_blank");
                        else if (invoice.status === "pending" || invoice.status === "overdue") {
                          handleGeneratePayment(invoice.id, "boleto", (invoice.billing_provider as "banco_inter" | "asaas") || "banco_inter");
                        }
                      }}
                      onNfseClick={() => { if (invoice.contract_id) setNfseInvoice(invoice); }}
                      onEmailClick={() => {
                        if (invoice.boleto_url || invoice.pix_code) handleResendNotification(invoice.id, ["email"]);
                      }}
                      onManualPayment={() => setManualPaymentInvoice(invoice)}
                    />
                  </TableCell>
                  <TableCell className="py-2 px-2">
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

      {/* Pagination */}
      {filteredInvoices.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {startItem} a {endItem} de {filteredInvoices.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={safeCurrentPage <= 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safeCurrentPage <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-muted-foreground">
              Página {safeCurrentPage} de {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safeCurrentPage >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage >= totalPages}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Fixed Footer Actions Bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-lg">
        {/* More Options Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreVertical className="mr-1.5 h-3.5 w-3.5" />
              Mais Opções
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setIsNfseAvulsaOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              NFS-e Avulsa
            </DropdownMenuItem>
            <PermissionGate module="financial" action="manage">
              <DropdownMenuItem onClick={handleGenerateMonthlyInvoices} disabled={isGeneratingMonthly}>
                {isGeneratingMonthly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                Gerar Faturas Mensais
              </DropdownMenuItem>
            </PermissionGate>
            <PermissionGate module="financial" action="manage">
              <DropdownMenuItem onClick={handleBatchNotification} disabled={isBatchNotifying}>
                {isBatchNotifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Cobrança em Lote
              </DropdownMenuItem>
            </PermissionGate>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Batch actions on selected */}
        <Button
          variant="outline"
          size="sm"
          disabled={!hasSelected}
          className="text-destructive border-destructive/30 hover:bg-destructive/10 disabled:text-muted-foreground disabled:border-border"
          onClick={() => {
            const selected = Array.from(selectedInvoices);
            const invoice = invoices.find((i) => selected.includes(i.id) && nfseByInvoice[i.id]?.status === "autorizada");
            if (invoice) setCancelNfseInvoice(invoice);
            else toast.info("Nenhuma fatura selecionada possui NFS-e autorizada para cancelar");
          }}
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Cancelar NF-e
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={!hasSelected}
          className="text-destructive border-destructive/30 hover:bg-destructive/10 disabled:text-muted-foreground disabled:border-border"
          onClick={() => {
            const selected = Array.from(selectedInvoices);
            const invoice = invoices.find((i) => selected.includes(i.id) && i.boleto_url && i.status !== "paid");
            if (invoice) setCancelBoletoInvoice(invoice);
            else toast.info("Nenhuma fatura selecionada possui boleto para cancelar");
          }}
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          Cancelar Boleto/Pix
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={!hasSelected}
          onClick={() => {
            const selected = Array.from(selectedInvoices);
            for (const id of selected) {
              const inv = invoices.find((i) => i.id === id);
              if (inv && (inv.boleto_url || inv.pix_code)) {
                handleResendNotification(id, ["email", "whatsapp"]);
              }
            }
          }}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Reenviar Fatura
        </Button>

        <PermissionGate module="financial" action="manage">
          <Button
            size="sm"
            disabled={!hasSelected}
            onClick={() => setIsBatchProcessingOpen(true)}
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Faturar Agora
          </Button>
        </PermissionGate>
      </div>

      {/* ===== All Dialogs (preserved exactly) ===== */}
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

      {nfseInvoice && (
        <EmitNfseDialog
          open={!!nfseInvoice}
          onOpenChange={(open) => !open && setNfseInvoice(null)}
          invoice={nfseInvoice}
        />
      )}

      <EmitNfseAvulsaDialog open={isNfseAvulsaOpen} onOpenChange={setIsNfseAvulsaOpen} />

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

      <CancelNfseDialog
        open={!!cancelNfseInvoice}
        onOpenChange={(open) => !open && setCancelNfseInvoice(null)}
        invoiceNumber={cancelNfseInvoice?.invoice_number}
        nfseNumber={cancelNfseInvoice ? nfseByInvoice[cancelNfseInvoice.id]?.numero_nfse : null}
        onConfirm={async (justification) => {
          if (!cancelNfseInvoice) return;
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
            body: { action: "cancel", invoice_id: nfseRecord.asaas_invoice_id, nfse_history_id: nfseRecord.id, justification },
          });
          if (error) { toast.error("Erro ao cancelar NFS-e", { description: getErrorMessage(error) }); throw error; }
          if (data?.success === false) { const msg = data.error || "Erro desconhecido"; toast.error("Falha no cancelamento", { description: msg }); throw new Error(msg); }
          toast.success("NFS-e cancelada com sucesso");
          queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
        }}
      />

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
            if (data?.error) { toast.error("Erro ao cancelar boleto", { description: data.error }); return; }
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
