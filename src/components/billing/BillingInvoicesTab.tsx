import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { InvoiceActionsPopover } from "@/components/billing/InvoiceActionsPopover";
import { InvoiceInlineActions } from "@/components/billing/InvoiceInlineActions";
import {
  Search, Plus, DollarSign, AlertTriangle, Loader2, FileText, Send, Zap, XCircle, RefreshCw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Filter, X, Ban, Eye, MoreHorizontal, Ellipsis,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { logger, retryWithBackoff } from "@/lib/logger";
import { downloadStorageFileSafe } from "@/lib/storage-utils";
import { InvoiceForm } from "@/components/financial/InvoiceForm";
import { EmitNfseDialog } from "@/components/financial/EmitNfseDialog";
import { NfseAvulsaDialog } from "@/components/billing/nfse/NfseAvulsaDialog";
import { PixCodeDialog } from "@/components/financial/PixCodeDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useBatchProcessing } from "@/hooks/useBatchProcessing";
import { InvoiceProcessingHistory } from "@/components/billing/InvoiceProcessingHistory";
import { ManualPaymentDialog } from "@/components/billing/ManualPaymentDialog";
import { SecondCopyDialog } from "@/components/billing/SecondCopyDialog";
import { RenegotiateInvoiceDialog } from "@/components/billing/RenegotiateInvoiceDialog";
import { CancelNfseDialog } from "@/components/billing/CancelNfseDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useInvoiceActions } from "@/hooks/useInvoiceActions";
import type { Tables, Enums } from "@/integrations/supabase/types";

type InvoiceWithClient = Tables<"invoices"> & {
  clients: { name: string } | null;
  contract_id: string | null;
  billing_provider: string | null;
};

type NfseByInvoice = Record<string, { status: string; numero_nfse: string | null; pdf_url?: string | null; xml_url?: string | null }>;

const statusLabels: Record<Enums<"invoice_status">, string> = {
  pending: "PENDENTE",
  paid: "PAGO",
  overdue: "VENCIDO",
  cancelled: "CANCELADO",
  renegotiated: "RENEGOCIADO",
  lost: "PERDIDO",
};

const statusColors: Record<Enums<"invoice_status">, string> = {
  pending: "bg-status-warning/20 text-status-warning border-status-warning/40",
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  overdue: "bg-destructive/20 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground border-border",
  renegotiated: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  lost: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

const ITEMS_PER_PAGE = 15;

type PeriodPreset = "month" | "30" | "60" | "90" | "custom";

function getDateRangeForPreset(preset: PeriodPreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "30":
      return { from: subDays(now, 30), to: now };
    case "60":
      return { from: subDays(now, 60), to: now };
    case "90":
      return { from: subDays(now, 90), to: now };
    case "custom":
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "month", label: "Mês Atual" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
];

interface BillingInvoicesTabProps {
  autoOpenNew?: boolean;
  onAutoOpenConsumed?: () => void;
}

export function BillingInvoicesTab({ autoOpenNew, onAutoOpenConsumed }: BillingInvoicesTabProps = {}) {
  const isMobile = useIsMobile();
  const [, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("month");
  const [dateRange, setDateRange] = useState(() => getDateRangeForPreset("month"));
  const [currentPage, setCurrentPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Auto-open form when triggered by parent (FAB ?action=new)
  useEffect(() => {
    if (autoOpenNew) {
      setIsFormOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenNew, onAutoOpenConsumed]);
  const [nfseInvoice, setNfseInvoice] = useState<InvoiceWithClient | null>(null);
  const [pixDialogInvoice, setPixDialogInvoice] = useState<InvoiceWithClient | null>(null);
  const [isNfseAvulsaOpen, setIsNfseAvulsaOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const { processBatch, isProcessing: isBatchProcessing } = useBatchProcessing({
    onComplete: () => setSelectedInvoices(new Set()),
  });
  const [historyInvoice, setHistoryInvoice] = useState<InvoiceWithClient | null>(null);
  const [manualPaymentInvoice, setManualPaymentInvoice] = useState<InvoiceWithClient | null>(null);
  const [secondCopyInvoice, setSecondCopyInvoice] = useState<InvoiceWithClient | null>(null);
  const [renegotiateInvoice, setRenegotiateInvoice] = useState<InvoiceWithClient | null>(null);
  const [cancelNfseInvoice, setCancelNfseInvoice] = useState<InvoiceWithClient | null>(null);
  const [cancelInvoiceTarget, setCancelInvoiceTarget] = useState<InvoiceWithClient | null>(null);
  const [cancelInvoiceReason, setCancelInvoiceReason] = useState("");
  const [isCancellingBoleto, setIsCancellingBoleto] = useState(false);
  const [isGeneratingMonthly, setIsGeneratingMonthly] = useState(false);
  const [isBatchNotifying, setIsBatchNotifying] = useState(false);
  const queryClient = useQueryClient();

  const fromISO = format(dateRange.from, "yyyy-MM-dd");
  const toISO = format(dateRange.to, "yyyy-MM-dd");

  const handlePresetChange = useCallback((preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      setDateRange(getDateRangeForPreset(preset));
    }
    setCurrentPage(1);
  }, []);

  const handleCustomDateChange = useCallback((field: "from" | "to", date: Date | undefined) => {
    if (!date) return;
    setDateRange((prev) => ({ ...prev, [field]: date }));
    setPeriodPreset("custom");
    setCurrentPage(1);
  }, []);

  const {
    generatingPayment,
    processingComplete,
    sendingNotification,
    checkingPayment,
    markAsPaidMutation,
    cancelInvoiceMutation,
    handleGeneratePayment,
    handleResendNotification,
    handleEmitComplete,
    handleCheckPaymentStatus,
  } = useInvoiceActions();

  const { data: invoices = [], isLoading, isFetching } = useQuery({
    queryKey: ["invoices", statusFilter, fromISO, toISO],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, clients(name), contract_id, billing_provider")
        .gte("due_date", fromISO)
        .lte("due_date", toISO)
        .order("due_date", { ascending: false })
        .limit(500);

      if (statusFilter === "with_errors") {
        query = query.or("boleto_status.eq.erro,nfse_status.eq.erro,email_status.eq.erro");
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as Enums<"invoice_status">);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InvoiceWithClient[];
    },
  });

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const term = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      const clientName = inv.clients?.name?.toLowerCase() || "";
      const invoiceNum = String(inv.invoice_number);
      return clientName.includes(term) || invoiceNum.includes(term);
    });
  }, [invoices, search]);

  const invoiceIds = useMemo(() => invoices.map((i) => i.id), [invoices]);
  const { data: nfseByInvoice = {} } = useQuery({
    queryKey: ["nfse-by-invoices", invoiceIds],
    queryFn: async () => {
      if (invoiceIds.length === 0) return {};
      const { data, error } = await supabase
        .from("nfse_history")
        .select("invoice_id, status, numero_nfse, pdf_url, xml_url")
        .in("invoice_id", invoiceIds);
      if (error) throw error;
      const statusPriority: Record<string, number> = {
        autorizada: 0, processando: 1, pendente: 2, erro: 3, rejeitada: 4, cancelada: 5,
      };
      return (data || []).reduce<NfseByInvoice>((acc, n) => {
        if (!n.invoice_id) return acc;
        const existing = acc[n.invoice_id];
        const existingPriority = existing ? (statusPriority[existing.status] ?? 99) : 99;
        const newPriority = statusPriority[n.status] ?? 99;
        if (newPriority < existingPriority) {
          acc[n.invoice_id] = { status: n.status, numero_nfse: n.numero_nfse, pdf_url: n.pdf_url, xml_url: n.xml_url };
        }
        return acc;
      }, {});
    },
    enabled: invoiceIds.length > 0,
  });


  const totalPending = invoices.filter((i) => i.status === "pending").reduce((acc, i) => acc + i.amount, 0);
  const totalOverdue = invoices.filter((i) => i.status === "overdue").reduce((acc, i) => acc + i.amount, 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((acc, i) => acc + i.amount, 0);

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredInvoices.slice(start, end);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);
  const selectedInvoicesData = useMemo(
    () => invoices.filter((inv) => selectedInvoices.has(inv.id)),
    [invoices, selectedInvoices]
  );

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
    <div className="flex flex-col gap-4 h-full">
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
            <SelectItem value="renegotiated">Renegociado</SelectItem>
            <SelectItem value="lost">Perdido</SelectItem>
            <SelectItem value="with_errors">⚠ Com Erros</SelectItem>
          </SelectContent>
        </Select>

        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="h-9 px-2 text-muted-foreground">
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isLoading || isFetching}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["invoices"] });
              queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
              queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
              toast.success("Dados atualizados");
            }}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
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

      {/* Period Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {PERIOD_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={periodPreset === opt.value ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs whitespace-nowrap shrink-0"
            onClick={() => handlePresetChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}

        {periodPreset === "custom" && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(dateRange.from, "dd/MM/yy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateRange.from}
                  onSelect={(d) => handleCustomDateChange("from", d)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground shrink-0">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(dateRange.to, "dd/MM/yy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateRange.to}
                  onSelect={(d) => handleCustomDateChange("to", d)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant={statusFilter === "overdue" ? "destructive" : "outline"}
          size="sm"
          className="h-8 text-xs whitespace-nowrap shrink-0"
          onClick={() => setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")}
        >
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          Inadimplentes
        </Button>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
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
          <div className="col-span-3 md:col-span-1 md:ml-auto flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5">
            <span className="text-xs font-medium">{selectedInvoices.size} selecionada(s)</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSelectedInvoices(new Set())}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      {isMobile ? (
        <div className="flex-1 flex flex-col gap-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))
          ) : paginatedInvoices.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma fatura encontrada
            </div>
          ) : (
            paginatedInvoices.map((invoice) => {
              const nfseInfo = nfseByInvoice[invoice.id];
              return (
                <div key={invoice.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate flex-1">
                      {invoice.clients?.name || "Sem cliente"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className={`text-xs ${statusColors[invoice.status]}`}>
                        {statusLabels[invoice.status]}
                      </Badge>
                      <InvoiceActionsPopover
                        invoice={invoice}
                        nfseInfo={nfseInfo}
                        generatingPayment={generatingPayment}
                        processingComplete={processingComplete}
                        sendingNotification={sendingNotification}
                        checkingPayment={checkingPayment}
                        onEmitComplete={() => handleEmitComplete(invoice, nfseByInvoice)}
                        onGeneratePayment={handleGeneratePayment}
                        onManualPayment={() => setManualPaymentInvoice(invoice)}
                        onMarkAsPaid={() => markAsPaidMutation.mutate(invoice.id)}
                        onSecondCopy={() => setSecondCopyInvoice(invoice)}
                        onRenegotiate={() => setRenegotiateInvoice(invoice)}
                        onResendNotification={handleResendNotification}
                        onEmitNfse={() => setNfseInvoice(invoice)}
                        onCancelBoleto={() => setIsCancellingBoleto(true)}
                        onCancelNfse={() => setCancelNfseInvoice(invoice)}
                        onCancelInvoice={() => setCancelInvoiceTarget(invoice)}
                        onViewHistory={() => setHistoryInvoice(invoice)}
                        onCheckPayment={() => handleCheckPaymentStatus(invoice.id)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">#{invoice.invoice_number}</span>
                    <span className="text-sm font-semibold">{formatCurrency(invoice.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Venc: {invoice.due_date ? (() => { const [y,m,d] = invoice.due_date.split("-").map(Number); return format(new Date(y, m-1, d), "dd/MM/yyyy", { locale: ptBR }); })() : "-"}
                    </span>
                    <InvoiceInlineActions
                      invoice={invoice}
                      nfseInfo={nfseInfo}
                      processingComplete={processingComplete}
                      generatingPayment={generatingPayment}
                      sendingNotification={sendingNotification}
                      checkingPayment={checkingPayment}
                      onViewHistory={() => setHistoryInvoice(invoice)}
                      onEmitComplete={() => handleEmitComplete(invoice, nfseByInvoice)}
                      onBoletoClick={async () => {
                        if (invoice.boleto_url) {
                          await downloadStorageFileSafe(invoice.boleto_url, "PDF do boleto", `boleto_fatura_${invoice.invoice_number}.pdf`);
                        } else if (invoice.boleto_barcode) {
                          navigator.clipboard.writeText(invoice.boleto_barcode);
                          toast.success("Código de barras copiado!");
                        } else if (invoice.pix_code) {
                          setPixDialogInvoice(invoice);
                        } else {
                          toast.info("Nenhum boleto ou PIX gerado para esta fatura");
                        }
                      }}
                      onNfseClick={async () => {
                        const status = nfseInfo?.status;
                        if (status === "erro" || status === "rejeitada") {
                          setSearchParams({ tab: "nfse" });
                        } else if (status === "autorizada" && nfseInfo?.pdf_url) {
                          await downloadStorageFileSafe(nfseInfo.pdf_url, "PDF da NFS-e", `nfse_fatura_${invoice.invoice_number}.pdf`);
                        } else {
                          setNfseInvoice(invoice);
                        }
                      }}
                      onEmailClick={() => handleResendNotification(invoice.id, ["email"])}
                      onManualPayment={() => setManualPaymentInvoice(invoice)}
                      onCheckPayment={() => handleCheckPaymentStatus(invoice.id)}
                    />
                  </div>
                </div>
              );
            })
          )}

          {/* Mobile Pagination */}
          {!isLoading && paginatedInvoices.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-1 py-2">
              <span className="text-xs text-muted-foreground">
                {currentPage} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="h-7 px-2">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="h-7 px-2">
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Desktop Table */
        <div className="rounded-lg border border-border bg-card overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="w-10 px-2 py-2">
                    <Checkbox
                      checked={paginatedInvoices.length > 0 && selectedInvoices.size === paginatedInvoices.length ? true : selectedInvoices.size > 0 ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                      disabled={paginatedInvoices.length === 0}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-2">Cliente</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-2">Faturamento</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-2">Vencimento</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-2">Situação</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-2">Dt. Pagamento</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right py-2">Valor (R$)</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-center py-2">Ações</TableHead>
                  <TableHead className="w-10 py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-b hover:bg-muted/30">
                      <TableCell className="px-2 py-2"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="py-2 text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-4" /></TableCell>
                    </TableRow>
                  ))
                ) : paginatedInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhuma fatura encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedInvoices.map((invoice) => {
                    const nfseInfo = nfseByInvoice[invoice.id];
                    return (
                      <TableRow key={invoice.id} className="border-b hover:bg-muted/30 py-1">
                        <TableCell className="px-2 py-2">
                          <Checkbox
                            checked={selectedInvoices.has(invoice.id)}
                            onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{invoice.clients?.name || "Sem cliente"}</span>
                            <span className="text-xs text-muted-foreground">{invoice.invoice_number}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {invoice.issued_date ? (() => { const [y,m,d] = invoice.issued_date.split("-").map(Number); return format(new Date(y, m-1, d), "dd/MM/yyyy", { locale: ptBR }); })() : "-"}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {invoice.due_date ? (() => { const [y,m,d] = invoice.due_date.split("-").map(Number); return format(new Date(y, m-1, d), "dd/MM/yyyy", { locale: ptBR }); })() : "-"}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className={`text-xs ${statusColors[invoice.status]}`}>
                              {statusLabels[invoice.status]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {invoice.paid_date ? (() => { const [y,m,d] = invoice.paid_date.split("-").map(Number); return format(new Date(y, m-1, d), "dd/MM/yyyy", { locale: ptBR }); })() : "-"}
                        </TableCell>
                        <TableCell className="py-2 text-right text-sm font-medium">
                          {formatCurrency(invoice.amount)}
                        </TableCell>
                        <TableCell className="py-2">
                          <InvoiceInlineActions
                            invoice={invoice}
                            nfseInfo={nfseInfo}
                            processingComplete={processingComplete}
                            generatingPayment={generatingPayment}
                            sendingNotification={sendingNotification}
                            checkingPayment={checkingPayment}
                            onViewHistory={() => setHistoryInvoice(invoice)}
                            onEmitComplete={() => handleEmitComplete(invoice, nfseByInvoice)}
                            onBoletoClick={async () => {
                              if (invoice.boleto_url) {
                                await downloadStorageFileSafe(invoice.boleto_url, "PDF do boleto", `boleto_fatura_${invoice.invoice_number}.pdf`);
                              } else if (invoice.boleto_barcode) {
                                navigator.clipboard.writeText(invoice.boleto_barcode);
                                toast.success("Código de barras copiado!");
                              } else if (invoice.pix_code) {
                                setPixDialogInvoice(invoice);
                              } else {
                                toast.info("Nenhum boleto ou PIX gerado para esta fatura");
                              }
                            }}
                            onNfseClick={async () => {
                              const status = nfseInfo?.status;
                              if (status === "erro" || status === "rejeitada") {
                                setSearchParams({ tab: "nfse" });
                              } else if (status === "autorizada" && nfseInfo?.pdf_url) {
                                await downloadStorageFileSafe(nfseInfo.pdf_url, "PDF da NFS-e", `nfse_fatura_${invoice.invoice_number}.pdf`);
                              } else {
                                setNfseInvoice(invoice);
                              }
                            }}
                            onEmailClick={() => handleResendNotification(invoice.id, ["email"])}
                            onManualPayment={() => setManualPaymentInvoice(invoice)}
                            onCheckPayment={() => handleCheckPaymentStatus(invoice.id)}
                          />
                        </TableCell>
                        <TableCell className="py-2 w-10">
                          <InvoiceActionsPopover
                            invoice={invoice}
                            nfseInfo={nfseInfo}
                            generatingPayment={generatingPayment}
                            processingComplete={processingComplete}
                            sendingNotification={sendingNotification}
                            checkingPayment={checkingPayment}
                            onEmitComplete={() => handleEmitComplete(invoice, nfseByInvoice)}
                            onGeneratePayment={handleGeneratePayment}
                            onManualPayment={() => setManualPaymentInvoice(invoice)}
                            onMarkAsPaid={() => markAsPaidMutation.mutate(invoice.id)}
                            onSecondCopy={() => setSecondCopyInvoice(invoice)}
                            onRenegotiate={() => setRenegotiateInvoice(invoice)}
                            onResendNotification={handleResendNotification}
                            onEmitNfse={() => setNfseInvoice(invoice)}
                            onCancelBoleto={async () => {
                              if (!invoice.boleto_barcode && !invoice.boleto_url) {
                                toast.error("Nenhum boleto gerado para cancelar");
                                return;
                              }
                              setIsCancellingBoleto(true);
                              try {
                                const { data, error } = await supabase.functions.invoke("banco-inter", {
                                  body: { action: "cancel", invoice_id: invoice.id, motivo_cancelamento: "ACERTOS" },
                                });
                                if (error || data?.error) throw new Error(data?.error || "Erro ao cancelar");
                                toast.success(`Boleto #${invoice.invoice_number} cancelado`);
                                queryClient.invalidateQueries({ queryKey: ["invoices"] });
                                queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
                              } catch (e: unknown) {
                                toast.error("Erro ao cancelar boleto", { description: getErrorMessage(e) });
                              } finally {
                                setIsCancellingBoleto(false);
                              }
                            }}
                            onCancelNfse={() => setCancelNfseInvoice(invoice)}
                            onCancelInvoice={() => setCancelInvoiceTarget(invoice)}
                            onViewHistory={() => setHistoryInvoice(invoice)}
                            onCheckPayment={() => handleCheckPaymentStatus(invoice.id)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Footer */}
          {!isLoading && paginatedInvoices.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {filteredInvoices.length > 0 ? (
                  <>
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1} a{" "}
                    {Math.min(currentPage * ITEMS_PER_PAGE, filteredInvoices.length)} de{" "}
                    {filteredInvoices.length}
                  </>
                ) : (
                  "Nenhum resultado"
                )}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-7 px-2">
                  <ChevronsLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="h-7 px-2">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <div className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                  {currentPage} de {totalPages}
                </div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="h-7 px-2">
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-7 px-2">
                  <ChevronsRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fixed Action Footer */}
      <div className="border-t bg-muted/50 px-4 py-3 hidden md:flex items-center justify-between rounded-lg">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!hasSelected}>
                <Ellipsis className="mr-1.5 h-4 w-4" />
                Mais Opções
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setIsNfseAvulsaOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                NFS-e Avulsa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleGenerateMonthlyInvoices} disabled={isGeneratingMonthly}>
                {isGeneratingMonthly && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isGeneratingMonthly && <Plus className="mr-2 h-4 w-4" />}
                Gerar Faturas Mensais
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBatchNotification} disabled={isBatchNotifying}>
                {isBatchNotifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isBatchNotifying && <Send className="mr-2 h-4 w-4" />}
                Cobrança em Lote
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={!hasSelected}
            onClick={() => {
              const withNfse = selectedInvoicesData.some(
                (inv) => nfseByInvoice[inv.id]?.status === "autorizada"
              );
              if (withNfse) {
                toast.info("Cancelando NFS-e das faturas selecionadas...");
                for (const inv of selectedInvoicesData) {
                  if (nfseByInvoice[inv.id]?.status === "autorizada") {
                    setCancelNfseInvoice(inv);
                    break;
                  }
                }
              } else {
                toast.error("Nenhuma NFS-e autorizada para cancelar");
              }
            }}
          >
            <Ban className="mr-1.5 h-4 w-4" />
            Cancelar Nota Fiscal
          </Button>

          <Button
            variant="destructive"
            size="sm"
            disabled={!hasSelected || isCancellingBoleto}
            onClick={async () => {
              const withBoleto = selectedInvoicesData.filter((inv) => !!inv.boleto_url || !!inv.boleto_barcode);
              if (withBoleto.length === 0) {
                toast.error("Nenhum boleto para cancelar");
                return;
              }
              setIsCancellingBoleto(true);
              let successCount = 0;
              let errorCount = 0;
              for (const inv of withBoleto) {
                try {
                  const { data, error } = await supabase.functions.invoke("banco-inter", {
                    body: { action: "cancel", invoice_id: inv.id, motivo_cancelamento: "ACERTOS" },
                  });
                  if (error || data?.error) errorCount++;
                  else successCount++;
                } catch {
                  errorCount++;
                }
              }
              if (successCount > 0) {
                toast.success(`${successCount} boleto(s) cancelado(s)`, {
                  description: errorCount > 0 ? `${errorCount} falha(s)` : undefined,
                });
              } else {
                toast.error(`Falha ao cancelar ${errorCount} boleto(s)`);
              }
              queryClient.invalidateQueries({ queryKey: ["invoices"] });
              queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
              setSelectedInvoices(new Set());
              setIsCancellingBoleto(false);
            }}
          >
            {isCancellingBoleto ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Ban className="mr-1.5 h-4 w-4" />}
            Cancelar Boleto/Pix
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={!hasSelected}
            onClick={() => handleBatchNotification()}
          >
            <Send className="mr-1.5 h-4 w-4" />
            Reenviar Fatura
          </Button>

          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={!hasSelected || isBatchProcessing}
            onClick={() => processBatch(selectedInvoicesData.map(inv => inv.id))}
          >
            <Zap className="mr-1.5 h-4 w-4" />
            Faturar Agora
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      {nfseInvoice && (
        <EmitNfseDialog
          invoice={nfseInvoice}
          open={true}
          onOpenChange={(open) => {
            if (!open) setNfseInvoice(null);
          }}
        />
      )}

      {pixDialogInvoice && pixDialogInvoice.pix_code && (
        <PixCodeDialog
          pixCode={pixDialogInvoice.pix_code}
          invoiceNumber={pixDialogInvoice.invoice_number}
          amount={pixDialogInvoice.amount}
          clientName={pixDialogInvoice.clients?.name || "Cliente"}
          open={true}
          onOpenChange={(open) => {
            if (!open) setPixDialogInvoice(null);
          }}
        />
      )}

      <NfseAvulsaDialog
        open={isNfseAvulsaOpen}
        onOpenChange={setIsNfseAvulsaOpen}
      />

      {historyInvoice && (
        <InvoiceProcessingHistory
          invoice={historyInvoice}
          open={!!historyInvoice}
          onOpenChange={(open) => {
            if (!open) setHistoryInvoice(null);
          }}
        />
      )}

      {manualPaymentInvoice && (
        <ManualPaymentDialog
          invoice={manualPaymentInvoice}
          open={!!manualPaymentInvoice}
          onOpenChange={(open) => {
            if (!open) setManualPaymentInvoice(null);
          }}
        />
      )}

      {secondCopyInvoice && (
        <SecondCopyDialog
          invoice={secondCopyInvoice}
          open={!!secondCopyInvoice}
          onOpenChange={(open) => {
            if (!open) setSecondCopyInvoice(null);
          }}
        />
      )}

      {renegotiateInvoice && (
        <RenegotiateInvoiceDialog
          invoice={renegotiateInvoice}
          open={!!renegotiateInvoice}
          onOpenChange={(open) => {
            if (!open) setRenegotiateInvoice(null);
          }}
        />
      )}

      {cancelNfseInvoice && (
        <CancelNfseDialog
          invoice={cancelNfseInvoice}
          open={!!cancelNfseInvoice}
          onOpenChange={(open) => {
            if (!open) setCancelNfseInvoice(null);
          }}
        />
      )}
      {/* Cancel Invoice Dialog */}
      <AlertDialog open={!!cancelInvoiceTarget} onOpenChange={(open) => { if (!open) { setCancelInvoiceTarget(null); setCancelInvoiceReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Fatura #{cancelInvoiceTarget?.invoice_number}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá cancelar a fatura permanentemente. Informe o motivo do cancelamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento (obrigatório)"
            value={cancelInvoiceReason}
            onChange={(e) => setCancelInvoiceReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancelInvoiceReason.trim() || cancelInvoiceMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelInvoiceTarget && cancelInvoiceReason.trim()) {
                  cancelInvoiceMutation.mutate(
                    { invoiceId: cancelInvoiceTarget.id, reason: cancelInvoiceReason.trim() },
                    { onSuccess: () => { setCancelInvoiceTarget(null); setCancelInvoiceReason(""); } }
                  );
                }
              }}
            >
              {cancelInvoiceMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
