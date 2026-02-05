import { useState } from "react";
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
  FormDescription,
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
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";

const licenseSchema = z.object({
  name: z.string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(255, "Nome deve ter no máximo 255 caracteres"),
  client_id: z.string().min(1, "Selecione um cliente"),
  vendor: z.string().max(255, "Fornecedor deve ter no máximo 255 caracteres").optional(),
  license_key: z.string().max(1000, "Chave deve ter no máximo 1.000 caracteres").optional(),
  total_licenses: z.coerce.number().min(1, "Deve ter pelo menos 1 licença"),
  used_licenses: z.coerce.number().min(0),
  purchase_date: z.string().optional(),
  expire_date: z.string().optional(),
  purchase_value: z.coerce.number().optional(),
  notes: z.string().max(5000, "Observações deve ter no máximo 5.000 caracteres").optional(),
}).refine(
  (data) => data.used_licenses <= data.total_licenses,
  {
    message: "Licenças em uso não podem exceder o total de licenças",
    path: ["used_licenses"],
  }
).refine(
  (data) => {
    if (data.purchase_date && data.expire_date) {
      return new Date(data.expire_date) >= new Date(data.purchase_date);
    }
    return true;
  },
  {
    message: "Data de expiração deve ser posterior à data de compra",
    path: ["expire_date"],
  }
);

type LicenseFormData = z.infer<typeof licenseSchema>;

// Type for safe view (masked key)
interface LicenseSafe {
  id: string;
  client_id: string;
  name: string;
  vendor: string | null;
  total_licenses: number;
  used_licenses: number;
  purchase_date: string | null;
  expire_date: string | null;
  purchase_value: number | null;
  notes: string | null;
  license_key_masked: string | null;
}

interface LicenseFormProps {
  license?: LicenseSafe | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function LicenseForm({ license, onSuccess, onCancel }: LicenseFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  
  const [showKey, setShowKey] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);
  const [realKey, setRealKey] = useState<string | null>(null);
  const [keyChanged, setKeyChanged] = useState(false);

  const form = useForm<LicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: {
      name: license?.name || "",
      client_id: license?.client_id || "",
      vendor: license?.vendor || "",
      license_key: "", // Never pre-fill with real key for security
      total_licenses: license?.total_licenses || 1,
      used_licenses: license?.used_licenses || 0,
      purchase_date: license?.purchase_date || "",
      expire_date: license?.expire_date || "",
      purchase_value: license?.purchase_value || undefined,
      notes: license?.notes || "",
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: license ? `license_edit_${license.id}` : "license_new",
    storage: "session",
    enabled: !license,
    excludeFields: ["license_key"], // Don't persist sensitive data
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

  // Fetch real license key (admin only)
  const revealKey = async () => {
    if (!license || !isAdmin) return;
    
    setLoadingKey(true);
    try {
      const { data, error } = await supabase.rpc("get_license_key", {
        license_id: license.id,
      });
      
      if (error) throw error;
      
      setRealKey(data);
      setShowKey(true);
      form.setValue("license_key", data || "");
      
      toast({
        title: "Chave revelada",
        description: "Acesso registrado em auditoria.",
      });
    } catch (error: unknown) {
      toast({
        title: "Erro ao revelar chave",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoadingKey(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: LicenseFormData) => {
      const payload: Record<string, string | number | null> = {
        name: data.name,
        client_id: data.client_id,
        vendor: data.vendor || null,
        total_licenses: data.total_licenses,
        used_licenses: data.used_licenses,
        purchase_date: data.purchase_date || null,
        expire_date: data.expire_date || null,
        purchase_value: data.purchase_value || null,
        notes: data.notes || null,
      };

      // Only include license_key if:
      // 1. It's a new license and key is provided
      // 2. It's an edit and the key was explicitly changed
      if (!license) {
        // New license - include key if provided
        payload.license_key = data.license_key || null;
      } else if (keyChanged && data.license_key) {
        // Edit - only update key if explicitly changed
        payload.license_key = data.license_key;
      }

      if (license) {
        const { error } = await supabase.from("software_licenses").update(payload).eq("id", license.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("software_licenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["licenses"] });
      toast({ title: license ? "Licença atualizada" : "Licença criada" });
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

  const handleKeyChange = (value: string) => {
    setKeyChanged(true);
    form.setValue("license_key", value);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Nome do Software *</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Microsoft Office 365" {...field} />
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
            name="vendor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornecedor</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Microsoft" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="license_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Lock className="h-3 w-3" />
                  Chave de Licença
                  {license && (
                    <span className="text-xs font-normal text-muted-foreground">
                      (protegida)
                    </span>
                  )}
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <div className="relative flex-1">
                      <Input
                        type={showKey ? "text" : "password"}
                        placeholder={license ? (license.license_key_masked || "Não definida") : "XXXXX-XXXXX-XXXXX"}
                        {...field}
                        onChange={(e) => handleKeyChange(e.target.value)}
                        className="pr-10"
                        disabled={license && !isAdmin && !realKey}
                      />
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  {license && isAdmin && !realKey && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={revealKey}
                      disabled={loadingKey}
                      className="shrink-0"
                    >
                      {loadingKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4 mr-1" />
                          Revelar
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {license && (
                  <FormDescription className="text-xs">
                    {isAdmin 
                      ? "Clique em 'Revelar' para ver a chave completa. O acesso será registrado."
                      : "Apenas administradores podem visualizar chaves de licença."
                    }
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="total_licenses"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total de Licenças *</FormLabel>
                <FormControl>
                  <Input type="number" min={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="used_licenses"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Licenças em Uso</FormLabel>
                <FormControl>
                  <Input type="number" min={0} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="purchase_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Compra</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expire_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Expiração</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
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
                  <Textarea placeholder="Notas sobre a licença..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : license ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
