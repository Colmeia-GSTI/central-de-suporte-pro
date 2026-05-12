import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { formatPhone, stripPhone } from "@/lib/phone";
import type { ClientMonitoredDevice } from "@/hooks/useClientMonitoredDevices";
import { Circle, Pencil, Box, Monitor, Laptop, Server, Printer, Network, Wifi } from "lucide-react";

const schema = z
  .object({
    title: z.string().trim().min(5, "Mínimo 5 caracteres").max(255, "Máximo 255 caracteres"),
    description: z.string().trim().min(20, "Mínimo 20 caracteres").max(10000, "Máximo 10000 caracteres"),
    priority: z.enum(["low", "medium", "high", "critical"]),
    contact_phone: z.string().refine((v) => /^\d{10,11}$/.test(stripPhone(v)), { message: "Telefone inválido" }),
    contact_phone_is_whatsapp: z.boolean(),
    category_id: z.string().optional(),
    asset_id: z.string().optional(),
    asset_description: z.string().optional(),
    monitored_device_id: z.string().optional(),
    device_hostname_text: z.string().max(120).optional(),
  })
  .refine(
    (d) =>
      !(
        d.monitored_device_id &&
        d.monitored_device_id !== "__none__" &&
        d.monitored_device_id !== "__free__" &&
        d.device_hostname_text &&
        d.device_hostname_text.trim().length > 0
      ),
    { message: "Informe apenas dispositivo monitorado OU hostname livre", path: ["device_hostname_text"] }
  );

export type ClientTicketFormValues = z.infer<typeof schema>;

interface AssetOption {
  id: string;
  name: string;
  asset_type: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface Props {
  monitoredDevices: ClientMonitoredDevice[];
  clientAssets: AssetOption[];
  categories: CategoryOption[];
  onSuccess: () => void;
  onCancel: () => void;
}

const assetTypeIcons: Record<string, React.ReactNode> = {
  desktop: <Monitor className="h-4 w-4" />,
  laptop: <Laptop className="h-4 w-4" />,
  server: <Server className="h-4 w-4" />,
  printer: <Printer className="h-4 w-4" />,
  network: <Network className="h-4 w-4" />,
  access_point: <Wifi className="h-4 w-4" />,
  other: <Box className="h-4 w-4" />,
};

export function ClientTicketForm({ monitoredDevices, clientAssets, categories, onSuccess, onCancel }: Props) {
  const { toast } = useToast();

  const form = useForm<ClientTicketFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      contact_phone: "",
      contact_phone_is_whatsapp: false,
      category_id: undefined,
      asset_id: undefined,
      asset_description: "",
      monitored_device_id: undefined,
      device_hostname_text: "",
    },
  });

  const selectedAssetId = form.watch("asset_id");
  const monitoredDeviceId = form.watch("monitored_device_id") ?? "";

  const mutation = useMutation({
    mutationFn: async (v: ClientTicketFormValues) => {
      const isUuid = v.monitored_device_id && v.monitored_device_id !== "__none__" && v.monitored_device_id !== "__free__";
      const useFree = v.monitored_device_id === "__free__" || (monitoredDevices.length === 0 && (v.device_hostname_text ?? "").trim().length > 0);
      const monitored_device_id = isUuid ? (v.monitored_device_id as string) : null;
      const device_hostname_text = !isUuid && useFree && (v.device_hostname_text ?? "").trim().length > 0 ? (v.device_hostname_text as string).trim() : null;

      const { data, error } = await supabase.rpc("open_client_portal_ticket", {
        p_title: v.title,
        p_description: v.description,
        p_priority: v.priority,
        p_contact_phone: stripPhone(v.contact_phone),
        p_contact_phone_is_whatsapp: v.contact_phone_is_whatsapp,
        p_category_id: v.category_id || null,
        p_asset_id: v.asset_id && v.asset_id !== "other" ? v.asset_id : null,
        p_asset_description: v.asset_id === "other" ? (v.asset_description ?? null) : null,
        p_monitored_device_id: monitored_device_id,
        p_device_hostname_text: device_hostname_text,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Chamado aberto com sucesso!" });
      form.reset();
      onSuccess();
    },
    onError: (error: { message?: string }) => {
      console.error("[ClientTicketForm] RPC failed:", error);
      toast({ title: "Erro ao abrir chamado", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl><Input placeholder="Descreva brevemente o problema" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl><Textarea rows={4} placeholder="Descreva o problema em detalhes" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contact_phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Qual número devemos utilizar para entrar em contato com você? <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  maxLength={15}
                  value={field.value}
                  onChange={(e) => field.onChange(formatPhone(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contact_phone_is_whatsapp"
          render={({ field }) => (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <Label htmlFor="is_whatsapp" className="text-sm font-normal cursor-pointer">Este número tem WhatsApp?</Label>
              <Switch id="is_whatsapp" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prioridade</FormLabel>
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
                <FormLabel>Categoria</FormLabel>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
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

        <FormField
          control={form.control}
          name="asset_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dispositivo com problema</FormLabel>
              {clientAssets.length > 0 ? (
                <>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o dispositivo (opcional)" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {clientAssets.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="flex items-center gap-2">
                            {assetTypeIcons[a.asset_type] || <Box className="h-4 w-4" />}
                            {a.name}
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem value="other">
                        <span className="flex items-center gap-2"><Box className="h-4 w-4" />Outro dispositivo (especificar)</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedAssetId === "other" && (
                    <FormField
                      control={form.control}
                      name="asset_description"
                      render={({ field: f2 }) => (
                        <FormControl><Input placeholder="Descreva o dispositivo" {...f2} /></FormControl>
                      )}
                    />
                  )}
                </>
              ) : (
                <FormField
                  control={form.control}
                  name="asset_description"
                  render={({ field: f2 }) => (
                    <FormControl><Input placeholder="Descreva o dispositivo com problema (opcional)" {...f2} /></FormControl>
                  )}
                />
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="monitored_device_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Computador / hostname (opcional)</FormLabel>
              {monitoredDevices.length > 0 && monitoredDeviceId !== "__free__" ? (
                <Select
                  value={field.value || "__none__"}
                  onValueChange={(v) => {
                    field.onChange(v);
                    if (v !== "__free__") form.setValue("device_hostname_text", "");
                  }}
                >
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione o computador" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhuma máquina específica —</SelectItem>
                    {monitoredDevices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="flex items-center gap-2">
                          <Circle className={`h-2 w-2 ${d.is_online ? "fill-green-500 text-green-500" : "fill-muted-foreground text-muted-foreground"}`} />
                          {d.hostname || d.name || "(sem nome)"}
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value="__free__">
                      <span className="flex items-center gap-2"><Pencil className="h-3.5 w-3.5" />— Outra máquina (digitar) —</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <FormField
                    control={form.control}
                    name="device_hostname_text"
                    render={({ field: f2 }) => (
                      <FormControl><Input placeholder="Ex.: PC-RECEPCAO, NOTEBOOK-JOAO" maxLength={120} {...f2} /></FormControl>
                    )}
                  />
                  {monitoredDevices.length > 0 && monitoredDeviceId === "__free__" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        field.onChange("");
                        form.setValue("device_hostname_text", "");
                      }}
                    >
                      ← Voltar para lista
                    </Button>
                  )}
                </>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending}>Abrir Chamado</Button>
        </div>
      </form>
    </Form>
  );
}
