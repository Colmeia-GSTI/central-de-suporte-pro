import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTechnicianList } from "@/hooks/useTechnicianList";
import { useClientMonitoredDevices } from "@/hooks/useClientMonitoredDevices";
import { logger } from "@/lib/logger";
import { stripPhone, formatPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { TagsInput } from "@/components/tickets/TagsInput";
import { KBSuggestions } from "@/components/tickets/KBSuggestions";
import {
  DeviceSelector, type DeviceSelectorValue,
} from "@/components/tickets/shared/DeviceSelector";
import {
  FileText, Lock, CheckSquare, User, Loader2, Check, Phone,
} from "lucide-react";
import type { Enums } from "@/integrations/supabase/types";

type TicketType = "external" | "internal" | "task";

const schema = z.object({
  title: z.string().min(5, "Título deve ter pelo menos 5 caracteres").max(255),
  description: z.string().min(20, "Descreva o problema com pelo menos 20 caracteres").max(10000),
  client_id: z.string().optional(),
  requester_contact_id: z.string().optional(),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  origin: z.enum(["portal", "phone", "email", "chat", "whatsapp", "internal", "task"]),
  assigned_to: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_phone_is_whatsapp: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: {
    title?: string;
    description?: string;
    client_id?: string;
    priority?: "low" | "medium" | "high" | "critical";
  };
}

const ticketTypeConfig: Record<TicketType, { label: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  external: { label: "Chamado Externo", description: "Atendimento ao cliente com notificação", icon: FileText, color: "bg-primary/10 border-primary/40 text-primary" },
  internal: { label: "Chamado Interno", description: "Tratamento interno sem notificar cliente", icon: Lock, color: "bg-blue-500/10 border-blue-500/40 text-blue-600" },
  task:     { label: "Tarefa Interna",  description: "Tarefa da equipe sem cliente",            icon: CheckSquare, color: "bg-purple-500/10 border-purple-500/40 text-purple-600" },
};

const priorityConfig = {
  low:      { label: "Baixa",    color: "bg-success/10 text-success border-success/30" },
  medium:   { label: "Média",    color: "bg-primary/10 text-primary border-primary/30" },
  high:     { label: "Alta",     color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  critical: { label: "Crítica",  color: "bg-destructive/10 text-destructive border-destructive/30" },
};

const originLabels: Record<string, string> = {
  portal: "Portal", phone: "Telefone", email: "Email", chat: "Chat", whatsapp: "WhatsApp",
};

const emptyDevice: DeviceSelectorValue = {
  monitored_device_id: null, asset_id: null, asset_description: null, device_hostname_text: null,
};

export function TicketForm({ onSuccess, onCancel, initialData }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [ticketType, setTicketType] = useState<TicketType>("external");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [device, setDevice] = useState<DeviceSelectorValue>(emptyDevice);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initialData?.title || "",
      description: initialData?.description || "",
      client_id: initialData?.client_id || "",
      requester_contact_id: "",
      priority: initialData?.priority || "medium",
      origin: "phone",
      category_id: "",
      subcategory_id: "",
      assigned_to: "",
      contact_phone: "",
      contact_phone_is_whatsapp: false,
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form, key: "ticket_new", storage: "session",
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-select"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_categories").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-select"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_subcategories").select("id, category_id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: technicians = [] } = useTechnicianList();

  const selectedClientId = form.watch("client_id");
  const selectedCategoryId = form.watch("category_id");

  const { data: clientContacts = [] } = useQuery({
    queryKey: ["client-contacts-select", selectedClientId],
    enabled: !!selectedClientId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, name, role, phone, whatsapp, notify_whatsapp")
        .eq("client_id", selectedClientId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientAssets = [] } = useQuery({
    queryKey: ["client-assets-form", selectedClientId],
    enabled: !!selectedClientId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, name, asset_type")
        .eq("client_id", selectedClientId!)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { items: monitoredDevices } = useClientMonitoredDevices(selectedClientId || null);

  const filteredSubcategories = useMemo(
    () => selectedCategoryId ? subcategories.filter((s) => s.category_id === selectedCategoryId) : [],
    [subcategories, selectedCategoryId]
  );

  const handleContactChange = (contactId: string) => {
    form.setValue("requester_contact_id", contactId);
    const c = clientContacts.find((cc) => cc.id === contactId);
    if (c) {
      const phone = c.phone || c.whatsapp || "";
      form.setValue("contact_phone", phone ? formatPhone(phone) : "");
      form.setValue("contact_phone_is_whatsapp", !!(c.notify_whatsapp || c.whatsapp));
    }
  };

  const handleTicketTypeChange = (type: TicketType) => {
    setTicketType(type);
    if (type === "internal") form.setValue("origin", "internal");
    else if (type === "task") {
      form.setValue("origin", "task");
      form.setValue("client_id", "");
      form.setValue("requester_contact_id", "");
      setDevice(emptyDevice);
    } else if (form.getValues("origin") === "internal" || form.getValues("origin") === "task") {
      form.setValue("origin", "phone");
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { data: ticketId, error } = await supabase.rpc("create_staff_ticket", {
        p_ticket_type: ticketType,
        p_title: data.title,
        p_description: data.description,
        p_priority: data.priority,
        p_origin: data.origin as Enums<"ticket_origin">,
        p_client_id: ticketType === "task" ? null : (data.client_id || null),
        p_requester_contact_id: ticketType === "task" ? null : (data.requester_contact_id || null),
        p_category_id: data.category_id || null,
        p_subcategory_id: data.subcategory_id || null,
        p_assigned_to: data.assigned_to || null,
        p_asset_id: device.asset_id,
        p_asset_description: device.asset_description,
        p_monitored_device_id: device.monitored_device_id,
        p_device_hostname_text: device.device_hostname_text,
        p_contact_phone: data.contact_phone ? stripPhone(data.contact_phone) : null,
        p_contact_phone_is_whatsapp: data.contact_phone_is_whatsapp,
        p_tag_ids: tagIds,
      });
      if (error) throw error;

      // fire-and-forget notification (skip for task/internal)
      if (ticketId && ticketType === "external") {
        supabase.functions.invoke("send-ticket-notification", {
          body: { ticket_id: ticketId, event_type: "created" },
        }).catch((err) =>
          logger.warn("Failed to send creation notification", "Tickets", { error: err?.message })
        );
      }
      return ticketId;
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
      const label = ticketType === "task" ? "Tarefa criada!"
        : ticketType === "internal" ? "Chamado interno criado!"
        : "Chamado criado!";
      toast({ title: label });
      onSuccess();
    },
    onError: (error: { message?: string }) => {
      toast({
        title: "Erro ao criar chamado",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => { clearDraft(); onCancel(); };

  const title = form.watch("title");
  const description = form.watch("description");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}

        {/* Tipo de Chamado */}
        <div className="space-y-2">
          <FormLabel className="text-sm font-semibold">Tipo de Chamado</FormLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.entries(ticketTypeConfig) as [TicketType, typeof ticketTypeConfig.external][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const selected = ticketType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTicketTypeChange(key)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all active:scale-[0.98] ${
                    selected ? cfg.color + " font-semibold" : "bg-card border-border text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{cfg.label}</p>
                    <p className="text-[10px] opacity-70 leading-tight mt-0.5">{cfg.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Cliente + Contato (não para task) */}
        {ticketType !== "task" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente {ticketType === "external" && <span className="text-destructive">*</span>}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => { field.onChange(v); form.setValue("requester_contact_id", ""); form.setValue("contact_phone", ""); setDevice(emptyDevice); }}
                  >
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {ticketType === "external" && (
              <FormField
                control={form.control}
                name="requester_contact_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contato Solicitante</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={handleContactChange}
                      disabled={!selectedClientId || clientContacts.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !selectedClientId ? "Selecione um cliente primeiro"
                            : clientContacts.length === 0 ? "Nenhum contato cadastrado"
                            : "Selecione o solicitante"
                          } />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientContacts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-2">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {c.name}{c.role && <span className="text-muted-foreground text-xs">— {c.role}</span>}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* Título + Descrição */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{ticketType === "task" ? "O que precisa ser feito?" : "Qual o problema?"} <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input
                  placeholder={ticketType === "task" ? "Ex: Atualizar firmware..." : "Ex: Impressora não liga..."}
                  className="text-base"
                  {...field}
                />
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
              <FormLabel>{ticketType === "task" ? "Detalhes da tarefa" : "Descreva em detalhes"} <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="Inclua: quando começou, frequência, passos tentados..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {ticketType === "external" && title.length >= 5 && (
          <KBSuggestions title={title} description={description} />
        )}

        {/* Dispositivo (só externo e quando tem cliente) */}
        {ticketType === "external" && selectedClientId && (
          <DeviceSelector
            monitoredDevices={monitoredDevices}
            assets={clientAssets}
            value={device}
            onChange={setDevice}
            label="Dispositivo com problema"
          />
        )}

        {/* Telefone de contato (só externo) */}
        {ticketType === "external" && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Telefone de retorno
            </div>
            <FormField
              control={form.control}
              name="contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                      maxLength={15}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(formatPhone(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Preenchido automaticamente ao selecionar o contato. Edite se for outro número.
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_phone_is_whatsapp"
              render={({ field }) => (
                <div className="flex items-center justify-between">
                  <span className="text-xs">Este número tem WhatsApp?</span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />
          </div>
        )}

        {/* Categoria + Subcategoria + Origem */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => { field.onChange(v); form.setValue("subcategory_id", ""); }}
                >
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="subcategory_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subcategoria</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={filteredSubcategories.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={filteredSubcategories.length === 0 ? "Selecione categoria primeiro" : "Selecione"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredSubcategories.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>

        {ticketType === "external" && (
          <FormField
            control={form.control}
            name="origin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Canal de Origem</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.entries(originLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        <Separator />

        {/* Prioridade */}
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold">Prioridade</FormLabel>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(priorityConfig) as [string, { label: string; color: string }][]).map(([key, cfg]) => {
                  const selected = field.value === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => field.onChange(key)}
                      className={`px-2 py-2 rounded-lg border-2 text-xs transition-all active:scale-[0.98] ${
                        selected ? cfg.color + " font-semibold" : "bg-card border-border text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </FormItem>
          )}
        />

        {ticketType !== "external" && (
          <div className="bg-muted/30 border rounded-lg px-3 py-2 text-xs text-muted-foreground">
            ⏱ SLA não aplicado — {ticketType === "task" ? "tarefas internas" : "chamados internos"} não têm prazo.
          </div>
        )}

        {/* Técnico */}
        <FormField
          control={form.control}
          name="assigned_to"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Atribuir a Técnico</FormLabel>
              <FormDescription className="text-xs">
                Opcional. Se atribuído, inicia como "Em Andamento".
              </FormDescription>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Não atribuir (fila)" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="">Não atribuir (fila)</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      <span className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {t.full_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {/* Tags */}
        <div className="space-y-2">
          <FormLabel>Tags</FormLabel>
          <TagsInput selectedTagIds={tagIds} onChange={setTagIds} />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending} className="min-w-[140px] gap-1.5">
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Criando...</>
            ) : (
              <><Check className="h-4 w-4" />
                {ticketType === "task" ? "Criar Tarefa" : ticketType === "internal" ? "Criar Interno" : "Criar Chamado"}
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
