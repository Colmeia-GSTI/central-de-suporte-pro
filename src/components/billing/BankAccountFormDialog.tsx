import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

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
}

interface BankAccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: BankAccount | null;
}

export function BankAccountFormDialog({
  open,
  onOpenChange,
  account,
}: BankAccountFormDialogProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [agency, setAgency] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("corrente");
  const [initialBalance, setInitialBalance] = useState("0");

  const isEditing = !!account;

  useEffect(() => {
    if (open && account) {
      setName(account.name);
      setBankName(account.bank_name || "");
      setAgency(account.agency || "");
      setAccountNumber(account.account_number || "");
      setAccountType(account.account_type || "corrente");
      setInitialBalance(String(account.initial_balance));
    } else if (open) {
      setName("");
      setBankName("");
      setAgency("");
      setAccountNumber("");
      setAccountType("corrente");
      setInitialBalance("0");
    }
  }, [open, account]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome da conta é obrigatório");
      return;
    }

    const balance = parseFloat(initialBalance.replace(",", "."));
    if (isNaN(balance)) {
      toast.error("Saldo inicial deve ser um número válido");
      return;
    }

    setSaving(true);
    try {
      if (isEditing && account) {
        const { error } = await supabase
          .from("bank_accounts")
          .update({
            name: name.trim(),
            bank_name: bankName.trim() || null,
            agency: agency.trim() || null,
            account_number: accountNumber.trim() || null,
            account_type: accountType,
            initial_balance: balance,
          })
          .eq("id", account.id);

        if (error) throw error;
        toast.success("Conta atualizada com sucesso");
      } else {
        const { error } = await supabase.from("bank_accounts").insert({
          name: name.trim(),
          bank_name: bankName.trim() || null,
          agency: agency.trim() || null,
          account_number: accountNumber.trim() || null,
          account_type: accountType,
          initial_balance: balance,
          current_balance: balance,
        });

        if (error) throw error;
        toast.success("Conta criada com sucesso");
      }

      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar conta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Conta Bancária" : "Nova Conta Bancária"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados da conta bancária."
              : "Preencha os dados para criar uma nova conta."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">Nome *</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Banco Inter Empresa"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bank-name">Banco</Label>
              <Input
                id="bank-name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Ex: Banco Inter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-type">Tipo</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger id="account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrente">Corrente</SelectItem>
                  <SelectItem value="poupanca">Poupança</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agency">Agência</Label>
              <Input
                id="agency"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                placeholder="0001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-number">Número da Conta</Label>
              <Input
                id="account-number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="12345-6"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial-balance">Saldo Inicial (R$)</Label>
            <Input
              id="initial-balance"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="0,00"
              disabled={isEditing}
            />
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                O saldo inicial não pode ser alterado após a criação.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Salvar" : "Criar Conta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
