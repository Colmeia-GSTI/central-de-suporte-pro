import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ContractAdditionalChargeDialog } from "@/components/contracts/ContractAdditionalChargeDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, FileText, Edit, Trash2, Calendar, DollarSign, Receipt, TrendingUp, History, Loader2, PackagePlus, CheckCircle2, AlertTriangle, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContractAdjustmentDialog } from "@/components/contracts/ContractAdjustmentDialog";
import { ContractHistorySheet } from "@/components/contracts/ContractHistorySheet";
import { ContractInvoicesSheet } from "@/components/contracts/ContractInvoicesSheet";
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

interface InvoiceSummary {
  contract_id: string;
  paid_count: number;
  paid_total: number;
  overdue_count: number;
  overdue_total: number;
  pending_count: number;
  total_invoiced: number;
}

const statusLabels: Record<Enums<"contract_status">, string> = {
  active: "Ativo",
  expired: "Expirado",
  cancelled: "Cancelado",
  pending: "Pendente",
  suspended: "Suspenso",
};

const statusColors: Record<Enums<"contract_status">, string> = {
  active: "bg-status-success text-white",
  expired: "bg-status-danger text-white",
  cancelled: "bg-muted text-muted-foreground",
  pending: "bg-status-warning text-white",
  suspended: "bg-amber-500 text-white",
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
  const [invoicesSheet, setInvoicesSheet] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  const [generateInvoiceConfirm, setGenerateInvoiceConfirm] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  const [additionalChargeDialog, setAdditionalChargeDialog] = useState<{ open: boolean; contract: ContractWithClient | null }>({
    open: false,
    contract: null,
  });
  
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

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data as ContractWithClient[];
    },
  });

  // Query paralela para resumo financeiro via RPC
  const { data: summaryMap = {} } = useQuery({
    queryKey: ["contracts-invoice-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_contracts_invoice_summary");
      if (error) throw error;
      const map: Record<string, InvoiceSummary> = {};
      for (const row of (data as InvoiceSummary[]) || []) {
        map[row.contract_id] = row;
      }
      return map;
    },
    staleTime: 2 * 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contrato excluído com sucesso");
      setDeleteConfirm({ open: false, contract: null });
    },
    onError: () => {
      toast.error("Erro ao excluir contrato");
    },
  });

  const handleEdit = (contract: ContractWithClient) => {
    navigate(`/contracts/edit/${contract.id}`);
  };

  const [deleteBlocked, setDeleteBlocked] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  const [checkingDelete, setCheckingDelete] = useState(false);

  const handleDeleteClick = async (contract: ContractWithClient) => {
    setCheckingDelete(true);
    try {
      const { count: activeInvoices, error } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", contract.id)
        .neq("status", "cancelled");

      if (error) throw error;

      if (activeInvoices && activeInvoices > 0) {
        setDeleteBlocked({
          open: true,
          message: `Este contrato possui ${activeInvoices} fatura(s) ativa(s). Cancele todas as faturas antes de excluir o contrato.`,
        });
      } else {
        setDeleteConfirm({ open: true, contract });
      }
    } catch {
      toast.error("Erro ao verificar faturas vinculadas");
    } finally {
      setCheckingDelete(false);
    }
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
      queryClient.invalidateQueries({ queryKey: ["contracts-invoice-summary"] });
      setGenerateInvoiceConfirm({ open: false, contract: null });

      const stats = data.stats || { generated: 0, skipped: 0 };
      if (stats.generated > 0) {
        toast.success(`${stats.generated} fatura(s) criada(s)`);
      } else if (stats.skipped > 0) {
        toast.info("Fatura já existe para este mês");
      } else {
        toast.info(data.message || "Nenhuma fatura gerada");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao gerar fatura");
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
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Contrato</TableHead>
                <TableHead className="min-w-[160px]">Cliente</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="whitespace-nowrap">Valor Mensal</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead className="whitespace-nowrap">Próx. Reajuste</TableHead>
                <TableHead>Quitado</TableHead>
                <TableHead>Atrasado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[120px]">Ações</TableHead>
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
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div></TableCell>
                  </TableRow>
                ))
              ) : contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-muted-foreground">
                      Nenhum contrato encontrado
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => {
                  const summary = summaryMap[contract.id];
                  return (
                    <TableRow
                      key={contract.id}
                      className="cursor-pointer"
                      onClick={() => handleEdit(contract)}
                    >
                      <TableCell>
                        <p className="font-medium max-w-[180px] truncate" title={contract.name}>{contract.name}</p>
                      </TableCell>
                      <TableCell>
                        <span className="max-w-[180px] truncate block" title={contract.clients?.name || ""}>
                          {contract.clients?.name || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </span>
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
                        <div className="flex items-center gap-1 text-sm whitespace-nowrap">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {format(new Date(contract.start_date), "dd/MM/yy", { locale: ptBR })}
                          {contract.end_date ? (
                            <span className="text-muted-foreground">
                              → {format(new Date(contract.end_date), "dd/MM/yy", { locale: ptBR })}
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Ilimitado</Badge>
                          )}
                        </div>
                      </TableCell>
                      {/* Próx. Reajuste */}
                      <TableCell>
                        {contract.adjustment_date ? (() => {
                          const adjustDate = new Date(contract.adjustment_date);
                          const now = new Date();
                          const diffDays = Math.ceil((adjustDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          const isPending = diffDays <= 30 && diffDays >= 0;
                          const isOverdue = diffDays < 0;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm ${isOverdue ? "text-destructive font-medium" : isPending ? "text-status-warning font-medium" : ""}`}>
                                {format(adjustDate, "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Vencido
                                </Badge>
                              )}
                              {isPending && !isOverdue && (
                                <Badge className="bg-status-warning text-white text-[10px] px-1.5 py-0">
                                  Próximo
                                </Badge>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      {/* Quitado */}
                      <TableCell>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-status-success/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvoicesSheet({ open: true, contract });
                          }}
                          aria-label="Ver parcelas pagas"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                          <span className="font-semibold text-status-success">
                            {summary?.paid_count ?? 0}
                          </span>
                          {summary && summary.paid_total > 0 && (
                            <span className="text-muted-foreground font-mono hidden lg:inline">
                              {formatCurrencyBRLWithSymbol(summary.paid_total)}
                            </span>
                          )}
                        </button>
                      </TableCell>
                      {/* Atrasado */}
                      <TableCell>
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            summary && summary.overdue_count > 0
                              ? "hover:bg-status-danger/10"
                              : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvoicesSheet({ open: true, contract });
                          }}
                          aria-label="Ver parcelas atrasadas"
                        >
                          <AlertTriangle
                            className={`h-3.5 w-3.5 ${
                              summary && summary.overdue_count > 0
                                ? "text-status-danger"
                                : "text-muted-foreground/50"
                            }`}
                          />
                          <span
                            className={`font-semibold ${
                              summary && summary.overdue_count > 0
                                ? "text-status-danger"
                                : "text-muted-foreground/50"
                            }`}
                          >
                            {summary?.overdue_count ?? 0}
                          </span>
                          {summary && summary.overdue_total > 0 && (
                            <span className="text-muted-foreground font-mono hidden lg:inline">
                              {formatCurrencyBRLWithSymbol(summary.overdue_total)}
                            </span>
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[contract.status]}>
                          {statusLabels[contract.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Histórico de parcelas"
                                  onClick={() => setInvoicesSheet({ open: true, contract })}
                                >
                                  <DollarSign className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Histórico de parcelas</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Ver histórico"
                                  onClick={() => setHistorySheet({ open: true, contract })}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Ver histórico</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <PermissionGate module="financial" action="manage">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label="Gerar fatura manual"
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
                                <TooltipContent><p>Gerar fatura manual</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </PermissionGate>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <PermissionGate module="contracts" action="edit">
                                <DropdownMenuItem
                                  onClick={() => setAdjustmentDialog({ open: true, contract })}
                                  disabled={contract.status !== "active"}
                                >
                                  <TrendingUp className="h-4 w-4 mr-2" />
                                  Reajuste anual
                                </DropdownMenuItem>
                              </PermissionGate>
                              <PermissionGate module="financial" action="manage">
                                <DropdownMenuItem
                                  onClick={() => setAdditionalChargeDialog({ open: true, contract })}
                                  disabled={contract.status !== "active"}
                                >
                                  <PackagePlus className="h-4 w-4 mr-2" />
                                  Adicionais pontuais
                                </DropdownMenuItem>
                              </PermissionGate>
                              <DropdownMenuSeparator />
                              <PermissionGate module="contracts" action="edit">
                                <DropdownMenuItem onClick={() => handleEdit(contract)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar contrato
                                </DropdownMenuItem>
                              </PermissionGate>
                              <PermissionGate module="contracts" action="delete">
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDeleteClick(contract)}
                                  disabled={checkingDelete}
                                >
                                  {checkingDelete ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                  )}
                                  Excluir
                                </DropdownMenuItem>
                              </PermissionGate>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
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

      {/* Delete Blocked Dialog */}
      <ConfirmDialog
        open={deleteBlocked.open}
        onOpenChange={(open) => setDeleteBlocked({ ...deleteBlocked, open })}
        title="Exclusão Bloqueada"
        description={deleteBlocked.message}
        confirmLabel="Entendi"
        onConfirm={() => setDeleteBlocked({ open: false, message: "" })}
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

      {/* Contract Invoices Sheet */}
      {invoicesSheet.contract && (
        <ContractInvoicesSheet
          open={invoicesSheet.open}
          onOpenChange={(open) => setInvoicesSheet({ ...invoicesSheet, open })}
          contract={{
            id: invoicesSheet.contract.id,
            name: invoicesSheet.contract.name,
            client_name: invoicesSheet.contract.clients?.name,
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

      {/* Additional Charges Dialog */}
      {additionalChargeDialog.contract && (
        <ContractAdditionalChargeDialog
          open={additionalChargeDialog.open}
          onOpenChange={(open) => setAdditionalChargeDialog({ ...additionalChargeDialog, open })}
          contractId={additionalChargeDialog.contract.id}
          contractName={additionalChargeDialog.contract.name}
          contractMonthlyValue={additionalChargeDialog.contract.monthly_value}
        />
      )}
    </AppLayout>
  );
}
