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
};

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

export function BillingInvoicesTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState<string | null>(null);
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
        .select("*, clients(name), contract_id")
        .order("due_date", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as Enums<"invoice_status">);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InvoiceWithClient[];
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

  const handleGeneratePayment = async (invoiceId: string, paymentType: "boleto" | "pix") => {
    setGeneratingPayment(`${invoiceId}-${paymentType}`);
    try {
      const { data, error } = await supabase.functions.invoke("banco-inter", {
        body: { invoice_id: invoiceId, payment_type: paymentType },
      });

      if (error) throw error;

      if (data.error) {
        if (data.configured === false) {
          toast.error("Integração Banco Inter não configurada", {
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
        paymentType === "boleto" ? "Boleto gerado com sucesso!" : "PIX gerado com sucesso!"
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
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
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
                    <Badge className={statusColors[invoice.status]}>
                      {statusIcons[invoice.status]}
                      <span className="ml-1">{statusLabels[invoice.status]}</span>
                    </Badge>
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
                            {!invoice.boleto_url && (
                              <DropdownMenuItem
                                onClick={() => handleGeneratePayment(invoice.id, "boleto")}
                                disabled={generatingPayment !== null}
                              >
                                <Barcode className="mr-2 h-4 w-4" />
                                Gerar Boleto
                              </DropdownMenuItem>
                            )}
                            {!invoice.pix_code && (
                              <DropdownMenuItem
                                onClick={() => handleGeneratePayment(invoice.id, "pix")}
                                disabled={generatingPayment !== null}
                              >
                                <QrCode className="mr-2 h-4 w-4" />
                                Gerar PIX
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => markAsPaidMutation.mutate(invoice.id)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Marcar como Pago
                            </DropdownMenuItem>
                            {(invoice.boleto_url || invoice.pix_code) && (
                              <>
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
                              <DropdownMenuItem onClick={() => setNfseInvoice(invoice)}>
                                <FileText className="mr-2 h-4 w-4" />
                                Emitir NFS-e
                              </DropdownMenuItem>
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
