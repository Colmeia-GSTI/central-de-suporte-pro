import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { formatPhone, stripPhone } from "@/lib/phone";
import { KBSuggestions } from "@/components/tickets/KBSuggestions";
import {
  DeviceSelector, type DeviceSelectorValue, type AssetOption,
} from "@/components/tickets/shared/DeviceSelector";
import { ContactBlock, type ContactBlockValue, isContactBlockValid } from "./ContactBlock";
import type { ClientMonitoredDevice } from "@/hooks/useClientMonitoredDevices";

const schema = z.object({
  title: z.string().trim().min(5, "Mínimo 5 caracteres").max(255, "Máximo 255 caracteres"),
  description: z.string().trim().min(20, "Mínimo 20 caracteres").max(10000, "Máximo 10000 caracteres"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  category_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CategoryOption { id: string; name: string }

interface Props {
  contactName: string;
  defaultPhone: string | null;
  defaultIsWhatsapp: boolean;
  monitoredDevices: ClientMonitoredDevice[];
  clientAssets: AssetOption[];
  categories: CategoryOption[];
  onSuccess: () => void;
  onCancel: () => void;
}

const emptyDevice: DeviceSelectorValue = {
  monitored_device_id: null, asset_id: null, asset_description: null, device_hostname_text: null,
};

export function ClientTicketForm({
  contactName, defaultPhone, defaultIsWhatsapp,
  monitoredDevices, clientAssets, categories,
  onSuccess, onCancel,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [device, setDevice] = useState<DeviceSelectorValue>(emptyDevice);
  const [contact, setContact] = useState<ContactBlockValue>({
    phone: defaultPhone ? formatPhone(defaultPhone) : "",
    is_whatsapp: defaultIsWhatsapp,
    for_someone_else: !defaultPhone,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", priority: "medium", category_id: undefined },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form, key: "ticket_portal", storage: "session",
  });

  const title = form.watch("title");
  const description = form.watch("description");

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      if (!isContactBlockValid(contact)) {
        throw new Error("Informe um telefone válido (10 ou 11 dígitos).");
      }
      const { data, error } = await supabase.rpc("open_client_portal_ticket", {
        p_title: v.title,
        p_description: v.description,
        p_priority: v.priority,
        p_contact_phone: stripPhone(contact.phone),
        p_contact_phone_is_whatsapp: contact.is_whatsapp,
        p_category_id: v.category_id || null,
        p_asset_id: device.asset_id,
        p_asset_description: device.asset_description,
        p_monitored_device_id: device.monitored_device_id,
        p_device_hostname_text: device.device_hostname_text,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Chamado aberto com sucesso!");
      clearDraft();
      form.reset();
      setDevice(emptyDevice);
      onSuccess();
    },
    onError: (error: { message?: string; details?: string; hint?: string; code?: string } | Error | unknown) => {
      const err = error as { message?: string; details?: string; hint?: string; code?: string };
      console.error("[ClientTicketForm] RPC failed:", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        raw: error,
      });
      const description =
        err?.message ||
        err?.details ||
        err?.hint ||
        (err?.code ? `Código ${err.code}` : "") ||
        "Erro desconhecido. Tente novamente em alguns segundos. Se persistir, entre em contato com o suporte.";
      toast.error("Erro ao abrir chamado", {
        description,
      });
    },
  });

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>O que está acontecendo? <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="Resumo do problema (ex.: impressora não imprime)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descreva em detalhes <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Quando começou, frequência, o que já tentou..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {title.length >= 5 && (
          <KBSuggestions title={title} description={description} />
        )}

        <DeviceSelector
          monitoredDevices={monitoredDevices}
          assets={clientAssets}
          value={device}
          onChange={setDevice}
          label="Qual dispositivo está com problema?"
          description="Ajuda nossa equipe a localizar o equipamento mais rápido."
        />

        <ContactBlock
          contactName={contactName}
          defaultPhone={defaultPhone}
          defaultIsWhatsapp={defaultIsWhatsapp}
          value={contact}
          onChange={setContact}
        />

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Avançado (prioridade, categoria)
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Prioridade</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="critical">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Categoria</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Abrindo..." : "Abrir Chamado"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
