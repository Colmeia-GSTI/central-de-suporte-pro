import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertTriangle,
  Barcode,
  FileText,
  Mail,
  RefreshCw,
  Loader2,
  RotateCcw,
  Send,
  Link2,
  Search,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { NfseServiceCodeCombobox } from "@/components/billing/nfse/NfseServiceCodeCombobox";
import { NfseLinkExternalDialog } from "@/components/billing/nfse/NfseLinkExternalDialog";
import type { NfseWithRelations } from "@/components/billing/nfse/NfseDetailsSheet";

type ErrorInvoice = {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  boleto_status: string | null;
  boleto_error_msg: string | null;
  nfse_status: string | null;
  nfse_error_msg: string | null;
  email_status: string | null;
  email_error_msg: string | null;
  billing_provider: string | null;
  contract_id: string | null;
  clients: { name: string } | null;
};

type ErrorNfse = {
  id: string;
  invoice_id: string | null;
  client_id: string | null;
  contract_id: string | null;
  numero_nfse: string | null;
  status: string;
  mensagem_retorno: string | null;
  valor_servico: number | null;
  descricao_servico: string | null;
  codigo_tributacao: string | null;
  competencia: string | null;
  created_at: string;
  clients: { name: string } | null;
  contracts: { name: string; nfse_service_code: string | null } | null;
};

export function BillingErrorsPanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"boletos" | "nfse" | "notifications">("boletos");
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editingServiceCode, setEditingServiceCode] = useState<string | null>(null);
  const [linkNfse, setLinkNfse] = useState<NfseWithRelations | null>(null);

  // Boleto errors
  const { data: boletoErrors = [], isLoading: loadingBoletos } = useQuery({
    queryKey: ["billing-errors-boletos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, due_date, status, boleto_status, boleto_error_msg, billing_provider, contract_id, clients(name), nfse_status, nfse_error_msg, email_status, email_error_msg")
        .or("boleto_status.eq.erro,and(payment_method.eq.boleto,boleto_barcode.is.null,status.in.(pending,overdue),billing_provider.not.is.null)")
        .order("due_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ErrorInvoice[];
    },
  });

  // NFS-e errors
  const { data: nfseErrors = [], isLoading: loadingNfse } = useQuery({
    queryKey: ["billing-errors-nfse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_history")
        .select("id, invoice_id, client_id, contract_id, numero_nfse, status, mensagem_retorno, valor_servico, descricao_servico, codigo_tributacao, competencia, created_at, clients(name), contracts(name, nfse_service_code)")
        .in("status", ["erro", "rejeitada"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ErrorNfse[];
    },
  });

  // Email errors
  const { data: emailErrors = [], isLoading: loadingEmails } = useQuery({
    queryKey: ["billing-errors-emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, due_date, status, email_status, email_error_msg, clients(name), boleto_status, boleto_error_msg, nfse_status, nfse_error_msg, billing_provider, contract_id")
        .eq("email_status", "erro")
        .order("due_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ErrorInvoice[];
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["billing-errors-boletos"] });
    queryClient.invalidateQueries({ queryKey: ["billing-errors-nfse"] });
    queryClient.invalidateQueries({ queryKey: ["billing-errors-emails"] });
    queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const handleRegenerateBoleto = async (invoice: ErrorInvoice) => {
    setReprocessingId(invoice.id);
    try {
      const provider = invoice.billing_provider || "banco_inter";
      const fnName = provider === "asaas" ? "asaas-nfse" : "banco-inter";
      const body = provider === "asaas"
        ? { action: "create_payment", invoice_id: invoice.id, billing_type: "BOLETO" }
        : { action: "generate", invoice_id: invoice.id };
      
      const { error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      toast.success("Boleto reenviado para geração");
      invalidateAll();
    } catch (e: unknown) {
      toast.error("Erro ao regenerar boleto", { description: getErrorMessage(e) });
    } finally {
      setReprocessingId(null);
    }
  };

  const handleForcePolling = async (invoiceId: string) => {
    setPollingId(invoiceId);
    try {
      const { data, error } = await supabase.functions.invoke("poll-boleto-status");
      if (error) throw error;
      toast.success("Polling executado", {
        description: `${data.processed || 0} consultados, ${data.updated || 0} atualizados`,
      });
      invalidateAll();
    } catch (e: unknown) {
      toast.error("Erro no polling", { description: getErrorMessage(e) });
    } finally {
      setPollingId(null);
    }
  };

  const handleReprocessNfse = async (nfse: ErrorNfse) => {
    setReprocessingId(nfse.id);
    try {
      await supabase.from("nfse_history").update({ status: "processando" }).eq("id", nfse.id);
      const isStandalone = !nfse.contract_id;
      const { error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: isStandalone ? "emit_standalone" : "emit",
          nfse_history_id: nfse.id,
          invoice_id: nfse.invoice_id,
          client_id: nfse.client_id,
          ...(nfse.contract_id ? { contract_id: nfse.contract_id } : {}),
          value: nfse.valor_servico,
          service_description: nfse.descricao_servico,
          municipal_service_code: nfse.codigo_tributacao || undefined,
        },
      });
      if (error) throw error;
      toast.success("NFS-e reenviada para processamento");
      invalidateAll();
    } catch (e: unknown) {
      toast.error("Erro ao reprocessar", { description: getErrorMessage(e) });
    } finally {
      setReprocessingId(null);
    }
  };

  const handleUpdateServiceCode = async (nfse: ErrorNfse, newCode: string) => {
    try {
      // Update contract's service code
      if (nfse.contract_id) {
        await supabase.from("contracts").update({ nfse_service_code: newCode }).eq("id", nfse.contract_id);
      }
      // Update nfse_history
      await supabase.from("nfse_history").update({ codigo_tributacao: newCode }).eq("id", nfse.id);
      toast.success("Código de serviço atualizado");
      setEditingServiceCode(null);
      invalidateAll();
    } catch (e: unknown) {
      toast.error("Erro ao atualizar código", { description: getErrorMessage(e) });
    }
  };

  const handleResendNotification = async (invoice: ErrorInvoice, channel: "email" | "whatsapp") => {
    setResendingId(invoice.id);
    try {
      const { error } = await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoice.id, channels: [channel] },
      });
      if (error) throw error;
      toast.success(`Notificação reenviada via ${channel === "email" ? "E-mail" : "WhatsApp"}`);
      invalidateAll();
    } catch (e: unknown) {
      toast.error("Erro ao reenviar", { description: getErrorMessage(e) });
    } finally {
      setResendingId(null);
    }
  };

  const isE0014 = (msg: string | null) => msg?.includes("E0014") || msg?.includes("duplicada");


  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={boletoErrors.length > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Barcode className="h-4 w-4 text-destructive" />
              Boletos com Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${boletoErrors.length > 0 ? "text-destructive" : "text-status-success"}`}>
              {boletoErrors.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {boletoErrors.filter(b => b.boleto_status === "erro").length} com erro, {boletoErrors.filter(b => b.boleto_status !== "erro").length} órfãos
            </p>
          </CardContent>
        </Card>

        <Card className={nfseErrors.length > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-destructive" />
              NFS-e com Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${nfseErrors.length > 0 ? "text-destructive" : "text-status-success"}`}>
              {nfseErrors.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {nfseErrors.filter(n => n.status === "rejeitada").length} rejeitadas, {nfseErrors.filter(n => n.status === "erro").length} com erro
            </p>
          </CardContent>
        </Card>

        <Card className={emailErrors.length > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-destructive" />
              Notificações com Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${emailErrors.length > 0 ? "text-destructive" : "text-status-success"}`}>
              {emailErrors.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">e-mails não enviados</p>
          </CardContent>
        </Card>
      </div>

      {/* Error tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="boletos" className="flex items-center gap-2">
            <Barcode className="h-4 w-4" />
            Boletos
            {boletoErrors.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">{boletoErrors.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="nfse" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            NFS-e
            {nfseErrors.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">{nfseErrors.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Notificações
            {emailErrors.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">{emailErrors.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Boleto Errors */}
        <TabsContent value="boletos" className="mt-4">
          {loadingBoletos ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : boletoErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Barcode className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum boleto com erro</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fatura</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Provedor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boletoErrors.map((inv) => {
                    const isOrphan = inv.boleto_status !== "erro";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">#{inv.invoice_number}</TableCell>
                        <TableCell>{inv.clients?.name || "—"}</TableCell>
                        <TableCell>{formatCurrency(inv.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {inv.billing_provider === "asaas" ? "Asaas" : "Inter"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isOrphan ? "secondary" : "destructive"} className="text-xs">
                            {isOrphan ? "Órfão" : "Erro API"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-xs text-destructive truncate block">
                            {inv.boleto_error_msg || (isOrphan ? "Sem código de barras" : "—")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={reprocessingId === inv.id}
                              onClick={() => handleRegenerateBoleto(inv)}
                            >
                              {reprocessingId === inv.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3 mr-1" />
                              )}
                              Regenerar
                            </Button>
                            {isOrphan && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={pollingId === inv.id}
                                onClick={() => handleForcePolling(inv.id)}
                              >
                                {pollingId === inv.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Search className="h-3 w-3 mr-1" />
                                )}
                                Polling
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* NFS-e Errors */}
        <TabsContent value="nfse" className="mt-4">
          {loadingNfse ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : nfseErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma NFS-e com erro</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº / ID</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Código Serviço</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nfseErrors.map((nfse) => {
                    const isDuplicate = isE0014(nfse.mensagem_retorno);
                    const missingCode = nfse.mensagem_retorno?.toLowerCase().includes("código") || !nfse.codigo_tributacao;
                    return (
                      <TableRow key={nfse.id}>
                        <TableCell className="font-medium">
                          {nfse.numero_nfse || nfse.id.slice(0, 8)}
                        </TableCell>
                        <TableCell>{nfse.clients?.name || "—"}</TableCell>
                        <TableCell>{formatCurrency(nfse.valor_servico || 0)}</TableCell>
                        <TableCell>{nfse.competencia || "—"}</TableCell>
                        <TableCell>
                          {editingServiceCode === nfse.id ? (
                            <div className="flex items-center gap-1 min-w-[180px]">
                              <NfseServiceCodeCombobox
                                value={nfse.codigo_tributacao || ""}
                                onValueChange={(code) => handleUpdateServiceCode(nfse, code)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-1"
                                onClick={() => setEditingServiceCode(null)}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Badge
                              variant={nfse.codigo_tributacao ? "outline" : "destructive"}
                              className="text-xs cursor-pointer"
                              onClick={() => setEditingServiceCode(nfse.id)}
                            >
                              {nfse.codigo_tributacao || "Não definido"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-xs text-destructive truncate block">
                            {nfse.mensagem_retorno || "Erro desconhecido"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isDuplicate ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setLinkNfse(nfse as any)}
                              >
                                <Link2 className="h-3 w-3 mr-1" />
                                Vincular
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={reprocessingId === nfse.id}
                                onClick={() => handleReprocessNfse(nfse)}
                              >
                                {reprocessingId === nfse.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                )}
                                Reprocessar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Notification Errors */}
        <TabsContent value="notifications" className="mt-4">
          {loadingEmails ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : emailErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma notificação com erro</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fatura</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailErrors.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">#{inv.invoice_number}</TableCell>
                      <TableCell>{inv.clients?.name || "—"}</TableCell>
                      <TableCell>{formatCurrency(inv.amount)}</TableCell>
                      <TableCell>
                        {format(new Date(inv.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="text-xs text-destructive truncate block">
                          {inv.email_error_msg || "Erro no envio"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={resendingId === inv.id}
                            onClick={() => handleResendNotification(inv, "email")}
                          >
                            {resendingId === inv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Mail className="h-3 w-3 mr-1" />
                            )}
                            Email
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={resendingId === inv.id}
                            onClick={() => handleResendNotification(inv, "whatsapp")}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            WhatsApp
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Refresh button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={invalidateAll}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar Todos
        </Button>
      </div>

      {/* Link External NFS-e Dialog */}
      {linkNfse && (
        <NfseLinkExternalDialog
          nfse={linkNfse}
          open={!!linkNfse}
          onOpenChange={(open) => {
            if (!open) setLinkNfse(null);
          }}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  );
}
