import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";

const invoiceSchema = z.object({
  client_id: z.string().min(1, "Selecione um cliente"),
  contract_id: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Valor deve ser maior que zero"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  billing_provider: z.enum(["", "banco_inter", "asaas"]).optional(),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function InvoiceForm({ onSuccess, onCancel }: InvoiceFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      client_id: "",
      contract_id: "",
      amount: 0,
      due_date: "",
      billing_provider: "",
      notes: "",
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: "invoice_new",
    storage: "session",
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedClientId = form.watch("client_id");

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-by-client", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("id, name, monthly_value, billing_provider")
        .eq("client_id", selectedClientId)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
  });

  const mutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      // Determine billing_provider: use form value if set, otherwise inherit from contract or null
      let billingProvider = data.billing_provider || null;
      if (!billingProvider && data.contract_id) {
        const contract = contracts.find((c) => c.id === data.contract_id);
        billingProvider = (contract as any)?.billing_provider || null;
      }
      
      const { error } = await supabase.from("invoices").insert({
        client_id: data.client_id,
        contract_id: data.contract_id || null,
        amount: data.amount,
        due_date: data.due_date,
        billing_provider: billingProvider,
        notes: data.notes || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Fatura criada com sucesso" });
      onSuccess();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  const handleContractChange = (contractId: string) => {
    form.setValue("contract_id", contractId);
    const contract = contracts.find((c) => c.id === contractId);
    if (contract) {
      form.setValue("amount", contract.monthly_value);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}
        <FormField
          control={form.control}
          name="client_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {contracts.length > 0 && (
          <FormField
            control={form.control}
            name="contract_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contrato (opcional)</FormLabel>
                <Select onValueChange={handleContractChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Vincular a um contrato" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name} - R$ {contract.monthly_value.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor (R$) *</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0,00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vencimento *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="billing_provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provedor de Cobrança (opcional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Usar padrão do contrato" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">Padrão do contrato</SelectItem>
                  <SelectItem value="banco_inter">Banco Inter</SelectItem>
                  <SelectItem value="asaas">Asaas</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea placeholder="Notas sobre a fatura..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Criando..." : "Criar Fatura"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
