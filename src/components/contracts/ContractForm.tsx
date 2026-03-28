import { useState, useCallback, useEffect } from "react";
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
import { FileText, Lock, CreditCard, TrendingUp, MessageSquare, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { cn } from "@/lib/utils";
import type { Tables, Enums } from "@/integrations/supabase/types";

// Helper to derive term_type from existing contract data
function derivedTermType(data: { end_date?: string | null; auto_renew?: boolean }): "indefinite" | "auto_renew" | "fixed" {
  if (!data.end_date) return "indefinite";
  if (data.auto_renew) return "auto_renew";
  return "fixed";
}

const contractSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  client_id: z.string().min(1, "Selecione um cliente"),
  monthly_value: z.coerce.number().min(0, "Valor deve ser positivo"),
  start_date: z.string().min(1, "Data de início é obrigatória"),
  end_date: z.string().optional(),
  term_type: z.enum(["indefinite", "auto_renew", "fixed"]).default("indefinite"),
  support_model: z.enum(["ticket", "hours_bank", "unlimited"]),
  hours_included: z.coerce.number().optional(),
  status: z.enum(["active", "expired", "cancelled", "pending", "suspended"]),
  internal_notes: z.string().optional(),
  billing_day: z.coerce.number().min(1).max(28).default(10),
  days_before_due: z.coerce.number().min(1).max(30).default(5),
  billing_provider: z.enum(["banco_inter", "asaas"]).default("banco_inter"),
  payment_preference: z.enum(["boleto", "pix", "both"]).default("boleto"),
  generate_initial_invoice: z.boolean().default(false),
  first_payment_date: z.string().optional(),
  generate_payment: z.boolean().default(true),
  send_notification: z.boolean().default(true),
  adjustment_date: z.string().optional(),
  adjustment_index: z.enum(["IGPM", "IPCA", "INPC", "FIXO"]).default("IGPM"),
  adjustment_percentage: z.coerce.number().optional(),
  notification_message: z.string().optional(),
  nfse_enabled: z.boolean().default(true),
  nfse_service_code: z.string().optional(),
  nfse_descricao_customizada: z.string().optional(),
  nfse_cnae: z.string().optional(),
  nfse_aliquota: z.coerce.number().min(0).max(25).default(0),
  nfse_iss_retido: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.nfse_enabled) {
    if (!data.nfse_aliquota || data.nfse_aliquota <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Alíquota ISS obrigatória quando NFS-e está habilitada",
        path: ["nfse_aliquota"],
      });
    }
    if (!data.nfse_service_code || data.nfse_service_code.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Código de serviço obrigatório quando NFS-e está habilitada",
        path: ["nfse_service_code"],
      });
    }
  }
});

type ContractFormData = z.infer<typeof contractSchema>;

// Extended type to include all contract fields used in the form
type ContractWithClient = Tables<"contracts"> & {
  clients: Tables<"clients"> | null;
};

interface ContractFormProps {
  contract?: ContractWithClient | null;
  initialData?: ContractWithClient | null;
  onSuccess: () => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function ContractForm({ contract, initialData, onSuccess, onCancel }: ContractFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const contractData = contract || initialData;
  const isNewContract = !contractData;

  const [contractServices, setContractServices] = useState<ContractService[]>([]);
  const [calculatedTotal, setCalculatedTotal] = useState(0);

  // Buscar configurações fiscais padrão da empresa
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-nfse-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("nfse_aliquota_padrao, nfse_cnae_padrao, nfse_codigo_tributacao_padrao")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<ContractFormData>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      name: contractData?.name || "",
      client_id: contractData?.client_id || "",
      monthly_value: contractData?.monthly_value || 0,
      start_date: contractData?.start_date || new Date().toISOString().split("T")[0],
      end_date: contractData?.end_date || "",
      term_type: contractData ? derivedTermType(contractData) : "indefinite",
      support_model: contractData?.support_model || "ticket",
      hours_included: contractData?.hours_included || undefined,
      status: contractData?.status || "active",
      internal_notes: contractData?.internal_notes || "",
      billing_day: contractData?.billing_day || 10,
      days_before_due: contractData?.days_before_due || 5,
      billing_provider: (contractData?.billing_provider as "banco_inter" | "asaas") || "banco_inter",
      payment_preference: (contractData?.payment_preference as "boleto" | "pix" | "both") || "boleto",
      generate_initial_invoice: false,
      first_payment_date: "",
      generate_payment: true,
      send_notification: true,
      adjustment_date: contractData?.adjustment_date || "",
      adjustment_index: (contractData?.adjustment_index as "IGPM" | "IPCA" | "INPC" | "FIXO") || "IGPM",
      adjustment_percentage: contractData?.adjustment_percentage || undefined,
      notification_message: contractData?.notification_message || "",
      nfse_enabled: contractData?.nfse_enabled ?? true,
      nfse_service_code: contractData?.nfse_service_code || "010701",
      nfse_descricao_customizada: contractData?.nfse_descricao_customizada || "",
      nfse_cnae: contractData?.nfse_cnae || "",
      nfse_aliquota: (contractData as Record<string, unknown>)?.nfse_aliquota as number || 0,
      nfse_iss_retido: (contractData as Record<string, unknown>)?.nfse_iss_retido as boolean || false,
    },
  });

  // Aplicar defaults da empresa para contratos novos quando os dados carregarem
  useEffect(() => {
    if (isNewContract && companySettings) {
      const currentAliquota = form.getValues("nfse_aliquota");
      if (!currentAliquota || currentAliquota <= 0) {
        form.setValue("nfse_aliquota", companySettings.nfse_aliquota_padrao ?? 6);
      }
      const currentCnae = form.getValues("nfse_cnae");
      if (!currentCnae && companySettings.nfse_cnae_padrao) {
        form.setValue("nfse_cnae", companySettings.nfse_cnae_padrao);
      }
      const currentServiceCode = form.getValues("nfse_service_code");
      if ((!currentServiceCode || currentServiceCode === "010701") && companySettings.nfse_codigo_tributacao_padrao) {
        form.setValue("nfse_service_code", companySettings.nfse_codigo_tributacao_padrao);
      }
    }
  }, [isNewContract, companySettings, form]);

  // Load existing contract services
  const contractId = contractData?.id;
  const { data: existingServices = [] } = useQuery({
    queryKey: ["contract-services", contractId],
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from("contract_services")
        .select(`
          id,
          service_id,
          quantity,
          unit_value,
          services(name)
        `)
        .eq("contract_id", contractId);
      if (error) throw error;
      return data.map((s: Record<string, unknown>) => ({
        service_id: s.service_id as string,
        service_name: ((s.services as Record<string, unknown>)?.name as string) || "Serviço",
        quantity: (s.quantity as number) || 1,
        unit_value: (s.unit_value as number) || 0,
        subtotal: ((s.quantity as number) || 1) * ((s.unit_value as number) || 0),
      })) as ContractService[];
    },
    enabled: !!contractId,
  });

  useEffect(() => {
    if (existingServices.length > 0 && contractServices.length === 0) {
      setContractServices(existingServices);
    }
  }, [existingServices]);

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
      // Derive auto_renew and end_date from term_type
      const autoRenew = data.term_type !== "fixed";
      const endDate = data.term_type === "indefinite" ? null : (data.end_date || null);

      const payload = {
        name: data.name,
        client_id: data.client_id,
        monthly_value: calculatedTotal > 0 ? calculatedTotal : data.monthly_value,
        start_date: data.start_date,
        end_date: endDate,
        support_model: data.support_model as Enums<"support_model">,
        hours_included: data.hours_included || null,
        status: data.status as Enums<"contract_status">,
        auto_renew: autoRenew,
        internal_notes: data.internal_notes || null,
        billing_day: data.billing_day,
        days_before_due: data.days_before_due,
        billing_provider: data.billing_provider,
        payment_preference: data.payment_preference,
        adjustment_date: data.adjustment_date || null,
        adjustment_index: data.adjustment_index,
        adjustment_percentage: data.adjustment_percentage || null,
        notification_message: data.notification_message || null,
        nfse_enabled: data.nfse_enabled,
        nfse_service_code: data.nfse_service_code || null,
        nfse_descricao_customizada: data.nfse_descricao_customizada || null,
        nfse_cnae: data.nfse_cnae || null,
        nfse_aliquota: data.nfse_aliquota || 0,
        nfse_iss_retido: data.nfse_iss_retido || false,
      };

      let contractIdValue = contractData?.id;
      const isUpdate = !!contractData;

      // Detectar mudanças para histórico
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      if (isUpdate) {
        if (data.name !== contractData.name) changes.name = { old: contractData.name, new: data.name };
        if (data.status !== contractData.status) changes.status = { old: contractData.status, new: data.status };
        if ((calculatedTotal > 0 ? calculatedTotal : data.monthly_value) !== contractData.monthly_value) {
          changes.monthly_value = { old: contractData.monthly_value, new: calculatedTotal > 0 ? calculatedTotal : data.monthly_value };
        }
        if (data.support_model !== contractData.support_model) changes.support_model = { old: contractData.support_model, new: data.support_model };
      }

      if (isUpdate) {
        const { error } = await supabase
          .from("contracts")
          .update(payload)
          .eq("id", contractData.id);
        if (error) throw error;

        if (Object.keys(changes).length > 0) {
          const changesSummary = Object.entries(changes)
            .map(([field, { old: oldVal, new: newVal }]) => `${field}: ${oldVal} → ${newVal}`)
            .join(", ");

          await supabase.from("contract_history").insert({
            contract_id: contractData.id,
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
        contractIdValue = newContract.id;

        await supabase.from("contract_history").insert({
          contract_id: contractIdValue,
          user_id: user?.id,
          action: "created",
          comment: "Contrato criado",
        });
      }

      // Save contract services
      if (contractIdValue && contractServices.length > 0) {
        if (isUpdate) {
          await supabase
            .from("contract_services")
            .delete()
            .eq("contract_id", contractIdValue);
        }

        const servicesToInsert = contractServices.map((s) => ({
          contract_id: contractIdValue,
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

      // Generate initial invoice if requested (only for new contracts)
      if (!isUpdate && data.generate_initial_invoice && contractIdValue) {
        let dueDate: string;
        let referenceMonth: string;
        
        if (data.first_payment_date) {
          dueDate = data.first_payment_date;
          referenceMonth = data.first_payment_date.substring(0, 7);
        } else {
          const now = new Date();
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();
          referenceMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
          const billingDay = data.billing_day || 10;
          const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
          const actualBillingDay = Math.min(billingDay, lastDayOfMonth);
          dueDate = `${referenceMonth}-${String(actualBillingDay).padStart(2, "0")}`;
        }
        
        const invoiceAmount = calculatedTotal > 0 ? calculatedTotal : data.monthly_value;
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            client_id: data.client_id,
            contract_id: contractIdValue,
            amount: invoiceAmount,
            due_date: dueDate,
            reference_month: referenceMonth,
            status: "pending" as const,
            billing_provider: data.billing_provider,
            notes: `Primeira fatura - ${data.name}`,
          })
          .select("id, invoice_number")
          .single();
        
        if (!invoiceError && invoice) {
          if (data.generate_payment) {
            try {
              if (data.billing_provider === "asaas") {
                await supabase.functions.invoke("asaas-nfse", {
                  body: {
                    action: "create_payment",
                    invoice_id: invoice.id,
                    billing_type: data.payment_preference === "pix" ? "PIX" : "BOLETO",
                  },
                });
              } else {
                await supabase.functions.invoke("banco-inter", {
                  body: {
                    invoice_id: invoice.id,
                    payment_type: data.payment_preference === "pix" ? "pix" : "boleto",
                  },
                });
              }
            } catch (paymentError) {
              console.error("[ContractForm] Erro ao gerar pagamento:", paymentError);
            }
          }
          
          if (data.nfse_enabled) {
            try {
              await supabase.functions.invoke("asaas-nfse", {
                body: {
                  action: "emit_nfse",
                  invoice_id: invoice.id,
                  contract_id: contractIdValue,
                },
              });
            } catch (nfseError) {
              console.error("[ContractForm] Erro ao gerar NFS-e:", nfseError);
            }
          }
          
          if (data.send_notification) {
            try {
              await supabase.functions.invoke("resend-payment-notification", {
                body: { 
                  invoice_id: invoice.id,
                  channels: ["email"],
                },
              });
            } catch (notifError) {
              console.error("[ContractForm] Erro ao enviar notificação:", notifError);
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract-services"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      if (contractData?.id) {
        queryClient.invalidateQueries({ queryKey: ["contract", contractData.id] });
      }
      toast({
        title: contractData ? "Contrato salvo" : "Contrato criado",
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
    if (total > 0) {
      form.setValue("monthly_value", total);
    }
  }, [form]);

  const supportModel = form.watch("support_model");
  const nfseEnabled = form.watch("nfse_enabled");
  const termType = form.watch("term_type");

  // Date picker helper component
  const DatePickerField = ({ field, label, description }: { field: { value: string; onChange: (v: string) => void }; label: string; description?: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            className={cn(
              "w-full pl-3 text-left font-normal",
              !field.value && "text-muted-foreground"
            )}
          >
            {field.value ? (
              format(parse(field.value, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")
            ) : (
              <span>Selecione a data</span>
            )}
            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown-buttons"
          fromYear={2020}
          toYear={2036}
          fixedWeeks
          selected={field.value ? parse(field.value, "yyyy-MM-dd", new Date()) : undefined}
          onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
          locale={ptBR}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );

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
                    <SelectItem value="suspended">Suspenso</SelectItem>
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
              <FormItem className="flex flex-col">
                <FormLabel>Data de Início do Contrato *</FormLabel>
                <DatePickerField field={field} label="Data de Início do Contrato" />
                <FormDescription>
                  Data em que o contrato entra em vigor. Não é a data do primeiro pagamento.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Unified Term Type selector */}
          <FormField
            control={form.control}
            name="term_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vigência do Contrato</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="indefinite">Indeterminado</SelectItem>
                    <SelectItem value="auto_renew">Renovação automática</SelectItem>
                    <SelectItem value="fixed">Prazo fixo</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {termType === "indefinite" && "Sem data de término, vigente até cancelamento"}
                  {termType === "auto_renew" && "Renova automaticamente ao atingir a data de término"}
                  {termType === "fixed" && "Encerra na data de término definida"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {termType !== "indefinite" && (
            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data de Término</FormLabel>
                  <DatePickerField field={field} label="Data de Término" />
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Billing Section */}
        <Separator className="my-6" />
        
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="h-5 w-5 text-primary" />
            Faturamento
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="billing_provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provedor de Cobrança</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="banco_inter">Banco Inter</SelectItem>
                      <SelectItem value="asaas">Asaas</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Provedor para boleto/PIX</FormDescription>
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

          {/* Initial Invoice Generation - Only for new contracts */}
          {/* First Payment Date - always visible */}
          <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-4">
            <FormField
              control={form.control}
              name="first_payment_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>📅 Data do Primeiro Pagamento</FormLabel>
                  <DatePickerField field={field} label="Data do Primeiro Pagamento" />
                  <FormDescription>
                    Data de vencimento da primeira fatura deste contrato. Se não informada, será calculada pelo dia de vencimento ({form.watch("billing_day") || 10}) do mês atual.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("first_payment_date") && (
              <div className="text-sm text-muted-foreground bg-background/50 rounded p-2">
                <p><strong>Competência:</strong> {form.watch("first_payment_date")!.substring(0, 7)}</p>
                <p><strong>Vencimento:</strong> {form.watch("first_payment_date")}</p>
                <p><strong>Valor:</strong> {calculatedTotal > 0 ? `R$ ${calculatedTotal.toFixed(2)}` : "Será calculado pelos serviços"}</p>
              </div>
            )}

            {/* Initial Invoice Generation - Only for new contracts */}
            {!contractData && (
              <>
                <FormField
                  control={form.control}
                  name="generate_initial_invoice"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="cursor-pointer font-medium">
                          Gerar primeira cobrança ao criar contrato
                        </FormLabel>
                        <FormDescription>
                          A fatura será gerada com base na data do primeiro pagamento acima
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {form.watch("generate_initial_invoice") && (
                  <div className="ml-6 space-y-3 border-l-2 border-primary/30 pl-4">
                    <FormField
                      control={form.control}
                      name="generate_payment"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-sm">
                            Gerar boleto/PIX automaticamente ({form.watch("billing_provider") === "asaas" ? "Asaas" : "Banco Inter"})
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="send_notification"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-sm">
                            Enviar notificação por email
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </>
            )}
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
                <FormItem className="flex flex-col">
                  <FormLabel>Data do Próximo Reajuste</FormLabel>
                  <DatePickerField field={field} label="Data do Próximo Reajuste" />
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
          contractId={contractData?.id}
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
                        if (code?.aliquota_sugerida) {
                          form.setValue("nfse_aliquota", code.aliquota_sugerida);
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nfse_aliquota"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alíquota ISS (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={25}
                          step={0.01}
                          placeholder="Ex: 2.00"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Preenchido ao selecionar código de serviço
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nfse_iss_retido"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-end">
                      <div className="flex items-center gap-3 rounded-lg border p-3 h-10">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer text-sm font-normal">
                          ISS Retido pelo Tomador
                        </FormLabel>
                      </div>
                      <FormDescription>
                        Quando o cliente retém o ISS na fonte
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
            {mutation.isPending ? "Salvando..." : contractData ? "Salvar" : "Criar Contrato"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
