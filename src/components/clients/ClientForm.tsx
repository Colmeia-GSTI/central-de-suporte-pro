import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsTechnicianOnly } from "@/hooks/useIsTechnicianOnly";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Phone, MessageCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn, formatPhone, formatCEP, getErrorMessage } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import type { Tables } from "@/integrations/supabase/types";

const clientSchema = z.object({
  document: z.string().optional(),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  trade_name: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  financial_email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  whatsapp_validated: z.boolean().default(false),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean().default(true),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientFormProps {
  client?: Tables<"clients"> | null;
  onSuccess: (clientId?: string) => void;
  onCancel: () => void;
}

// Format CNPJ to display format
function formatCNPJ(value: string): string {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 14) {
    return numbers
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return value;
}

export function ClientForm({ client, onSuccess, onCancel }: ClientFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSearching, setIsSearching] = useState(false);
  const [isValidatingWhatsApp, setIsValidatingWhatsApp] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<'idle' | 'valid' | 'invalid' | 'error'>('idle');
  const [whatsAppMessage, setWhatsAppMessage] = useState<string>("");
  
  // Check if user is technician only (no admin/manager/financial roles)
  const isTechnicianOnly = useIsTechnicianOnly();

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      document: client?.document || "",
      name: client?.name || "",
      trade_name: (client as any)?.trade_name || "",
      email: client?.email || "",
      financial_email: (client as any)?.financial_email || "",
      phone: formatPhone(client?.phone),
      whatsapp: formatPhone((client as any)?.whatsapp),
      whatsapp_validated: (client as any)?.whatsapp_validated || false,
      address: client?.address || "",
      city: client?.city || "",
      state: client?.state || "",
      zip_code: formatCEP(client?.zip_code) || "",
      notes: client?.notes || "",
      is_active: client?.is_active ?? true,
    },
  });

  // Form persistence for draft recovery
  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: client ? `client-edit-${client.id}` : "client-new",
    excludeFields: ["whatsapp_validated"],
    enabled: true,
  });

  // Debounce WhatsApp number for auto-validation
  const whatsappValue = form.watch("whatsapp");
  const debouncedWhatsApp = useDebounce(whatsappValue, 2000);

  // Set initial WhatsApp status based on existing data
  useEffect(() => {
    if ((client as any)?.whatsapp_validated) {
      setWhatsAppStatus('valid');
      if ((client as any)?.whatsapp_validated_at) {
        const date = new Date((client as any).whatsapp_validated_at);
        setWhatsAppMessage(`Verificado em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      } else {
        setWhatsAppMessage("WhatsApp verificado");
      }
    }
  }, [client]);

  // Auto-validate WhatsApp when debounced value changes
  useEffect(() => {
    const cleanNumber = debouncedWhatsApp?.replace(/\D/g, "") || "";
    
    // Only auto-validate if:
    // 1. Number has valid length (10-11 digits)
    // 2. Status is idle (not already validated)
    // 3. Not currently validating
    if (cleanNumber.length >= 10 && cleanNumber.length <= 11 && whatsAppStatus === 'idle' && !isValidatingWhatsApp) {
      validateWhatsApp();
    }
  }, [debouncedWhatsApp]);

  const searchCNPJ = async () => {
    const document = form.getValues("document")?.replace(/\D/g, "");
    
    if (!document || document.length !== 14) {
      toast({
        title: "CNPJ inválido",
        description: "Digite um CNPJ válido com 14 dígitos",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj: document }
      });

      if (error) throw error;

      if (data.status === "ERROR") {
        toast({
          title: "CNPJ não encontrado",
          description: data.message || "Não foi possível encontrar o CNPJ informado",
          variant: "destructive",
        });
        return;
      }

      // Fill form with returned data
      form.setValue("name", data.nome || "");
      form.setValue("trade_name", data.fantasia || "");
      form.setValue("email", data.email || "");
      form.setValue("phone", formatPhone(data.telefone?.split("/")[0]?.trim() || ""));
      form.setValue("address", `${data.logradouro || ""}, ${data.numero || ""}${data.complemento ? ` - ${data.complemento}` : ""}`);
      form.setValue("city", data.municipio || "");
      form.setValue("state", data.uf || "");
      form.setValue("zip_code", formatCEP(data.cep) || "");

      toast({
        title: "Dados preenchidos",
        description: "Os dados do CNPJ foram carregados com sucesso",
      });
    } catch (error: unknown) {
      logger.error("CNPJ lookup error", "Clients", { error: getErrorMessage(error) });
      toast({
        title: "Erro na consulta",
        description: "Não foi possível consultar o CNPJ. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const validateWhatsApp = async () => {
    const whatsapp = form.getValues("whatsapp")?.replace(/\D/g, "");
    
    if (!whatsapp || whatsapp.length < 10) {
      toast({
        title: "Número inválido",
        description: "Digite um número de WhatsApp válido",
        variant: "destructive",
      });
      return;
    }

    setIsValidatingWhatsApp(true);
    setWhatsAppStatus('idle');
    setWhatsAppMessage("");

    try {
      const { data, error } = await supabase.functions.invoke('validate-whatsapp', {
        body: { phone: whatsapp }
      });

      if (error) {
        throw new Error(error.message || "Erro ao validar WhatsApp");
      }

      if (data.error && !data.valid) {
        setWhatsAppStatus('error');
        setWhatsAppMessage(data.error);
        form.setValue("whatsapp_validated", false);
        toast({
          title: "Erro na validação",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (data.exists) {
        setWhatsAppStatus('valid');
        setWhatsAppMessage("WhatsApp vinculado ao número");
        form.setValue("whatsapp_validated", true);
        toast({
          title: "WhatsApp verificado!",
          description: "O número possui WhatsApp vinculado",
        });
      } else {
        setWhatsAppStatus('invalid');
        setWhatsAppMessage("Número não possui WhatsApp");
        form.setValue("whatsapp_validated", false);
        toast({
          title: "WhatsApp não encontrado",
          description: "Este número não possui WhatsApp vinculado",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      logger.error("WhatsApp validation error", "Clients", { error: errorMsg });
      setWhatsAppStatus('error');
      setWhatsAppMessage("Erro ao validar");
      form.setValue("whatsapp_validated", false);
      toast({
        title: "Erro ao validar WhatsApp",
        description: errorMsg || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsValidatingWhatsApp(false);
    }
  };

  // Reset validation status when WhatsApp number changes
  const handleWhatsAppChange = (value: string, onChange: (...event: any[]) => void) => {
    const formatted = formatPhone(value);
    onChange(formatted);
    
    // Reset validation if number changed
    if (whatsAppStatus !== 'idle') {
      setWhatsAppStatus('idle');
      setWhatsAppMessage("");
      form.setValue("whatsapp_validated", false);
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const payload = {
        name: data.name,
        trade_name: data.trade_name || null,
        document: data.document || null,
        email: data.email || null,
        financial_email: data.financial_email || null,
        phone: data.phone?.replace(/\D/g, "") || null,
        whatsapp: data.whatsapp?.replace(/\D/g, "") || null,
        whatsapp_validated: data.whatsapp_validated,
        whatsapp_validated_at: data.whatsapp_validated ? new Date().toISOString() : null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code?.replace(/\D/g, "") || null,
        notes: data.notes || null,
        is_active: data.is_active,
      };

      let clientId: string;
      const isUpdate = !!client;

      // Detectar mudanças para histórico
      const changes: Record<string, { old: any; new: any }> = {};
      if (isUpdate) {
        if (data.name !== client.name) changes.name = { old: client.name, new: data.name };
        if (data.email !== (client.email || "")) changes.email = { old: client.email, new: data.email };
        if (data.phone !== (client.phone || "")) changes.phone = { old: client.phone, new: data.phone };
        if (data.is_active !== client.is_active) changes.is_active = { old: client.is_active, new: data.is_active };
      }

      if (isUpdate) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", client.id);
        if (error) throw error;
        clientId = client.id;

        // Registrar no histórico se houve mudanças
        if (Object.keys(changes).length > 0) {
          const changesSummary = Object.entries(changes)
            .map(([field, { old: oldVal, new: newVal }]) => `${field}: ${oldVal} → ${newVal}`)
            .join(", ");

          await supabase.from("client_history").insert({
            client_id: client.id,
            user_id: user?.id,
            action: "updated",
            changes,
            comment: `Alterações: ${changesSummary}`,
          });
        }
      } else {
        const { data: newClient, error } = await supabase
          .from("clients")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        clientId = newClient.id;

        // Registrar criação no histórico
        await supabase.from("client_history").insert({
          client_id: clientId,
          user_id: user?.id,
          action: "created",
          comment: "Cliente criado",
        });
      }

      return clientId;
    },
    onSuccess: (clientId) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({
        title: client ? "Cliente atualizado" : "Cliente criado",
        description: "Operação realizada com sucesso",
      });
      onSuccess(clientId);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ClientFormData) => {
    mutation.mutate(data);
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>, onChange: (...event: any[]) => void) => {
    const formatted = formatCNPJ(e.target.value);
    onChange(formatted);
  };

  return (
    <Form {...form}>
      {wasRestored && (
        <DraftRecoveryBanner
          onClear={() => {
            clearDraft();
            form.reset();
          }}
        />
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* CNPJ field - hidden for technicians */}
          {!isTechnicianOnly && (
            <FormField
              control={form.control}
              name="document"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>CNPJ/CPF</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input 
                        placeholder="00.000.000/0000-00" 
                        {...field}
                        onChange={(e) => handleDocumentChange(e, field.onChange)}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={searchCNPJ}
                      disabled={isSearching}
                    >
                      {isSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      <span className="ml-2 hidden sm:inline">Consultar</span>
                    </Button>
                  </div>
                  <FormDescription>
                    Digite o CNPJ e clique em Consultar para preencher automaticamente
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="col-span-2 sm:col-span-1">
                <FormLabel>Nome / Razão Social *</FormLabel>
                <FormControl>
                  <Input placeholder="Nome do cliente" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="trade_name"
            render={({ field }) => (
              <FormItem className="col-span-2 sm:col-span-1">
                <FormLabel>Nome Fantasia</FormLabel>
                <FormControl>
                  <Input placeholder="Nome fantasia da empresa" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Telefone
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="(00) 00000-0000" 
                    {...field}
                    onChange={(e) => {
                      const formatted = formatPhone(e.target.value);
                      field.onChange(formatted);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="whatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  WhatsApp
                  {whatsAppStatus === 'valid' && (
                    <Badge variant="outline" className="ml-1 bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verificado
                    </Badge>
                  )}
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input 
                      placeholder="(00) 00000-0000" 
                      {...field}
                      onChange={(e) => handleWhatsAppChange(e.target.value, field.onChange)}
                      className={cn(
                        "transition-colors",
                        whatsAppStatus === 'valid' && "border-green-500 focus-visible:ring-green-500",
                        whatsAppStatus === 'invalid' && "border-orange-500 focus-visible:ring-orange-500",
                        whatsAppStatus === 'error' && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={validateWhatsApp}
                    disabled={isValidatingWhatsApp || !form.watch("whatsapp")}
                    className={cn(
                      "shrink-0 transition-colors",
                      whatsAppStatus === 'valid' && "border-green-500 text-green-600 hover:bg-green-500/10"
                    )}
                  >
                    {isValidatingWhatsApp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : whatsAppStatus === 'valid' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : whatsAppStatus === 'invalid' ? (
                      <XCircle className="h-4 w-4 text-orange-500" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Validar</span>
                  </Button>
                </div>
                {whatsAppMessage && (
                  <p className={cn(
                    "text-xs mt-1",
                    whatsAppStatus === 'valid' && "text-green-600",
                    whatsAppStatus === 'invalid' && "text-orange-600",
                    whatsAppStatus === 'error' && "text-destructive"
                  )}>
                    {whatsAppStatus === 'valid' && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
                    {whatsAppStatus === 'invalid' && <XCircle className="h-3 w-3 inline mr-1" />}
                    {whatsAppMessage}
                  </p>
                )}
                <FormDescription className="text-xs">
                  Valide para confirmar se o número possui WhatsApp
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 pt-6 col-span-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="!mt-0">Cliente ativo</FormLabel>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Principal</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="contato@empresa.com" {...field} />
                </FormControl>
                <FormDescription>Email para comunicações gerais</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Financial email - hidden for technicians */}
          {!isTechnicianOnly && (
            <FormField
              control={form.control}
              name="financial_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Financeiro</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="financeiro@empresa.com" {...field} />
                  </FormControl>
                  <FormDescription>Para envio de boletos e cobranças</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="zip_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CEP</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="00000-000" 
                    maxLength={9}
                    {...field}
                    onChange={(e) => {
                      const formatted = formatCEP(e.target.value);
                      field.onChange(formatted);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endereço</FormLabel>
                <FormControl>
                  <Input placeholder="Rua, número, complemento" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cidade</FormLabel>
                <FormControl>
                  <Input placeholder="Cidade" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <FormControl>
                  <Input placeholder="UF" maxLength={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Observações sobre o cliente..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : client ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}