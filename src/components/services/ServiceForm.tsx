import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ServiceCodeSelect } from "@/components/nfse/ServiceCodeSelect";
import { Calculator, Receipt, AlertTriangle, CheckCircle } from "lucide-react";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { useState, useEffect } from "react";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";

const serviceSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  base_value: z.coerce.number().min(0, "Valor deve ser positivo"),
  multiplier: z.coerce.number().min(0.1, "Multiplicador deve ser maior que 0.1").default(1),
  // Campos NFS-e Nacional (essenciais para Simples Nacional)
  nfse_service_code: z.string().optional(),
  nfse_cnae: z.string().optional(),
  tax_iss: z.coerce.number().min(0).max(100).default(0), // Alíquota do Simples Nacional
  is_active: z.boolean().default(true),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

interface Service {
  id: string;
  name: string;
  description: string | null;
  base_value: number;
  multiplier: number;
  nfse_service_code: string | null;
  nfse_cnae: string | null;
  tax_iss: number | null;
  tax_pis: number | null;
  tax_cofins: number | null;
  tax_csll: number | null;
  tax_irrf: number | null;
  tax_inss: number | null;
  trib_municipio_recolhimento: string | null;
  ind_inc_fisc: boolean | null;
  c_nat_rend: string | null;
  is_active: boolean;
}

interface ServiceFormProps {
  service?: Service | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// Validation status type
interface NfseValidation {
  isValid: boolean;
  hasServiceCode: boolean;
  hasCnae: boolean;
  hasAliquota: boolean;
  messages: string[];
}

export function ServiceForm({ service, onSuccess, onCancel }: ServiceFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nfseValidation, setNfseValidation] = useState<NfseValidation>({
    isValid: false,
    hasServiceCode: false,
    hasCnae: false,
    hasAliquota: false,
    messages: [],
  });

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name || "",
      description: service?.description || "",
      base_value: service?.base_value || 0,
      multiplier: service?.multiplier || 1,
      nfse_service_code: service?.nfse_service_code || "",
      nfse_cnae: service?.nfse_cnae || "",
      tax_iss: service?.tax_iss || 0,
      is_active: service?.is_active ?? true,
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: service ? `service_edit_${service.id}` : "service_new",
    storage: "session",
    enabled: !service,
  });

  const mutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      const payload = {
        name: data.name,
        description: data.description || null,
        base_value: data.base_value,
        multiplier: data.multiplier,
        nfse_service_code: data.nfse_service_code || null,
        nfse_cnae: data.nfse_cnae || null,
        tax_iss: data.tax_iss,
        // Campos fixos para Simples Nacional (sem retenções federais)
        trib_municipio_recolhimento: "proprio",
        tax_pis: 0,
        tax_cofins: 0,
        tax_csll: 0,
        tax_irrf: 0,
        tax_inss: 0,
        ind_inc_fisc: false,
        c_nat_rend: null,
        is_active: data.is_active,
      };

      if (service) {
        const { error } = await supabase
          .from("services")
          .update(payload)
          .eq("id", service.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({
        title: service ? "Serviço atualizado" : "Serviço criado",
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

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  const onSubmit = (data: ServiceFormData) => {
    mutation.mutate(data);
  };

  const baseValue = form.watch("base_value");
  const multiplier = form.watch("multiplier");
  const finalValue = baseValue * multiplier;

  // Watch NFS-e fields for real-time validation
  const watchedServiceCode = form.watch("nfse_service_code");
  const watchedCnae = form.watch("nfse_cnae");
  const watchedIss = form.watch("tax_iss");

  // Real-time NFS-e validation
  useEffect(() => {
    const hasServiceCode = !!watchedServiceCode && watchedServiceCode.length > 0;
    const hasCnae = !!watchedCnae && watchedCnae.length >= 7;
    const hasAliquota = watchedIss !== undefined && watchedIss > 0;

    const messages: string[] = [];
    if (!hasServiceCode) messages.push("Código de Tributação Nacional é obrigatório para NFS-e");
    if (!hasCnae) messages.push("CNAE deve ter pelo menos 7 dígitos");
    if (!hasAliquota) messages.push("Alíquota do Simples Nacional deve ser maior que 0%");

    const isValid = hasServiceCode && hasCnae && hasAliquota;

    setNfseValidation({
      isValid,
      hasServiceCode,
      hasCnae,
      hasAliquota,
      messages,
    });
  }, [watchedServiceCode, watchedCnae, watchedIss]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Nome do Serviço *</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Suporte Mensal" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Descrição detalhada do serviço..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="base_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor Base *</FormLabel>
                <FormControl>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="0,00"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="multiplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Multiplicador</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Calculator className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      className="pl-10"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormDescription>Ex: 1.5 para 50% a mais</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Calculated Value Display */}
          <div className="col-span-2 p-4 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calculator className="h-4 w-4" />
                <span>Valor Final Calculado:</span>
              </div>
              <span className="text-xl font-bold text-primary">
                {formatCurrencyBRLWithSymbol(finalValue)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrencyBRLWithSymbol(baseValue)} × {multiplier} = {formatCurrencyBRLWithSymbol(finalValue)}
            </p>
          </div>

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 col-span-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="!mt-0">Serviço ativo</FormLabel>
              </FormItem>
            )}
          />
        </div>

        {/* NFSE Section */}
        <Separator className="my-6" />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Receipt className="h-5 w-5 text-primary" />
              Configuração NFS-e (Simples Nacional)
            </div>
            {nfseValidation.isValid ? (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Pronto para NFS-e
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Pendente
              </div>
            )}
          </div>

          {/* Info about Simples Nacional */}
          <Alert className="bg-muted/50">
            <AlertDescription className="text-sm text-muted-foreground">
              Para empresas do <strong>Simples Nacional</strong>, os tributos federais (PIS, COFINS, IR, CSLL, INSS) 
              são calculados automaticamente pela guia DAS. Informe apenas a <strong>alíquota do Simples</strong> para 
              o valor aproximado de tributos na NFS-e.
            </AlertDescription>
          </Alert>

          {/* Real-time validation alert */}
          {!nfseValidation.isValid && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700">
                <ul className="list-disc list-inside space-y-1">
                  {nfseValidation.messages.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nfse_service_code"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="flex items-center gap-2">
                    Código de Tributação Nacional *
                    {nfseValidation.hasServiceCode ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                    )}
                  </FormLabel>
                  <ServiceCodeSelect
                    value={field.value}
                    onSelect={(code) => {
                      field.onChange(code?.codigo_tributacao || "");
                      if (code?.cnae_principal) {
                        form.setValue("nfse_cnae", code.cnae_principal);
                      }
                      if (code?.aliquota_sugerida) {
                        form.setValue("tax_iss", code.aliquota_sugerida);
                      }
                    }}
                  />
                  <FormDescription>
                    Ex: 01.07.01 - Suporte técnico em informática
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
                  <FormLabel className="flex items-center gap-2">
                    CNAE *
                    {nfseValidation.hasCnae ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Ex: 6209100"
                      className={!nfseValidation.hasCnae && watchedCnae ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                    />
                  </FormControl>
                  <FormDescription>Código CNAE do serviço</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tax_iss"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Alíquota Simples Nacional (%) *
                    {nfseValidation.hasAliquota ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="33" 
                      placeholder="Ex: 6.00"
                      {...field}
                      className={!nfseValidation.hasAliquota ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                    />
                  </FormControl>
                  <FormDescription>Alíquota total do Simples (ver PGDAS)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : service ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
