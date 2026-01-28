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
import type { Tables } from "@/integrations/supabase/types";

const licenseSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  client_id: z.string().min(1, "Selecione um cliente"),
  vendor: z.string().optional(),
  license_key: z.string().optional(),
  total_licenses: z.coerce.number().min(1, "Deve ter pelo menos 1 licença"),
  used_licenses: z.coerce.number().min(0),
  purchase_date: z.string().optional(),
  expire_date: z.string().optional(),
  purchase_value: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type LicenseFormData = z.infer<typeof licenseSchema>;

interface LicenseFormProps {
  license?: Tables<"software_licenses"> | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function LicenseForm({ license, onSuccess, onCancel }: LicenseFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<LicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: {
      name: license?.name || "",
      client_id: license?.client_id || "",
      vendor: license?.vendor || "",
      license_key: license?.license_key || "",
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

  const mutation = useMutation({
    mutationFn: async (data: LicenseFormData) => {
      const payload = {
        name: data.name,
        client_id: data.client_id,
        vendor: data.vendor || null,
        license_key: data.license_key || null,
        total_licenses: data.total_licenses,
        used_licenses: data.used_licenses,
        purchase_date: data.purchase_date || null,
        expire_date: data.expire_date || null,
        purchase_value: data.purchase_value || null,
        notes: data.notes || null,
      };

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
                <FormLabel>Chave de Licença</FormLabel>
                <FormControl>
                  <Input placeholder="XXXXX-XXXXX-XXXXX" {...field} />
                </FormControl>
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
