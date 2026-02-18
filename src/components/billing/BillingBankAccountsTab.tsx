import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, ToggleLeft, ToggleRight, Landmark } from "lucide-react";
import { toast } from "sonner";
import { BankAccountFormDialog } from "./BankAccountFormDialog";
import { Skeleton } from "@/components/ui/skeleton";

interface BankAccount {
  id: string;
  name: string;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  account_type: string | null;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function BillingBankAccountsTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      toast.success(
        variables.is_active ? "Conta reativada" : "Conta desativada"
      );
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao alterar status da conta");
    },
  });

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };

  const totalBalance = accounts
    ?.filter((a) => a.is_active)
    .reduce((sum, a) => sum + Number(a.current_balance), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Contas Bancárias</h2>
            <p className="text-sm text-muted-foreground">
              Saldo total ativo: <span className="font-medium text-foreground">{formatCurrency(totalBalance)}</span>
            </p>
          </div>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !accounts?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              Nenhuma conta bancária cadastrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">Banco</TableHead>
                  <TableHead className="hidden lg:table-cell">Agência</TableHead>
                  <TableHead className="hidden lg:table-cell">Conta</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="text-right">Saldo Atual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow
                    key={account.id}
                    className={!account.is_active ? "opacity-50" : ""}
                  >
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {account.bank_name || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {account.agency || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {account.account_number || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize">
                      {account.account_type === "poupanca"
                        ? "Poupança"
                        : "Corrente"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(account.initial_balance))}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(account.current_balance))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.is_active ? "default" : "secondary"}>
                        {account.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(account)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            toggleMutation.mutate({
                              id: account.id,
                              is_active: !account.is_active,
                            })
                          }
                          title={account.is_active ? "Desativar" : "Reativar"}
                        >
                          {account.is_active ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
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

      <BankAccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
      />
    </div>
  );
}
