import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  QrCode,
  FileText,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";

interface ClientPortalFinancialTabProps {
  clientId: string;
}

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  renegotiated: "Renegociado",
  lost: "Perdido",
};

const statusConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  pending: {
    icon: <Clock className="h-3 w-3" />,
    className: "bg-status-warning/20 text-status-warning border-status-warning/30",
  },
  paid: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-status-success/20 text-status-success border-status-success/30",
  },
  overdue: {
    icon: <AlertTriangle className="h-3 w-3" />,
    className: "bg-status-danger/20 text-status-danger border-status-danger/30",
  },
  cancelled: {
    icon: null,
    className: "bg-muted text-muted-foreground",
  },
};

export function ClientPortalFinancialTab({ clientId }: ClientPortalFinancialTabProps) {
  const [statusFilter, setStatusFilter] = useState("all");

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["client-portal-invoices", clientId, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("id, invoice_number, amount, due_date, status, paid_date, paid_amount, boleto_url, boleto_barcode, pix_code, fine_amount, interest_amount, installment_number, total_installments")
        .eq("client_id", clientId)
        .neq("status", "cancelled")
        .order("due_date", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Fetch NFS-e for download
  const { data: nfseList = [] } = useQuery({
    queryKey: ["client-portal-nfse", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_history")
        .select("id, invoice_id, numero_nfse, status, valor_servico, data_emissao, pdf_url, xml_url")
        .eq("client_id", clientId)
        .eq("status", "autorizada")
        .order("data_emissao", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const nfseByInvoice = nfseList.reduce<Record<string, typeof nfseList[0]>>((acc, n) => {
    if (n.invoice_id) acc[n.invoice_id] = n;
    return acc;
  }, {});

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const totalPending = invoices
    .filter((i) => i.status === "pending")
    .reduce((acc, i) => acc + Number(i.amount), 0);
  const totalOverdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((acc, i) => acc + Number(i.amount) + Number(i.fine_amount || 0) + Number(i.interest_amount || 0), 0);
  const totalPaidThisMonth = invoices
    .filter((i) => i.status === "paid" && i.paid_date?.startsWith(currentMonth))
    .reduce((acc, i) => acc + Number(i.paid_amount || i.amount), 0);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalPending)}</p>
          </CardContent>
        </Card>
        <Card className={totalOverdue > 0 ? "border-status-danger/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${totalOverdue > 0 ? "text-status-danger" : ""}`} />
              Vencido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalOverdue > 0 ? "text-status-danger" : ""}`}>
              {formatCurrency(totalOverdue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-status-success" />
              Pago no Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-status-success">{formatCurrency(totalPaidThisMonth)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="overdue">Vencidos</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Faturas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma fatura encontrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>NFS-e</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const config = statusConfig[invoice.status] || statusConfig.pending;
                  const nfse = nfseByInvoice[invoice.id];
                  const totalWithPenalties = Number(invoice.amount) + Number(invoice.fine_amount || 0) + Number(invoice.interest_amount || 0);

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono">
                        #{invoice.invoice_number}
                        {invoice.total_installments && invoice.total_installments > 1 && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Parcela {invoice.installment_number}/{invoice.total_installments}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{formatCurrency(Number(invoice.amount))}</span>
                          {invoice.status === "overdue" && (invoice.fine_amount || invoice.interest_amount) ? (
                            <div className="text-xs text-status-danger">
                              Total: {formatCurrency(totalWithPenalties)}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={config.className}>
                          {config.icon}
                          <span className="ml-1">{statusLabels[invoice.status]}</span>
                        </Badge>
                        {invoice.status === "paid" && invoice.paid_date && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(invoice.paid_date), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {nfse ? (
                          <div className="flex items-center gap-1">
                            <FileText className="h-3 w-3 text-status-success" />
                            <span className="text-xs">#{nfse.numero_nfse}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Boleto */}
                          {invoice.boleto_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Ver Boleto"
                              onClick={() => window.open(invoice.boleto_url!, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Código de barras */}
                          {invoice.boleto_barcode && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Copiar Código de Barras"
                              onClick={() => copyToClipboard(invoice.boleto_barcode!, "Código de barras")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {/* PIX */}
                          {invoice.pix_code && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Copiar PIX"
                              onClick={() => copyToClipboard(invoice.pix_code!, "Código PIX")}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          )}
                          {/* NFS-e PDF */}
                          {nfse?.pdf_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Download NFS-e"
                              onClick={() => window.open(nfse.pdf_url!, "_blank")}
                            >
                              <Download className="h-4 w-4" />
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
    </div>
  );
}
