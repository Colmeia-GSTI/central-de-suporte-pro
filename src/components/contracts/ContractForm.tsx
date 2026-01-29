import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
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
import { CurrencyInput } from "@/components/ui/currency-input";
import { ServiceCodeSelect } from "@/components/nfse/ServiceCodeSelect";
import { ContractServicesSection, ContractService } from "./ContractServicesSection";
import { ContractNotificationMessageForm } from "./ContractNotificationMessageForm";
import { FileText, Lock, Calendar, CreditCard, TrendingUp, MessageSquare } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";

const contractSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  client_id: z.string().min(1, "Selecione um cliente"),
  monthly_value: z.coerce.number().min(0, "Valor deve ser positivo"),
  start_date: z.string().min(1, "Data de início é obrigatória"),
  end_date: z.string().optional(),
  indefinite_term: z.boolean().default(true),
  support_model: z.enum(["ticket", "hours_bank", "unlimited"]),
  hours_included: z.coerce.number().optional(),
  status: z.enum(["active", "expired", "cancelled", "pending"]),
  auto_renew: z.boolean().default(false),
  internal_notes: z.string().optional(),
  // Billing fields
  billing_day: z.coerce.number().min(1).max(28).default(10),
  days_before_due: z.coerce.number().min(1).max(30).default(5),
  payment_preference: z.enum(["boleto", "pix", "both"]).default("boleto"),
  // Adjustment fields
  adjustment_date: z.string().optional(),
  adjustment_index: z.enum(["IGPM", "IPCA", "INPC", "FIXO"]).default("IGPM"),
  adjustment_percentage: z.coerce.number().optional(),
  // Notification
  notification_message: z.string().optional(),
  // NFSE fields
  nfse_enabled: z.boolean().default(true),
  nfse_service_code: z.string().optional(),
  nfse_descricao_customizada: z.string().optional(),
  nfse_cnae: z.string().optional(),
});

type ContractFormData = z.infer<typeof contractSchema>;

type ContractWithClient = Tables<"contracts"> & {
  clients: Tables<"clients"> | null;
};

interface ContractFormProps {
  contract?: ContractWithClient | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ContractForm({ contract, onSuccess, onCancel }: ContractFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // State for contract services
  const [contractServices, setContractServices] = useState<ContractService[]>([]);
  const [calculatedTotal, setCalculatedTotal] = useState(0);

  const form = useForm<ContractFormData>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      name: contract?.name || "",
      client_id: contract?.client_id || "",
      monthly_value: contract?.monthly_value || 0,
      start_date: contract?.start_date || new Date().toISOString().split("T")[0],
      end_date: contract?.end_date || "",
      indefinite_term: !contract?.end_date,
      support_model: contract?.support_model || "ticket",
      hours_included: contract?.hours_included || undefined,
      status: contract?.status || "active",
      auto_renew: contract?.auto_renew || false,
      internal_notes: (contract as any)?.internal_notes || "",
      // Billing defaults
      billing_day: (contract as any)?.billing_day || 10,
      days_before_due: (contract as any)?.days_before_due || 5,
      payment_preference: (contract as any)?.payment_preference || "boleto",
      // Adjustment defaults
      adjustment_date: (contract as any)?.adjustment_date || "",
      adjustment_index: (contract as any)?.adjustment_index || "IGPM",
      adjustment_percentage: (contract as any)?.adjustment_percentage || undefined,
      // Notification
      notification_message: (contract as any)?.notification_message || "",
      // NFSE defaults
      nfse_enabled: (contract as any)?.nfse_enabled ?? true,
      nfse_service_code: (contract as any)?.nfse_service_code || "010701",
      nfse_descricao_customizada: (contract as any)?.nfse_descricao_customizada || "",
      nfse_cnae: (contract as any)?.nfse_cnae || "",
    },
  });

  // Load existing contract services
  const { data: existingServices = [] } = useQuery({
    queryKey: ["contract-services", contract?.id],
    queryFn: async () => {
      if (!contract?.id) return [];
      const { data, error } = await supabase
        .from("contract_services")
        .select(`
          id,
          service_id,
          quantity,
          unit_value,
          services(name)
        `)
        .eq("contract_id", contract.id);
      if (error) throw error;
      return data.map((s: any) => ({
        service_id: s.service_id,
        service_name: s.services?.name || "Serviço",
        quantity: s.quantity || 1,
        unit_value: s.unit_value || 0,
        subtotal: (s.quantity || 1) * (s.unit_value || 0),
      })) as ContractService[];
    },
    enabled: !!contract?.id,
  });

  // Initialize services state when data loads
  useState(() => {
    if (existingServices.length > 0 && contractServices.length === 0) {
      setContractServices(existingServices);
    }
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

  const mutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const payload = {
        name: data.name,
        client_id: data.client_id,
        monthly_value: calculatedTotal > 0 ? calculatedTotal : data.monthly_value,
        start_date: data.start_date,
        end_date: data.indefinite_term ? null : (data.end_date || null),
        support_model: data.support_model as Enums<"support_model">,
        hours_included: data.hours_included || null,
        status: data.status as Enums<"contract_status">,
        auto_renew: data.auto_renew,
        internal_notes: data.internal_notes || null,
        // Billing fields
        billing_day: data.billing_day,
        days_before_due: data.days_before_due,
        payment_preference: data.payment_preference,
        // Adjustment fields
        adjustment_date: data.adjustment_date || null,
        adjustment_index: data.adjustment_index,
        adjustment_percentage: data.adjustment_percentage || null,
        // Notification
        notification_message: data.notification_message || null,
        // NFSE fields
        nfse_enabled: data.nfse_enabled,
        nfse_service_code: data.nfse_service_code || null,
        nfse_descricao_customizada: data.nfse_descricao_customizada || null,
        nfse_cnae: data.nfse_cnae || null,
      };

      let contractId = contract?.id;
      const isUpdate = !!contract;

      // Detectar mudanças para histórico
      const changes: Record<string, { old: any; new: any }> = {};
      if (isUpdate) {
        if (data.name !== contract.name) changes.name = { old: contract.name, new: data.name };
        if (data.status !== contract.status) changes.status = { old: contract.status, new: data.status };
        if ((calculatedTotal > 0 ? calculatedTotal : data.monthly_value) !== contract.monthly_value) {
          changes.monthly_value = { old: contract.monthly_value, new: calculatedTotal > 0 ? calculatedTotal : data.monthly_value };
        }
        if (data.support_model !== contract.support_model) changes.support_model = { old: contract.support_model, new: data.support_model };
      }

      if (isUpdate) {
        const { error } = await supabase
          .from("contracts")
          .update(payload)
          .eq("id", contract.id);
        if (error) throw error;

        // Registrar no histórico se houve mudanças
        if (Object.keys(changes).length > 0) {
          const changesSummary = Object.entries(changes)
            .map(([field, { old: oldVal, new: newVal }]) => `${field}: ${oldVal} → ${newVal}`)
            .join(", ");

          await supabase.from("contract_history").insert({
            contract_id: contract.id,
            user_id: user?.id,
            action: "updated",
            changes,
            comment: `Alterações: ${changesSummary}`,
          });
        }
      } else {
        const { data: newContract, error } = await supabase
          .from("contracts")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        contractId = newContract.id;

        // Registrar criação no histórico
        await supabase.from("contract_history").insert({
          contract_id: contractId,
          user_id: user?.id,
          action: "created",
          comment: "Contrato criado",
        });
      }

      // Save contract services
      if (contractId && contractServices.length > 0) {
        // Delete existing services
        await supabase
          .from("contract_services")
          .delete()
          .eq("contract_id", contractId);

        // Insert new services
        const servicesToInsert = contractServices.map((s) => ({
          contract_id: contractId,
          service_id: s.service_id,
          name: s.service_name,
          quantity: s.quantity,
          unit_value: s.unit_value,
          value: s.subtotal,
        }));

        const { error: servicesError } = await supabase
          .from("contract_services")
          .insert(servicesToInsert);
        if (servicesError) throw servicesError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract-services"] });
      toast({
        title: contract ? "Contrato atualizado" : "Contrato criado",
        description: "Operação realizada com sucesso",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContractFormData) => {
    mutation.mutate(data);
  };

  const handleServicesChange = useCallback((services: ContractService[], total: number) => {
    setContractServices(services);
    setCalculatedTotal(total);
    // Update the form value
    if (total > 0) {
      form.setValue("monthly_value", total);
    }
  }, [form]);

  const supportModel = form.watch("support_model");
  const nfseEnabled = form.watch("nfse_enabled");
  const indefiniteTerm = form.watch("indefinite_term");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Nome do Contrato *</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Suporte Mensal" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem className="col-span-2">
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

          <FormField
            control={form.control}
            name="support_model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modelo de Suporte</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ticket">Por Ticket</SelectItem>
                    <SelectItem value="hours_bank">Banco de Horas</SelectItem>
                    <SelectItem value="unlimited">Ilimitado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {supportModel === "hours_bank" && (
            <FormField
              control={form.control}
              name="hours_included"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horas Incluídas</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Início *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="indefinite_term"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="!mt-0 cursor-pointer">
                  Contrato por tempo indeterminado
                </FormLabel>
              </FormItem>
            )}
          />

          {!indefiniteTerm && (
            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Término</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="auto_renew"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 col-span-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="!mt-0">Renovação automática</FormLabel>
              </FormItem>
            )}
          />
        </div>

        {/* Billing Section */}
        <Separator className="my-6" />
        
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="h-5 w-5 text-primary" />
            Faturamento
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="billing_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dia do Vencimento</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="28" {...field} />
                  </FormControl>
                  <FormDescription>Dia 1 a 28</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="days_before_due"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias de Antecedência</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="30" {...field} />
                  </FormControl>
                  <FormDescription>Para geração automática</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_preference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferência de Pagamento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="both">Boleto + PIX</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Adjustment Section */}
        <Separator className="my-6" />
        
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-primary" />
            Reajuste Anual
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="adjustment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do Próximo Reajuste</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>Geralmente 1 ano após início</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adjustment_index"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Índice de Reajuste</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="IGPM">IGP-M</SelectItem>
                      <SelectItem value="IPCA">IPCA</SelectItem>
                      <SelectItem value="INPC">INPC</SelectItem>
                      <SelectItem value="FIXO">Percentual Fixo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("adjustment_index") === "FIXO" && (
              <FormField
                control={form.control}
                name="adjustment_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Percentual Fixo (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="5.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </div>

        {/* Services Section */}
        <Separator className="my-6" />
        
        <ContractServicesSection
          initialServices={existingServices}
          onChange={handleServicesChange}
        />

        {/* Manual Value Override */}
        {contractServices.length === 0 && (
          <FormField
            control={form.control}
            name="monthly_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor Mensal *</FormLabel>
                <FormControl>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="0,00"
                  />
                </FormControl>
                <FormDescription>
                  Adicione serviços acima para calcular automaticamente
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Notification Message Section */}
        <Separator className="my-6" />
        
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare className="h-5 w-5 text-primary" />
            Mensagem de Cobrança
          </div>

          <FormField
            control={form.control}
            name="notification_message"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <ContractNotificationMessageForm
                    value={field.value || ""}
                    onChange={field.onChange}
                    clientName={clients.find((c) => c.id === form.watch("client_id"))?.name}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Internal Notes Section */}
        <Separator className="my-6" />

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-5 w-5 text-muted-foreground" />
            Observações Internas
          </div>

          <FormField
            control={form.control}
            name="internal_notes"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Anotações visíveis apenas para a equipe..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Estas observações não aparecem para o cliente
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
                  />
                </FormControl>
                <FormDescription>
                  Estas observações não aparecem para o cliente
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* NFSE Section */}
        <Separator className="my-6" />
        
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" />
            Nota Fiscal de Serviço (NFS-e)
          </div>

          <FormField
            control={form.control}
            name="nfse_enabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0 rounded-lg border p-4">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-0.5">
                  <FormLabel className="cursor-pointer">
                    Emitir NFS-e automaticamente
                  </FormLabel>
                  <FormDescription>
                    Habilita a geração de nota fiscal para este contrato
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {nfseEnabled && (
            <div className="space-y-4 pt-2">
              <FormField
                control={form.control}
                name="nfse_service_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código de Serviço</FormLabel>
                    <ServiceCodeSelect
                      value={field.value}
                      onSelect={(code) => {
                        field.onChange(code?.codigo_tributacao || "");
                        if (code?.cnae_principal) {
                          form.setValue("nfse_cnae", code.cnae_principal);
                        }
                      }}
                    />
                    <FormDescription>
                      Código de tributação nacional conforme LC 116/2003
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfse_cnae"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNAE</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: 6209100" />
                    </FormControl>
                    <FormDescription>
                      Preenchido automaticamente ao selecionar o código de serviço
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfse_descricao_customizada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição do Serviço para NFS-e</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Descrição detalhada do serviço que aparecerá na nota fiscal..."
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Se não preenchido, será gerada automaticamente com base nos serviços
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : contract ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
