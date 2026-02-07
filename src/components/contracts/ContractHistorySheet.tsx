import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History,
  FileText,
  Receipt,
  Package,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  QrCode,
} from "lucide-react";
import { ContractInvoiceActionsMenu, type ContractInvoiceData } from "./ContractInvoiceActionsMenu";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";

interface ContractHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    name: string;
    client_name?: string;
  };
}

type HistoryEntry = {
  id: string;
  action: string;
  changes: Record<string, any> | null;
  comment: string | null;
  created_at: string;
  user_id: string | null;
};

type ServiceHistoryEntry = {
  id: string;
  action: string;
  service_name: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  created_at: string;
  user_id: string | null;
};

type InvoiceEntry = ContractInvoiceData;

export function ContractHistorySheet({
  open,
  onOpenChange,
  contract,
}: ContractHistorySheetProps) {
  const [activeTab, setActiveTab] = useState("changes");

  // Fetch contract history (changes)
  const { data: contractHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["contract-history", contract.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_history")
        .select(`
          id,
          action,
          changes,
          comment,
          created_at,
          user_id
        `)
        .eq("contract_id", contract.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as HistoryEntry[];
    },
    enabled: open,
  });

  // Fetch service history
  const { data: serviceHistory = [], isLoading: serviceLoading } = useQuery({
    queryKey: ["contract-service-history", contract.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_service_history")
        .select(`
          id,
          action,
          service_name,
          old_value,
          new_value,
          created_at,
          user_id
        `)
        .eq("contract_id", contract.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ServiceHistoryEntry[];
    },
    enabled: open,
  });

  // Fetch invoices with NFS-e history
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["contract-invoices", contract.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          amount,
          due_date,
          status,
          paid_date,
          reference_month,
          boleto_url,
          boleto_barcode,
          pix_code,
          client_id,
          contract_id,
          billing_provider,
          clients(name),
          nfse_history(id, numero_nfse, status, created_at)
        `)
        .eq("contract_id", contract.id)
        .order("due_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as InvoiceEntry[];
    },
    enabled: open,
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case "created":
        return <Plus className="h-4 w-4 text-green-600" />;
      case "updated":
        return <Edit2 className="h-4 w-4 text-blue-600" />;
      case "added":
        return <Plus className="h-4 w-4 text-green-600" />;
      case "removed":
        return <Trash2 className="h-4 w-4 text-red-600" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "created":
        return "Criado";
      case "updated":
        return "Atualizado";
      case "added":
        return "Adicionado";
      case "removed":
        return "Removido";
      default:
        return action;
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-status-success text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Pago
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-status-warning text-white">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
      case "overdue":
        return (
          <Badge className="bg-status-danger text-white">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Vencido
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getNfseStatusBadge = (status: string) => {
    switch (status) {
      case "authorized":
        return (
          <Badge className="bg-green-600 text-white text-xs">Autorizada</Badge>
        );
      case "processing":
        return (
          <Badge className="bg-blue-600 text-white text-xs">Processando</Badge>
        );
      case "error":
        return <Badge className="bg-red-600 text-white text-xs">Erro</Badge>;
      case "cancelled":
        return <Badge variant="secondary" className="text-xs">Cancelada</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  // Extract all NFS-e records from invoices
  const allNfseRecords = invoices.flatMap((invoice) =>
    invoice.nfse_history.map((nfse) => ({
      ...nfse,
      invoice_number: invoice.invoice_number,
      invoice_id: invoice.id,
    }))
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico: {contract.name}
          </SheetTitle>
          {contract.client_name && (
            <p className="text-sm text-muted-foreground">{contract.client_name}</p>
          )}
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="changes" className="text-xs">
              <Edit2 className="h-3 w-3 mr-1" />
              Alterações
            </TabsTrigger>
            <TabsTrigger value="services" className="text-xs">
              <Package className="h-3 w-3 mr-1" />
              Serviços
            </TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Faturas
            </TabsTrigger>
            <TabsTrigger value="nfse" className="text-xs">
              <Receipt className="h-3 w-3 mr-1" />
              NFS-e
            </TabsTrigger>
          </TabsList>

          {/* Changes Tab */}
          <TabsContent value="changes" className="mt-4">
            <ScrollArea className="h-[calc(100vh-220px)]">
              {historyLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : contractHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto opacity-50 mb-2" />
                  <p>Nenhuma alteração registrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contractHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-shrink-0 mt-1">
                        {getActionIcon(entry.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {getActionLabel(entry.action)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(entry.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                        {entry.comment && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {entry.comment}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="mt-4">
            <ScrollArea className="h-[calc(100vh-220px)]">
              {serviceLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : serviceHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto opacity-50 mb-2" />
                  <p>Nenhuma alteração de serviços</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {serviceHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-shrink-0 mt-1">
                        {getActionIcon(entry.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{entry.service_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(entry.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getActionLabel(entry.action)}
                        </p>
                        {entry.action === "updated" && entry.old_value && entry.new_value && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            <span>
                              Qtd: {(entry.old_value as any).quantity || 0} →{" "}
                              {(entry.new_value as any).quantity || 0}
                            </span>
                            {" | "}
                            <span>
                              Valor:{" "}
                              {formatCurrencyBRLWithSymbol(
                                (entry.old_value as any).value || 0
                              )}{" "}
                              →{" "}
                              {formatCurrencyBRLWithSymbol(
                                (entry.new_value as any).value || 0
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-4">
            <ScrollArea className="h-[calc(100vh-220px)]">
              {invoicesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto opacity-50 mb-2" />
                  <p>Nenhuma fatura gerada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            #{invoice.invoice_number}
                          </span>
                          {getInvoiceStatusBadge(invoice.status)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">
                            {formatCurrencyBRLWithSymbol(invoice.amount)}
                          </span>
                          {(invoice.status === "pending" || invoice.status === "overdue") && (
                            <ContractInvoiceActionsMenu
                              invoice={invoice}
                              clientName={contract.client_name}
                            />
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          Venc.:{" "}
                          {format(new Date(invoice.due_date), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </span>
                        {invoice.reference_month && (
                          <span>Ref.: {invoice.reference_month}</span>
                        )}
                      </div>
                      {invoice.paid_date && (
                        <div className="mt-1 text-xs text-green-600">
                          Pago em:{" "}
                          {format(new Date(invoice.paid_date), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </div>
                      )}
                      {/* Quick action buttons for boleto/pix */}
                      {(invoice.boleto_url || invoice.pix_code) && (
                        <div className="mt-2 flex items-center gap-2">
                          {invoice.boleto_url && (
                            <button
                              onClick={() => window.open(invoice.boleto_url!, "_blank")}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Boleto
                            </button>
                          )}
                          {invoice.pix_code && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <QrCode className="h-3 w-3" />
                              PIX gerado
                            </span>
                          )}
                        </div>
                      )}
                      {invoice.nfse_history.length > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <Receipt className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {invoice.nfse_history.length} NFS-e vinculada(s)
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* NFS-e Tab */}
          <TabsContent value="nfse" className="mt-4">
            <ScrollArea className="h-[calc(100vh-220px)]">
              {invoicesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : allNfseRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto opacity-50 mb-2" />
                  <p>Nenhuma NFS-e emitida</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allNfseRecords.map((nfse) => (
                    <div
                      key={nfse.id}
                      className="p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {nfse.numero_nfse || "Aguardando número"}
                          </span>
                          {getNfseStatusBadge(nfse.status)}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Fatura #{nfse.invoice_number}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {format(new Date(nfse.created_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
