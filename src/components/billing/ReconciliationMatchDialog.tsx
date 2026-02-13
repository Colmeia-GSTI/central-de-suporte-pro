import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Link2, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";

interface ReconciliationMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string;
  bankAmount: number;
  bankDescription: string;
}

export function ReconciliationMatchDialog({
  open,
  onOpenChange,
  entryId,
  bankAmount,
  bankDescription,
}: ReconciliationMatchDialogProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const searchInvoices = async (term: string) => {
    setIsSearching(true);
    try {
      let query = supabase
        .from("invoices")
        .select("id, invoice_number, amount, due_date, status, contract_id, contracts(client_id, clients(name))")
        .in("status", ["pending", "overdue", "paid"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (term) {
        // Search by invoice number or approximate amount
        const numericTerm = parseFloat(term.replace(/[^\d.,]/g, "").replace(",", "."));
        if (!isNaN(numericTerm)) {
          query = query.or(`invoice_number.eq.${term},amount.gte.${numericTerm - 1},amount.lte.${numericTerm + 1}`);
        } else {
          query = query.eq("invoice_number", term);
        }
      } else {
        // Default: show invoices close to bank_amount
        query = query.gte("amount", bankAmount - 0.01).lte("amount", bankAmount + 0.01);
      }

      const { data, error } = await query;
      if (error) throw error;
      setInvoices(data || []);
    } catch {
      setInvoices([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Trigger search when dialog opens or search term changes
  useState(() => {
    if (open) searchInvoices("");
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    searchInvoices(value);
  };

  const matchMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("bank_reconciliation")
        .update({
          status: "matched",
          invoice_id: invoiceId,
          matched_at: new Date().toISOString(),
          matched_by: user?.id || null,
          match_score: 100, // manual match
        })
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      toast.success("Lançamento conciliado manualmente");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao conciliar lançamento");
    },
  });

  const getClientName = (inv: any) => {
    const contracts = inv.contracts;
    if (!contracts) return "—";
    const c = Array.isArray(contracts) ? contracts[0] : contracts;
    const clients = c?.clients;
    if (!clients) return "—";
    const client = Array.isArray(clients) ? clients[0] : clients;
    return client?.name || "—";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Conciliação Manual
          </DialogTitle>
          <DialogDescription>
            Vincular lançamento: {bankDescription} — {formatCurrency(bankAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número da fatura ou valor..."
              className="pl-9"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma fatura encontrada
            </div>
          ) : (
            <div className="rounded-lg border max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fatura</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">#{inv.invoice_number}</TableCell>
                      <TableCell className="text-sm">{getClientName(inv)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        <span className={Math.abs(inv.amount - bankAmount) <= 0.01 ? "text-status-success font-bold" : ""}>
                          {formatCurrency(inv.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(inv.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => matchMutation.mutate(inv.id)}
                          disabled={matchMutation.isPending}
                        >
                          Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
