import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface BankAccountSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function BankAccountSelector({ value, onChange }: BankAccountSelectorProps) {
  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name, bank_name, current_balance")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selected = accounts.find((a: any) => a.id === value);

  return (
    <div className="flex items-center gap-3">
      <Select
        value={value || "all"}
        onValueChange={(v) => onChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[220px]">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Todas as contas" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as contas</SelectItem>
          {accounts.map((account: any) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
              {account.bank_name ? ` (${account.bank_name})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <Badge variant="outline" className="gap-1 text-sm font-medium">
          Saldo: {formatCurrency(selected.current_balance)}
        </Badge>
      )}
    </div>
  );
}
