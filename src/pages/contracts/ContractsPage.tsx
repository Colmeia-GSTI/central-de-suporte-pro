import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, FileText, Edit, Trash2, Calendar, DollarSign, Receipt, TrendingUp, History, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContractAdjustmentDialog } from "@/components/contracts/ContractAdjustmentDialog";
import { ContractHistorySheet } from "@/components/contracts/ContractHistorySheet";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import type { Tables, Enums } from "@/integrations/supabase/types";

type ContractWithClient = Tables<"contracts"> & {
  clients: Tables<"clients"> | null;
  nfse_enabled?: boolean | null;
  nfse_service_code?: string | null;
};

const statusLabels: Record<Enums<"contract_status">, string> = {
  active: "Ativo",
  expired: "Expirado",
  cancelled: "Cancelado",
  pending: "Pendente",
};

const statusColors: Record<Enums<"contract_status">, string> = {
  active: "bg-status-success text-white",
  expired: "bg-status-danger text-white",
  cancelled: "bg-muted text-muted-foreground",
  pending: "bg-status-warning text-white",
};

const supportModelLabels: Record<Enums<"support_model">, string> = {
  ticket: "Por Ticket",
  hours_bank: "Banco de Horas",
  unlimited: "Ilimitado",
};

export default function ContractsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  const [adjustmentDialog, setAdjustmentDialog] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  const [historySheet, setHistorySheet] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  const [generateInvoiceConfirm, setGenerateInvoiceConfirm] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts", search],
    queryFn: async () => {
      let query = supabase
        .from("contracts")
        .select(`
          *,
          clients(id, name)
        `)
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ContractWithClient[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contrato excluído com sucesso" });
      setDeleteConfirm({ open: false, contract: null });
    },
    onError: () => {
      toast({ title: "Erro ao excluir contrato", variant: "destructive" });
    },
  });

  const handleEdit = (contract: ContractWithClient) => {
    navigate(`/contracts/edit/${contract.id}`);
  };

  const handleDeleteClick = (contract: ContractWithClient) => {
    setDeleteConfirm({ open: true, contract });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.contract) {
      deleteMutation.mutate(deleteConfirm.contract.id);
    }
  };

  const generateInvoiceMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.functions.invoke("generate-monthly-invoices", {
        body: { contract_id: contractId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setGenerateInvoiceConfirm({ open: false, contract: null });

      const stats = data.stats || { generated: 0, skipped: 0 };
      if (stats.generated > 0) {
        toast({ title: "Fatura gerada com sucesso!", description: `${stats.generated} fatura(s) criada(s)` });
      } else if (stats.skipped > 0) {
        toast({ title: "Fatura já existe para este mês", variant: "default" });
      } else {
        toast({ title: data.message || "Nenhuma fatura gerada" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao gerar fatura", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerateInvoice = () => {
    if (generateInvoiceConfirm.contract) {
      generateInvoiceMutation.mutate(generateInvoiceConfirm.contract.id);
    }
  };

  const currentMonth = `${new Date().getMonth() + 1}`.padStart(2, "0");
  const currentYear = new Date().getFullYear();
  const currentCompetence = `${currentMonth}/${currentYear}`;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contratos</h1>
            <p className="text-muted-foreground">
              Gerencie contratos de suporte
            </p>
          </div>
          <PermissionGate module="contracts" action="create">
            <Button onClick={() => navigate("/contracts/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Contrato
            </Button>
          </PermissionGate>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Valor Mensal</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div></TableCell>
                  </TableRow>
                ))
              ) : contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-muted-foreground">
                      Nenhum contrato encontrado
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <p className="font-medium">{contract.name}</p>
                    </TableCell>
                    <TableCell>
                      {contract.clients?.name || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {supportModelLabels[contract.support_model]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">
                            {formatCurrencyBRLWithSymbol(contract.monthly_value)}
                          </span>
                          {contract.nfse_enabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Receipt className="h-3.5 w-3.5 text-primary ml-1" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  NFS-e habilitada
                                  {contract.nfse_service_code && (
                                    <> (Código: {contract.nfse_service_code})</>
                                  )}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(contract.start_date), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                        {contract.end_date && (
                          <>
                            {" - "}
                            {format(new Date(contract.end_date), "dd/MM/yyyy", {
                              locale: ptBR,
                            })}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[contract.status]}>
                        {statusLabels[contract.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setHistorySheet({ open: true, contract })}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Ver histórico</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <PermissionGate module="contracts" action="edit">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setAdjustmentDialog({ open: true, contract })}
                                  disabled={contract.status !== "active"}
                                >
                                  <TrendingUp className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Aplicar reajuste anual</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <PermissionGate module="financial" action="manage">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setGenerateInvoiceConfirm({ open: true, contract })}
                                    disabled={contract.status !== "active" || generateInvoiceMutation.isPending}
                                  >
                                    {generateInvoiceMutation.isPending && generateInvoiceConfirm.contract?.id === contract.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Receipt className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Gerar fatura manual</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </PermissionGate>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(contract)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate module="contracts" action="delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(contract)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Contrato"
        description={`Tem certeza que deseja excluir o contrato "${deleteConfirm.contract?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteMutation.isPending}
      />

      {/* Contract Adjustment Dialog */}
      {adjustmentDialog.contract && (
        <ContractAdjustmentDialog
          open={adjustmentDialog.open}
          onOpenChange={(open) => setAdjustmentDialog({ ...adjustmentDialog, open })}
          contract={{
            id: adjustmentDialog.contract.id,
            name: adjustmentDialog.contract.name,
            monthly_value: adjustmentDialog.contract.monthly_value,
            adjustment_index: adjustmentDialog.contract.adjustment_index,
          }}
        />
      )}

      {/* Contract History Sheet */}
      {historySheet.contract && (
        <ContractHistorySheet
          open={historySheet.open}
          onOpenChange={(open) => setHistorySheet({ ...historySheet, open })}
          contract={{
            id: historySheet.contract.id,
            name: historySheet.contract.name,
            client_name: historySheet.contract.clients?.name,
          }}
        />
      )}

      {/* Generate Invoice Confirmation Dialog */}
      <ConfirmDialog
        open={generateInvoiceConfirm.open}
        onOpenChange={(open) => setGenerateInvoiceConfirm({ ...generateInvoiceConfirm, open })}
        title="Gerar Fatura Manual"
        description={`Gerar fatura para "${generateInvoiceConfirm.contract?.name}"?\n\nCompetência: ${currentCompetence}\nValor: ${generateInvoiceConfirm.contract ? formatCurrencyBRLWithSymbol(generateInvoiceConfirm.contract.monthly_value) : ""}`}
        confirmLabel="Gerar Fatura"
        onConfirm={handleGenerateInvoice}
        isLoading={generateInvoiceMutation.isPending}
      />
    </AppLayout>
  );
}
