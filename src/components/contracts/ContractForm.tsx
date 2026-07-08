import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ContractServicesSection, ContractService } from "./ContractServicesSection";
import { ContractNotificationMessageForm } from "./ContractNotificationMessageForm";
import { ContractBillingSection } from "./sections/ContractBillingSection";
import { ContractAdjustmentSection } from "./sections/ContractAdjustmentSection";
import { ContractAdjustmentCard } from "./ContractAdjustmentCard";
import { ContractInternalNotesSection } from "./sections/ContractInternalNotesSection";
import { ContractNfseSection } from "./sections/ContractNfseSection";
import { DatePickerField } from "./sections/DatePickerField";
import { MessageSquare, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  billing_provider: z.enum(["asaas"]).default("asaas"),
  payment_preference: z.enum(["boleto", "pix", "both"]).default("boleto"),
  billing_frequency: z.enum(["monthly", "bimonthly", "quarterly", "semiannual", "yearly"]).default("monthly"),
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

export type ContractFormData = z.infer<typeof contractSchema>;

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
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);

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
      billing_provider: "asaas" as const,
      payment_preference: (contractData?.payment_preference as "boleto" | "pix" | "both") || "boleto",
      billing_frequency: (contractData?.billing_frequency as "monthly" | "bimonthly" | "quarterly" | "semiannual" | "yearly") || "monthly",
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

  // A seção de serviços governa o valor mensal quando o contrato tem serviços
  // carregados (edição) ou o usuário adicionou serviços (novo). Nesse caso usamos
  // sempre calculatedTotal — inclusive 0 — para permitir zerar ao remover TODOS.
  const servicesInUse = existingServices.length > 0 || contractServices.length > 0;

  const mutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      // Derive auto_renew and end_date from term_type
      const autoRenew = data.term_type !== "fixed";
      const endDate = data.term_type === "indefinite" ? null : (data.end_date || null);
      const effectiveMonthlyValue = servicesInUse ? calculatedTotal : data.monthly_value;

      const payload = {
        name: data.name,
        client_id: data.client_id,
        monthly_value: effectiveMonthlyValue,
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
        billing_frequency: data.billing_frequency,
        adjustment_date: data.adjustment_date || (() => {
          // Default: start_date + 1 year so the annual adjustment reminder cron picks it up
          const base = data.start_date ? new Date(data.start_date) : new Date();
          base.setFullYear(base.getFullYear() + 1);
          return base.toISOString().split("T")[0];
        })(),
        adjustment_index: data.adjustment_index,
        adjustment_percentage: data.adjustment_percentage || null,
        notification_message: data.notification_message || null,
        nfse_enabled: data.nfse_enabled,
        nfse_service_code: data.nfse_service_code || null,
        nfse_descricao_customizada: data.nfse_descricao_customizada || null,
        nfse_cnae: data.nfse_cnae || null,
        nfse_aliquota: data.nfse_aliquota || 0,
        nfse_iss_retido: data.nfse_iss_retido || false,
        first_billing_month: data.first_payment_date ? data.first_payment_date.substring(0, 7) : null,
      };

      let contractIdValue = contractData?.id;
      const isUpdate = !!contractData;

      // Detectar mudanças para histórico
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      if (isUpdate) {
        if (data.name !== contractData.name) changes.name = { old: contractData.name, new: data.name };
        if (data.status !== contractData.status) changes.status = { old: contractData.status, new: data.status };
        if (effectiveMonthlyValue !== contractData.monthly_value) {
          changes.monthly_value = { old: contractData.monthly_value, new: effectiveMonthlyValue };
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

      // Save contract services. Delete e insert separados: em update, apagar
      // sempre (remover TODOS os serviços precisa persistir) e inserir só se houver.
      if (contractIdValue) {
        if (isUpdate) {
          await supabase
            .from("contract_services")
            .delete()
            .eq("contract_id", contractIdValue);
        }

        if (contractServices.length > 0) {
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
        
        // FIX cobrança por frequência: monthly_value é MENSAL. Para frequências
        // > mensal, a primeira fatura cobre `intervalMonths` meses (mesmo critério
        // do cron generate-monthly-invoices). Antes cobrava só 1 mês.
        const FREQUENCY_INTERVAL_MONTHS: Record<string, number> = {
          monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12,
        };
        const initialIntervalMonths = FREQUENCY_INTERVAL_MONTHS[data.billing_frequency ?? "monthly"] ?? 1;
        const baseValue = effectiveMonthlyValue;
        const invoiceAmount = baseValue * initialIntervalMonths;
        const initialNotes = initialIntervalMonths > 1
          ? `Primeira fatura (${initialIntervalMonths} meses - ${data.billing_frequency}) - ${data.name}`
          : `Primeira fatura - ${data.name}`;
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
            notes: initialNotes,
          })
          .select("id, invoice_number")
          .single();

        if (invoiceError || !invoice) {
          // Antes o erro era engolido em silêncio (contrato criado, fatura some
          // sem aviso). Agora avisa; o contrato em si já foi criado com sucesso.
          toast({
            title: "Contrato criado, mas a primeira fatura não foi gerada",
            description: invoiceError?.message || "Gere a fatura manualmente na aba Faturas.",
            variant: "destructive",
          });
        } else {
          if (data.generate_payment) {
            try {
              await supabase.functions.invoke("asaas-nfse", {
                body: {
                  action: "create_payment",
                  invoice_id: invoice.id,
                  billing_type: data.payment_preference === "pix" ? "PIX" : "BOLETO",
                },
              });
            } catch (paymentError) {
              console.error("[ContractForm] Erro ao gerar pagamento:", paymentError);
            }
          }
          
          if (data.nfse_enabled) {
            try {
              const { data: nfseResult, error: nfseError } = await supabase.functions.invoke("asaas-nfse", {
                body: {
                  action: "emit",
                  client_id: data.client_id,
                  invoice_id: invoice.id,
                  contract_id: contractIdValue,
                  value: invoiceAmount,
                  service_description:
                    data.nfse_descricao_customizada || `Prestação de serviços - ${data.name}`,
                  municipal_service_code: data.nfse_service_code || undefined,
                },
              });
              if (nfseError) throw nfseError;
              if (nfseResult && nfseResult.success === false) {
                toast({
                  title: "Contrato criado, mas a NFS-e não foi emitida",
                  description: nfseResult.error || "Emita a nota manualmente na aba Faturas.",
                  variant: "destructive",
                });
              }
            } catch (nfseError) {
              console.error("[ContractForm] Erro ao gerar NFS-e:", nfseError);
              toast({
                title: "Contrato criado, mas a NFS-e não foi emitida",
                description: "Emita a nota manualmente na aba Faturas.",
                variant: "destructive",
              });
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
    // Incondicional (inclusive 0): remover TODOS os serviços deve zerar o valor mensal.
    form.setValue("monthly_value", total);
  }, [form]);

  const supportModel = form.watch("support_model");
  const termType = form.watch("term_type");


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap gap-1 bg-muted/50 p-1">
            <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
            <TabsTrigger value="faturamento" className="text-xs">Faturamento</TabsTrigger>
            <TabsTrigger value="reajuste" className="text-xs">Reajuste</TabsTrigger>
            <TabsTrigger value="servicos" className="text-xs">Serviços</TabsTrigger>
            <TabsTrigger value="nfse" className="text-xs">NFS-e</TabsTrigger>
            <TabsTrigger value="avancado" className="text-xs">Avançado</TabsTrigger>
          </TabsList>

          {/* ===== Aba GERAL ===== */}
          <TabsContent value="geral" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Identificação do contrato, cliente vinculado, modelo de suporte e vigência.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <FormItem className="col-span-2 flex flex-col">
                    <FormLabel>Cliente *</FormLabel>
                    <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={clientPopoverOpen}
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? clients.find((c) => c.id === field.value)?.name ?? "Cliente não encontrado"
                              : "Selecione um cliente"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar cliente..." />
                          <CommandList className="max-h-[200px]">
                            <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
                            <CommandGroup>
                              {clients.map((client) => (
                                <CommandItem
                                  key={client.id}
                                  value={client.name}
                                  onSelect={() => {
                                    field.onChange(client.id);
                                    setClientPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === client.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {client.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                      <SelectContent modal={false}>
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
                      <SelectContent modal={false}>
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
                    <FormDescription>Data em que o contrato entra em vigor. Não é a data do primeiro pagamento.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                      <SelectContent modal={false}>
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
          </TabsContent>

          {/* ===== Aba FATURAMENTO ===== */}
          <TabsContent value="faturamento" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Dia do vencimento, periodicidade e provedor de cobrança. O valor mensal só pode ser alterado na aba Reajuste.</p>

            {contractData && (servicesInUse ? calculatedTotal : form.watch("monthly_value")) !== contractData.monthly_value && (
              <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-700 dark:text-yellow-400">Você está alterando o valor mensal direto</AlertTitle>
                <AlertDescription className="text-xs text-yellow-700/90 dark:text-yellow-300/90">
                  Para reajustes anuais (IGPM/IPCA/INPC) prefira a aba <strong>Reajuste</strong> — ela registra o histórico, atualiza serviços proporcionalmente e agenda o próximo ciclo.
                </AlertDescription>
              </Alert>
            )}

            <ContractBillingSection form={form} calculatedTotal={calculatedTotal} isNewContract={!contractData} />

            <Separator className="my-6" />

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" />
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
          </TabsContent>

          {/* ===== Aba REAJUSTE ===== */}
          <TabsContent value="reajuste" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Aplique reajustes anuais por índice, registre renegociações de escopo e veja como ficará a próxima cobrança no Asaas.</p>
            {contractData ? (
              <ContractAdjustmentCard
                contract={{
                  id: contractData.id,
                  name: contractData.name,
                  monthly_value: contractData.monthly_value,
                  adjustment_date: contractData.adjustment_date,
                  adjustment_index: contractData.adjustment_index,
                  adjustment_percentage: contractData.adjustment_percentage,
                  billing_frequency: contractData.billing_frequency,
                  billing_day: contractData.billing_day,
                  days_before_due: contractData.days_before_due,
                  payment_preference: contractData.payment_preference,
                }}
              />
            ) : (
              <ContractAdjustmentSection form={form} />
            )}
          </TabsContent>

          {/* ===== Aba SERVIÇOS ===== */}
          <TabsContent value="servicos" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Serviços incluídos no contrato. O valor mensal é calculado automaticamente pela soma dos serviços.</p>
            <ContractServicesSection
              contractId={contractData?.id}
              initialServices={existingServices}
              onChange={handleServicesChange}
            />

            {contractServices.length === 0 && !contractData && (
              <FormField
                control={form.control}
                name="monthly_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Mensal *</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0,00" />
                    </FormControl>
                    <FormDescription>Adicione serviços acima para calcular automaticamente</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </TabsContent>

          {/* ===== Aba NFS-e ===== */}
          <TabsContent value="nfse" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Configurações fiscais para emissão de NFS-e via Asaas (alíquota ISS, código de serviço, CNAE).</p>
            <ContractNfseSection form={form} />
          </TabsContent>

          {/* ===== Aba AVANÇADO ===== */}
          <TabsContent value="avancado" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">Notas internas visíveis apenas para a equipe.</p>
            <ContractInternalNotesSection form={form} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
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

