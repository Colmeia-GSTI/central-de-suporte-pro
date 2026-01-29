import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { PlusCircle, Trash2, Receipt, Check } from "lucide-react";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContractAdditionalChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
}

interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
  reference_month: string;
  applied: boolean;
  applied_invoice_id: string | null;
  created_at: string;
}

export function ContractAdditionalChargeDialog({
  open,
  onOpenChange,
  contractId,
  contractName,
}: ContractAdditionalChargeDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [referenceMonth, setReferenceMonth] = useState(
    format(addMonths(new Date(), 1), "yyyy-MM")
  );

  const { data: charges = [], isLoading } = useQuery({
    queryKey: ["contract-additional-charges", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_additional_charges")
        .select("*")
        .eq("contract_id", contractId)
        .order("reference_month", { ascending: false });
      if (error) throw error;
      return data as AdditionalCharge[];
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!description.trim()) throw new Error("Informe uma descrição");
      if (amount <= 0) throw new Error("Informe um valor válido");

      const { error } = await supabase.from("contract_additional_charges").insert({
        contract_id: contractId,
        description: description.trim(),
        amount,
        reference_month: referenceMonth,
        created_by: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-additional-charges", contractId] });
      toast({ title: "Valor adicional adicionado" });
      setDescription("");
      setAmount(0);
      setReferenceMonth(format(addMonths(new Date(), 1), "yyyy-MM"));
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      const { error } = await supabase
        .from("contract_additional_charges")
        .delete()
        .eq("id", chargeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-additional-charges", contractId] });
      toast({ title: "Valor adicional removido" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAdd = () => {
    addMutation.mutate();
  };

  const handleDelete = (chargeId: string) => {
    deleteMutation.mutate(chargeId);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    return format(new Date(parseInt(year), parseInt(month) - 1), "MMM/yyyy", { locale: ptBR });
  };

  const pendingTotal = charges
    .filter((c) => !c.applied)
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Valores Adicionais Pontuais
          </DialogTitle>
          <DialogDescription>
            Contrato: <strong>{contractName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Add New Charge Form */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Adicionar Cobrança Pontual
            </h4>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Mês de Competência</Label>
                <Input
                  type="month"
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <CurrencyInput
                  value={amount}
                  onChange={setAmount}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  placeholder="Ex: Instalação extra"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleAdd}
              disabled={addMutation.isPending || !description || amount <= 0}
              className="w-full"
            >
              {addMutation.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>

          {/* Existing Charges List */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Cobranças Registradas</h4>
              {pendingTotal > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning-foreground">
                  Pendente: {formatCurrencyBRLWithSymbol(pendingTotal)}
                </Badge>
              )}
            </div>

            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Carregando...</div>
            ) : charges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                <Receipt className="mx-auto h-12 w-12 opacity-50 mb-2" />
                <p>Nenhum valor adicional registrado</p>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map((charge) => (
                      <TableRow key={charge.id}>
                        <TableCell className="font-mono">
                          {formatMonth(charge.reference_month)}
                        </TableCell>
                        <TableCell>{charge.description}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrencyBRLWithSymbol(charge.amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {charge.applied ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              <Check className="h-3 w-3 mr-1" />
                              Aplicado
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!charge.applied && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(charge.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
