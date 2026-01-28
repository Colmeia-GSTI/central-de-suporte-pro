import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  CheckCircle2,
  Barcode,
  AlertCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  Loader2,
  XCircle,
  Bell,
  AlertTriangle,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type BoletoInvoice = {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  boleto_barcode: string | null;
  boleto_url: string | null;
  notes: string | null;
  clients: { name: string } | null;
};

type IntegrationStatus = {
  configured: boolean;
  active: boolean;
  hasBoletoScope: boolean;
  hasPixScope: boolean;
  error?: string;
  checking: boolean;
};

export function BillingBoletosTab() {
  const [isPolling, setIsPolling] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; invoice: BoletoInvoice | null; isLoading: boolean }>({
    open: false,
    invoice: null,
    isLoading: false,
  });
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({
    configured: false,
    active: false,
    hasBoletoScope: false,
    hasPixScope: false,
    checking: true,
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    checkIntegrationStatus();
  }, []);

  const checkIntegrationStatus = async () => {
    setIntegrationStatus(prev => ({ ...prev, checking: true }));
    try {
      const { data: settings } = await supabase
        .from("integration_settings")
        .select("settings, is_active")
        .eq("integration_type", "banco_inter")
        .maybeSingle();

      if (!settings) {
        setIntegrationStatus({
          configured: false,
          active: false,
          hasBoletoScope: false,
          hasPixScope: false,
          checking: false,
          error: "Banco Inter não configurado",
        });
        return;
      }

      if (!settings.is_active) {
        setIntegrationStatus({
          configured: true,
          active: false,
          hasBoletoScope: false,
          hasPixScope: false,
          checking: false,
          error: "Integração desativada",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("banco-inter", {
        body: { action: "test" },
      });

      if (error) {
        setIntegrationStatus({
          configured: true,
          active: true,
          hasBoletoScope: false,
          hasPixScope: false,
          checking: false,
          error: "Erro ao testar conexão",
        });
        return;
      }

      const availableScopes = data?.available_scopes || [];
      const hasBoleto = availableScopes.some((s: string) => s.includes("boleto"));
      const hasPix = availableScopes.some((s: string) => s.includes("cob"));

      setIntegrationStatus({
        configured: true,
        active: true,
        hasBoletoScope: hasBoleto,
        hasPixScope: hasPix,
        checking: false,
        error: data?.error,
      });
    } catch (err: any) {
      setIntegrationStatus({
        configured: false,
        active: false,
        hasBoletoScope: false,
        hasPixScope: false,
        checking: false,
        error: err.message,
      });
    }
  };

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["boletos-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, due_date, status, boleto_barcode, boleto_url, notes, clients(name)")
        .eq("payment_method", "boleto")
        .order("due_date", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as BoletoInvoice[];
    },
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleForcePolling = async () => {
    setIsPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-boleto-status");
      if (error) throw error;
      
      toast.success("Polling executado", {
        description: `${data.processed || 0} consultados, ${data.updated || 0} atualizados`,
      });
      queryClient.invalidateQueries({ queryKey: ["boletos-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (error: any) {
      toast.error("Erro no polling", { description: error.message });
    } finally {
      setIsPolling(false);
    }
  };

  const handleCancelBoleto = async () => {
    if (!cancelDialog.invoice) return;

    setCancelDialog((prev) => ({ ...prev, isLoading: true }));
    try {
      const { data, error } = await supabase.functions.invoke("banco-inter", {
        body: {
          action: "cancel",
          invoice_id: cancelDialog.invoice.id,
          motivo_cancelamento: "ACERTOS",
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Boleto cancelado", {
        description: `Fatura #${cancelDialog.invoice.invoice_number} cancelada com sucesso`,
      });
      queryClient.invalidateQueries({ queryKey: ["boletos-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setCancelDialog({ open: false, invoice: null, isLoading: false });
    } catch (error: any) {
      toast.error("Erro ao cancelar boleto", { description: error.message });
      setCancelDialog((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleNotifyDueInvoices = async () => {
    setIsNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-due-invoices", {
        body: { days_before: 3 }
      });
      if (error) throw error;
      
      toast.success("Lembretes enviados", {
        description: data.message || `${data.summary?.total || 0} fatura(s) notificadas`,
      });
    } catch (error: any) {
      toast.error("Erro ao enviar lembretes", { description: error.message });
    } finally {
      setIsNotifying(false);
    }
  };

  const pendingProcessing = invoices.filter(
    (i) => i.status === "pending" && !i.boleto_barcode && i.notes?.includes("codigoSolicitacao")
  );
  const readyBoletos = invoices.filter(
    (i) => (i.status === "pending" || i.status === "overdue") && i.boleto_barcode
  );
  const paidBoletos = invoices.filter((i) => i.status === "paid");

  const stats = [
    {
      title: "Processando",
      value: pendingProcessing.length,
      description: "Aguardando código de barras",
      icon: Clock,
      color: "text-status-warning",
      bgColor: "bg-status-warning/10",
    },
    {
      title: "Prontos",
      value: readyBoletos.length,
      description: "Com código de barras",
      icon: Barcode,
      color: "text-chart-1",
      bgColor: "bg-chart-1/10",
    },
    {
      title: "Pagos",
      value: paidBoletos.length,
      description: "Baixados no sistema",
      icon: CheckCircle2,
      color: "text-status-success",
      bgColor: "bg-status-success/10",
    },
    {
      title: "Total",
      value: invoices.length,
      description: "Boletos gerados",
      icon: AlertCircle,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleNotifyDueInvoices} disabled={isNotifying}>
          {isNotifying ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Bell className="h-4 w-4 mr-2" />
          )}
          Enviar Lembretes
        </Button>
        <Button onClick={handleForcePolling} disabled={isPolling}>
          {isPolling ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Atualizar Status
        </Button>
      </div>

      {/* Integration Status Banner */}
      {integrationStatus.checking ? (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Verificando integração...</AlertTitle>
          <AlertDescription>
            Conectando ao Banco Inter para verificar status dos escopos.
          </AlertDescription>
        </Alert>
      ) : !integrationStatus.configured ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Banco Inter não configurado</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Configure a integração para gerar boletos automaticamente.</span>
            <Link to="/settings">
              <Button variant="outline" size="sm" className="ml-4">
                <Settings className="h-4 w-4 mr-2" />
                Configurar
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      ) : !integrationStatus.active ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Integração desativada</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>A integração com Banco Inter está desativada.</span>
            <Link to="/settings">
              <Button variant="outline" size="sm" className="ml-4">
                <Settings className="h-4 w-4 mr-2" />
                Ativar
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      ) : !integrationStatus.hasBoletoScope ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Escopos de boleto não habilitados</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              Os escopos <code className="bg-muted px-1 rounded">boleto-cobranca.read</code> e{" "}
              <code className="bg-muted px-1 rounded">boleto-cobranca.write</code> não estão habilitados.
            </p>
            <div className="flex items-center gap-2">
              <a href="https://developers.inter.co/" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Portal Inter
                </Button>
              </a>
              <Button variant="ghost" size="sm" onClick={checkIntegrationStatus}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Verificar novamente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-status-success/30 bg-status-success/5">
          <ShieldCheck className="h-4 w-4 text-status-success" />
          <AlertTitle className="text-status-success">Integração ativa</AlertTitle>
          <AlertDescription className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-status-success text-status-success">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Boleto
              </Badge>
              {integrationStatus.hasPixScope && (
                <Badge variant="outline" className="border-status-success text-status-success">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  PIX
                </Badge>
              )}
            </div>
            <span className="text-muted-foreground text-sm">
              Pronto para gerar boletos
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Processing */}
      {pendingProcessing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-status-warning" />
              Aguardando Processamento
            </CardTitle>
            <CardDescription>
              Boletos solicitados ao banco aguardando geração do código de barras
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingProcessing.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">#{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.clients?.name || "-"}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-status-warning text-status-warning">
                        <Clock className="h-3 w-3 mr-1" />
                        Processando
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Ready Boletos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5 text-chart-1" />
            Boletos Prontos
          </CardTitle>
          <CardDescription>
            Boletos com código de barras disponível aguardando pagamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : readyBoletos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum boleto pronto aguardando pagamento
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Código de Barras</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyBoletos.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">#{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.clients?.name || "-"}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {invoice.boleto_barcode?.slice(0, 20)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyToClipboard(invoice.boleto_barcode!, "Código de barras")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(invoice.boleto_url!, "_blank")}
                          disabled={!invoice.boleto_url}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setCancelDialog({ open: true, invoice, isLoading: false })}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Paid Boletos */}
      {paidBoletos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-status-success" />
              Boletos Pagos
            </CardTitle>
            <CardDescription>
              Boletos baixados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paidBoletos.slice(0, 10).map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">#{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.clients?.name || "-"}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-status-success text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Pago
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={cancelDialog.open}
        onOpenChange={(open) => setCancelDialog({ ...cancelDialog, open })}
        title="Cancelar Boleto"
        description={`Tem certeza que deseja cancelar o boleto da fatura #${cancelDialog.invoice?.invoice_number}? Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar Boleto"
        variant="destructive"
        onConfirm={handleCancelBoleto}
        isLoading={cancelDialog.isLoading}
      />
    </div>
  );
}
