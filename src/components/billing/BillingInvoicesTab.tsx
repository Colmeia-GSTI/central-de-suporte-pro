import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Barcode,
  QrCode,
  MoreHorizontal,
  Loader2,
  ExternalLink,
  FileText,
  Mail,
  MessageCircle,
  Send,
  Zap,
  XCircle,
  RefreshCw,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { InvoiceForm } from "@/components/financial/InvoiceForm";
import { EmitNfseDialog } from "@/components/financial/EmitNfseDialog";
import { EmitNfseAvulsaDialog } from "@/components/financial/EmitNfseAvulsaDialog";
import { PixCodeDialog } from "@/components/financial/PixCodeDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
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

export function BillingInvoicesTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState<string | null>(null);
  const [processingComplete, setProcessingComplete] = useState<string | null>(null);
  const [nfseInvoice, setNfseInvoice] = useState<InvoiceWithClient | null>(null);
  const [pixDialogInvoice, setPixDialogInvoice] = useState<InvoiceWithClient | null>(null);
  const [isNfseAvulsaOpen, setIsNfseAvulsaOpen] = useState(false);
  const [sendingNotification, setSendingNotification] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, clients(name), contract_id, billing_provider")
        .order("due_date", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as Enums<"invoice_status">);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InvoiceWithClient[];
    },
  });

  // Query para buscar NFS-e vinculadas às faturas
  const { data: nfseByInvoice = {} } = useQuery({
    queryKey: ["nfse-by-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_history")
        .select("invoice_id, status, numero_nfse")
        .not("invoice_id", "is", null);
      
      if (error) throw error;
      
      // Criar map: { invoice_id: { status, numero_nfse } }
      return (data || []).reduce<NfseByInvoice>((acc, n) => {
        if (n.invoice_id) {
          acc[n.invoice_id] = { status: n.status, numero_nfse: n.numero_nfse };
        }
        return acc;
      }, {});
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_date: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      toast.success("Fatura marcada como paga");
    },
  });

  const handleGeneratePayment = async (
    invoiceId: string, 
    paymentType: "boleto" | "pix",
    provider: "banco_inter" | "asaas" = "banco_inter"
  ) => {
    setGeneratingPayment(`${invoiceId}-${paymentType}-${provider}`);
    try {
      let data, error;
      
      if (provider === "asaas") {
        const result = await supabase.functions.invoke("asaas-nfse", {
          body: { 
            action: "create_payment",
            invoice_id: invoiceId, 
            billing_type: paymentType === "pix" ? "PIX" : "BOLETO" 
          },
        });
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase.functions.invoke("banco-inter", {
          body: { invoice_id: invoiceId, payment_type: paymentType },
        });
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (data.error) {
        if (data.configured === false) {
          toast.error(`Integração ${provider === "asaas" ? "Asaas" : "Banco Inter"} não configurada`, {
            description: "Configure as credenciais em Configurações → Integrações",
          });
        } else {
          toast.error(data.error);
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      toast.success(
        paymentType === "boleto" ? "Boleto gerado com sucesso!" : "PIX gerado com sucesso!",
        { description: `Via ${provider === "asaas" ? "Asaas" : "Banco Inter"}` }
      );
    } catch (error: any) {
      toast.error("Erro ao gerar pagamento", { description: error.message });
    } finally {
      setGeneratingPayment(null);
    }
  };

  const handleResendNotification = async (invoiceId: string, channels: ("email" | "whatsapp")[]) => {
    setSendingNotification(`${invoiceId}-${channels.join("-")}`);
    try {
      const { data, error } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoiceId, channels },
      });

      if (error) throw error;

      if (data.success) {
        const channelNames = channels.map(c => c === "email" ? "Email" : "WhatsApp").join(" e ");
        toast.success(`Cobrança enviada por ${channelNames}!`, {
          description: data.message,
        });
      } else {
        const failedResults = data.results?.filter((r: any) => !r.success) || [];
        for (const result of failedResults) {
          const channelLabel = result.channel === "email" ? "Email" : "WhatsApp";
          if (result.errorCode === "WHATSAPP_INTEGRATION_DISABLED") {
            toast.error(`${channelLabel}: Integração desativada`, {
              description: "Ative a integração do WhatsApp em Configurações → Integrações → Mensagens",
            });
          } else if (result.errorCode === "CLIENT_NO_WHATSAPP") {
            toast.error(`${channelLabel}: Cliente sem WhatsApp`, {
              description: result.error || "Cadastre o número de WhatsApp do cliente antes de enviar",
            });
          } else {
            toast.error(`${channelLabel}: ${result.error || "Erro desconhecido"}`);
          }
        }
      }
    } catch (error: any) {
      toast.error("Erro ao reenviar cobrança", { description: error.message });
    } finally {
      setSendingNotification(null);
    }
  };

  // Função "Emitir Completo" - Boleto + PIX + NFS-e + Enviar
  const handleEmitComplete = async (invoice: InvoiceWithClient) => {
    setProcessingComplete(invoice.id);
    const steps: string[] = [];
    
    // Determine provider from invoice or default to banco_inter
    const provider = invoice.billing_provider || "banco_inter";
    
    try {
      // 1. Gerar boleto se não existe
      if (!invoice.boleto_url) {
        if (provider === "asaas") {
          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: { action: "create_payment", invoice_id: invoice.id, billing_type: "BOLETO" },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao gerar boleto");
          steps.push("Boleto gerado (Asaas)");
        } else {
          const { data, error } = await supabase.functions.invoke("banco-inter", {
            body: { invoice_id: invoice.id, payment_type: "boleto" },
          });
          if (error) throw error;
          if (data.error && data.configured !== false) throw new Error(data.error);
          if (!data.error) steps.push("Boleto gerado (Inter)");
        }
      } else {
        steps.push("Boleto já existente");
      }
      
      // 2. Gerar PIX se não existe
      if (!invoice.pix_code) {
        if (provider === "asaas") {
          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: { action: "create_payment", invoice_id: invoice.id, billing_type: "PIX" },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao gerar PIX");
          steps.push("PIX gerado (Asaas)");
        } else {
          const { data, error } = await supabase.functions.invoke("banco-inter", {
            body: { invoice_id: invoice.id, payment_type: "pix" },
          });
          if (error) throw error;
          if (data.error && data.configured !== false) throw new Error(data.error);
          if (!data.error) steps.push("PIX gerado (Inter)");
        }
      } else {
        steps.push("PIX já existente");
      }
      
      // 3. Emitir NFS-e se tiver contrato e não existir NFS-e autorizada
      if (invoice.contract_id) {
        const existingNfse = nfseByInvoice[invoice.id];
        if (!existingNfse || !["autorizada", "processando"].includes(existingNfse.status)) {
          // Buscar dados do contrato
          const { data: contract } = await supabase
            .from("contracts")
            .select("name, description, nfse_descricao_customizada")
            .eq("id", invoice.contract_id)
            .single();
          
          const { data, error } = await supabase.functions.invoke("asaas-nfse", {
            body: {
              action: "emit",
              client_id: invoice.client_id,
              invoice_id: invoice.id,
              contract_id: invoice.contract_id,
              value: invoice.amount,
              service_description: contract?.nfse_descricao_customizada || contract?.description || `Prestação de serviços - ${contract?.name}`,
            },
          });
          if (error) throw error;
          if (!data.success) throw new Error(data.error || "Erro ao emitir NFS-e");
          steps.push("NFS-e emitida");
        } else {
          steps.push(`NFS-e ${existingNfse.status}`);
        }
      }
      
      // 4. Enviar notificações (Email + WhatsApp)
      const { data: notifData, error: notifError } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoice.id, channels: ["email", "whatsapp"] },
      });
      
      if (notifError) throw notifError;
      if (notifData.success) {
        steps.push("Notificações enviadas");
      } else {
        const failedChannels = notifData.results?.filter((r: any) => !r.success).map((r: any) => r.channel) || [];
        if (failedChannels.length > 0) {
          steps.push(`Notificações: ${failedChannels.length} falha(s)`);
        }
      }
      
      toast.success("Fatura processada com sucesso!", {
        description: steps.join(" • "),
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["nfse-by-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (error: any) {
      toast.error("Erro no processamento completo", {
        description: `${steps.length > 0 ? `Completado: ${steps.join(", ")}. ` : ""}Erro: ${error.message}`,
      });
    } finally {
      setProcessingComplete(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

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

  const handleGenerateMonthlyInvoices = async () => {
    setIsGeneratingMonthly(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-monthly-invoices", {
        body: {},
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Faturas geradas com sucesso!", {
          description: `${data.generated || 0} faturas criadas para o mês atual`,
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      } else {
        toast.error(data.error || "Erro ao gerar faturas");
      }
    } catch (error: any) {
      toast.error("Erro ao gerar faturas mensais", { description: error.message });
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
    } catch (error: any) {
      toast.error("Erro ao enviar notificações em lote", { description: error.message });
    } finally {
      setIsBatchNotifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Faturas</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoices.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <Clock className="h-4 w-4 text-status-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-warning">
              {formatCurrency(totalPending)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencido</CardTitle>
            <TrendingDown className="h-4 w-4 text-status-danger" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-danger">
              {formatCurrency(totalOverdue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <TrendingUp className="h-4 w-4 text-status-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-success">
              {formatCurrency(totalPaid)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar faturas..."
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
              <TableHead>#</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">
                    Nenhuma fatura encontrada
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono">
                    #{invoice.invoice_number}
                  </TableCell>
                  <TableCell className="font-medium">
                    {invoice.clients?.name || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.reference_month ? (
                      <span className="font-mono text-sm">
                        {invoice.reference_month.split("-").reverse().join("/")}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      {formatCurrency(invoice.amount)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(invoice.due_date), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={statusColors[invoice.status]}>
                        {statusIcons[invoice.status]}
                        <span className="ml-1">{statusLabels[invoice.status]}</span>
                      </Badge>
                      {/* Badge NFS-e vinculada */}
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
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {invoice.boleto_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(invoice.boleto_url!, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Ver Boleto
                        </Button>
                      )}
                      {invoice.pix_code && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPixDialogInvoice(invoice)}
                        >
                          <QrCode className="h-3 w-3 mr-1" />
                          Ver PIX
                        </Button>
                      )}

                      {(invoice.status === "pending" || invoice.status === "overdue") && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              {generatingPayment?.startsWith(invoice.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Emitir Completo - Ação principal integrada */}
                            <DropdownMenuItem
                              onClick={() => handleEmitComplete(invoice)}
                              disabled={processingComplete !== null || generatingPayment !== null}
                              className="font-medium text-primary"
                            >
                              {processingComplete === invoice.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Zap className="mr-2 h-4 w-4" />
                              )}
                              Emitir Completo
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            {!invoice.boleto_url && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Barcode className="mr-2 h-4 w-4" />
                                  Gerar Boleto
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onClick={() => handleGeneratePayment(invoice.id, "boleto", "banco_inter")}
                                    disabled={generatingPayment !== null}
                                  >
                                    <Building2 className="mr-2 h-4 w-4" />
                                    Banco Inter
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleGeneratePayment(invoice.id, "boleto", "asaas")}
                                    disabled={generatingPayment !== null}
                                  >
                                    <Building2 className="mr-2 h-4 w-4" />
                                    Asaas
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            {!invoice.pix_code && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <QrCode className="mr-2 h-4 w-4" />
                                  Gerar PIX
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onClick={() => handleGeneratePayment(invoice.id, "pix", "banco_inter")}
                                    disabled={generatingPayment !== null}
                                  >
                                    <Building2 className="mr-2 h-4 w-4" />
                                    Banco Inter
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleGeneratePayment(invoice.id, "pix", "asaas")}
                                    disabled={generatingPayment !== null}
                                  >
                                    <Building2 className="mr-2 h-4 w-4" />
                                    Asaas
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            <DropdownMenuItem
                              onClick={() => markAsPaidMutation.mutate(invoice.id)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Marcar como Pago
                            </DropdownMenuItem>
                            
                            {(invoice.boleto_url || invoice.pix_code) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleResendNotification(invoice.id, ["email"])}
                                  disabled={sendingNotification !== null}
                                >
                                  <Mail className="mr-2 h-4 w-4" />
                                  Enviar por Email
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleResendNotification(invoice.id, ["whatsapp"])}
                                  disabled={sendingNotification !== null}
                                >
                                  <MessageCircle className="mr-2 h-4 w-4" />
                                  Enviar por WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleResendNotification(invoice.id, ["email", "whatsapp"])}
                                  disabled={sendingNotification !== null}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Enviar Email + WhatsApp
                                </DropdownMenuItem>
                              </>
                            )}
                            
                            {invoice.contract_id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setNfseInvoice(invoice)}>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Emitir NFS-e Manual
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
