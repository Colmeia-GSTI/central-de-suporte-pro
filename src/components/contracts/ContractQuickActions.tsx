import { useState } from "react";
import { Receipt, History, PackagePlus, MoreHorizontal, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContractInvoicesSheet } from "./ContractInvoicesSheet";
import { ContractHistorySheet } from "./ContractHistorySheet";
import { ContractAdditionalChargeDialog } from "./ContractAdditionalChargeDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

interface ContractQuickActionsProps {
  contract: Tables<"contracts"> & { clients?: { id: string; name: string } | null };
  onAfterCancel?: () => void;
}

/**
 * Barra de ações rápidas disponível em qualquer aba da edição do contrato.
 * Faturas / Histórico / Cobrança Extra / Cancelar contrato.
 */
export function ContractQuickActions({ contract, onAfterCancel }: ContractQuickActionsProps) {
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contracts")
        .update({ status: "cancelled" as const })
        .eq("id", contract.id);
      if (error) throw error;

      await supabase.from("contract_history").insert({
        contract_id: contract.id,
        action: "cancelled",
        comment: "Contrato cancelado pelo usuário",
        user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", contract.id] });
      toast.success("Contrato cancelado");
      setCancelConfirm(false);
      onAfterCancel?.();
    },
    onError: (err: Error) => toast.error("Erro ao cancelar", { description: err.message }),
  });

  const contractForSheets = {
    ...contract,
    clients: contract.clients ?? null,
  };

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setInvoicesOpen(true)} className="h-8 gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          Faturas
        </Button>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="h-8 gap-1.5">
          <History className="h-3.5 w-3.5" />
          Histórico
        </Button>
        <Button variant="outline" size="sm" onClick={() => setChargeOpen(true)} className="h-8 gap-1.5">
          <PackagePlus className="h-3.5 w-3.5" />
          Cobrança extra
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mais ações">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setCancelConfirm(true)}
              disabled={contract.status === "cancelled"}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar contrato
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ContractInvoicesSheet
        open={invoicesOpen}
        onOpenChange={setInvoicesOpen}
        contract={contractForSheets as Parameters<typeof ContractInvoicesSheet>[0]["contract"]}
      />
      <ContractHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        contract={contractForSheets as Parameters<typeof ContractHistorySheet>[0]["contract"]}
      />
      <ContractAdditionalChargeDialog
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        contract={contractForSheets as Parameters<typeof ContractAdditionalChargeDialog>[0]["contract"]}
      />
      <ConfirmDialog
        open={cancelConfirm}
        onOpenChange={setCancelConfirm}
        title="Cancelar contrato?"
        description={`O contrato "${contract.name}" será marcado como cancelado e novas faturas deixarão de ser geradas. Esta ação fica registrada no histórico.`}
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        variant="destructive"
        onConfirm={() => cancelMutation.mutate()}
        isLoading={cancelMutation.isPending}
      />
    </>
  );
}
