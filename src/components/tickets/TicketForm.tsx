import { useState, useMemo, useCallback } from "react";
import { KBSuggestions } from "@/components/tickets/KBSuggestions";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { TagsInput } from "@/components/tickets/TagsInput";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Building2, AlertCircle, Tag, User, Phone, Mail, Globe,
  MessageSquare, ChevronRight, ChevronLeft, Check, Loader2,
} from "lucide-react";
import type { Enums } from "@/integrations/supabase/types";

const ticketSchema = z.object({
  title: z.string()
    .min(5, "Título deve ter pelo menos 5 caracteres")
    .max(255, "Título deve ter no máximo 255 caracteres"),
  description: z.string()
    .min(20, "Descreva o problema com pelo menos 20 caracteres")
    .max(10000, "Descrição deve ter no máximo 10.000 caracteres"),
  client_id: z.string().optional(),
  requester_contact_id: z.string().optional(),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  origin: z.enum(["portal", "phone", "email", "chat", "whatsapp"]),
  assigned_to: z.string().optional(),
});

type TicketFormData = z.infer<typeof ticketSchema>;

interface TicketFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: {
    title?: string;
    description?: string;
    client_id?: string;
    priority?: "low" | "medium" | "high" | "critical";
  };
}

const STEPS = [
  { id: "info", label: "Informações", icon: FileText, description: "Título e descrição do problema" },
  { id: "context", label: "Contexto", icon: Building2, description: "Cliente, categoria e origem" },
  { id: "config", label: "Configurações", icon: AlertCircle, description: "Prioridade, técnico e tags" },
] as const;

const priorityConfig = {
  low: { label: "Baixa", description: "Pode aguardar", color: "bg-success/10 text-success border-success/30" },
  medium: { label: "Média", description: "Resolver em breve", color: "bg-primary/10 text-primary border-primary/30" },
  high: { label: "Alta", description: "Urgente", color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  critical: { label: "Crítica", description: "Ação imediata", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

const originConfig = {
  portal: { label: "Portal", icon: Globe },
  phone: { label: "Telefone", icon: Phone },
  email: { label: "Email", icon: Mail },
  chat: { label: "Chat", icon: MessageSquare },
  whatsapp: { label: "WhatsApp", icon: Phone },
};

export function TicketForm({ onSuccess, onCancel, initialData }: TicketFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      title: initialData?.title || "",
      description: initialData?.description || "",
      client_id: initialData?.client_id || "",
      requester_contact_id: "",
      priority: initialData?.priority || "medium",
      origin: "portal",
      category_id: "",
      subcategory_id: "",
      assigned_to: "",
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: "ticket_new",
    storage: "session",
  });

  // Data queries
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_categories").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_subcategories").select("id, category_id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians-select"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles").select("user_id").in("role", ["technician", "manager", "admin"]);
      if (rolesError) throw rolesError;
      const staffIds = [...new Set((rolesData || []).map((r) => r.user_id))];
      if (staffIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", staffIds).order("full_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedClientId = form.watch("client_id");
  const { data: clientContacts = [] } = useQuery({
    queryKey: ["client-contacts-select", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, name, role, phone, whatsapp")
        .eq("client_id", selectedClientId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
    staleTime: 5 * 60 * 1000,
  });

  const selectedCategoryId = form.watch("category_id");
  const filteredSubcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    return subcategories.filter((sub) => sub.category_id === selectedCategoryId);
  }, [subcategories, selectedCategoryId]);

  const handleClientChange = useCallback((value: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(value);
    form.setValue("requester_contact_id", "");
  }, [form]);

  // Step validation
  const canProceed = useMemo(() => {
    if (step === 0) {
      const title = form.watch("title");
      const description = form.watch("description");
      return title.length >= 5 && description.length >= 20;
    }
    return true;
  }, [step, form.watch("title"), form.watch("description")]);

  const mutation = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const payload = {
        title: data.title,
        description: data.description,
        client_id: data.client_id || null,
        requester_contact_id: data.requester_contact_id || null,
        category_id: data.category_id || null,
        subcategory_id: data.subcategory_id || null,
        priority: data.priority as Enums<"ticket_priority">,
        origin: data.origin as Enums<"ticket_origin">,
        assigned_to: data.assigned_to || null,
        created_by: user?.id,
        status: (data.assigned_to ? "in_progress" : "open") as Enums<"ticket_status">,
        first_response_at: data.assigned_to ? new Date().toISOString() : null,
      };

      const { data: newTicket, error } = await supabase
        .from("tickets").insert(payload).select("id").single();
      if (error) throw error;

      if (newTicket?.id) {
        const { error: historyError } = await supabase.from("ticket_history").insert({
          ticket_id: newTicket.id,
          user_id: user?.id,
          old_status: null,
          new_status: payload.status,
          comment: data.assigned_to ? "Chamado criado e atribuído" : "Chamado criado",
        });
        if (historyError) logger.warn("Failed to insert creation history", "Tickets", { error: historyError.message });

        if (selectedTagIds.length > 0) {
          const tagAssignments = selectedTagIds.map((tagId) => ({
            ticket_id: newTicket.id,
            tag_id: tagId,
          }));
          const { error: tagError } = await supabase.from("ticket_tag_assignments").insert(tagAssignments);
          if (tagError) logger.warn("Failed to assign tags", "Tickets", { error: tagError.message });
        }
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
      toast({ title: "Chamado criado com sucesso!" });
      onSuccess();
    },
    onError: (error) => {
      toast({ title: "Erro ao criar chamado", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: TicketFormData) => mutation.mutate(data);

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  const nextStep = () => { if (step < STEPS.length - 1 && canProceed) setStep(step + 1); };
  const prevStep = () => { if (step > 0) setStep(step - 1); };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}

        {/* Step Indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isCompleted = i < step;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => { if (i <= step || canProceed) setStep(i); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all w-full ${
                    isActive
                      ? "bg-primary/10 border border-primary/30 text-primary"
                      : isCompleted
                      ? "bg-success/10 border border-success/30 text-success"
                      : "bg-muted/50 border border-transparent text-muted-foreground"
                  }`}
                >
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground" : isCompleted ? "bg-success text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className="hidden sm:block text-left min-w-0">
                    <p className="text-xs font-medium leading-none">{s.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.description}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1 flex-shrink-0 hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Step 1: Info */}
            {step === 0 && (
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Qual o problema? <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormDescription>
                        Um título curto e claro ajuda na triagem rápida
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="Ex: Impressora não liga, Email não envia, Sistema travando..."
                          className="text-base h-12"
                          {...field}
                        />
                      </FormControl>
                      <div className="flex justify-between">
                        <FormMessage />
                        <span className="text-xs text-muted-foreground">{field.value.length}/255</span>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Descreva em detalhes <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormDescription>
                        Quanto mais detalhes, mais rápido o diagnóstico. Inclua: quando começou, frequência, passos tentados.
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva o problema em detalhes..."
                          rows={5}
                          className="text-base resize-none"
                          {...field}
                        />
                      </FormControl>
                      <div className="flex justify-between">
                        <FormMessage />
                        <span className="text-xs text-muted-foreground">{field.value.length}/10.000</span>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Step 2: Context */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="client_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente</FormLabel>
                        <Select
                          onValueChange={(value) => handleClientChange(value, field.onChange)}
                          value={field.value}
                        >
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
                    name="requester_contact_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contato Solicitante</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
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
                            {clientContacts.map((contact) => (
                              <SelectItem key={contact.id} value={contact.id}>
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  <span>{contact.name}</span>
                                  {contact.role && (
                                    <span className="text-muted-foreground text-xs">— {contact.role}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("subcategory_id", "");
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma categoria" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
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
                    name="subcategory_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subcategoria</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={filteredSubcategories.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={
                                filteredSubcategories.length === 0
                                  ? "Selecione uma categoria primeiro"
                                  : "Selecione uma subcategoria"
                              } />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredSubcategories.map((sub) => (
                              <SelectItem key={sub.id} value={sub.id}>
                                {sub.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="origin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Canal de Origem</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {(Object.entries(originConfig) as [string, { label: string; icon: React.ComponentType<{ className?: string }> }][]).map(([key, cfg]) => {
                          const Icon = cfg.icon;
                          const isSelected = field.value === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => field.onChange(key)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all active:scale-[0.98] ${
                                isSelected
                                  ? "bg-primary/10 border-primary/40 text-primary font-medium"
                                  : "bg-card border-border text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Step 3: Config */}
            {step === 2 && (
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Prioridade</FormLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(Object.entries(priorityConfig) as [string, { label: string; description: string; color: string }][]).map(([key, cfg]) => {
                          const isSelected = field.value === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => field.onChange(key)}
                              className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-sm transition-all active:scale-[0.98] ${
                                isSelected ? cfg.color + " font-semibold" : "bg-card border-border text-muted-foreground hover:border-muted-foreground/30"
                              }`}
                            >
                              <span className="font-medium">{cfg.label}</span>
                              <span className="text-[10px] opacity-70">{cfg.description}</span>
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Atribuir a Técnico</FormLabel>
                      <FormDescription>
                        Opcional. Se atribuído, o chamado inicia com status "Em Andamento".
                      </FormDescription>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Atribuir automaticamente (fila)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Não atribuir (fila)</SelectItem>
                          {technicians.map((tech) => (
                            <SelectItem key={tech.user_id} value={tech.user_id}>
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3 text-muted-foreground" />
                                {tech.full_name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tags */}
                <div className="space-y-2">
                  <FormLabel className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </FormLabel>
                  <FormDescription>
                    Tags ajudam na organização e filtragem de chamados
                  </FormDescription>
                  <TagsInput selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
                </div>

                {/* Summary Preview */}
                <div className="bg-muted/30 border rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-muted-foreground">Resumo do Chamado</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Título:</span>
                      <p className="font-medium truncate">{form.watch("title") || "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cliente:</span>
                      <p className="font-medium truncate">
                        {clients.find((c) => c.id === form.watch("client_id"))?.name || "Não selecionado"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Prioridade:</span>
                      <Badge className={`ml-1 ${priorityConfig[form.watch("priority")]?.color || ""}`}>
                        {priorityConfig[form.watch("priority")]?.label}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Técnico:</span>
                      <p className="font-medium truncate">
                        {technicians.find((t) => t.user_id === form.watch("assigned_to"))?.full_name || "Fila"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <Separator />

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={step === 0 ? handleCancel : prevStep}
            className="gap-1.5"
          >
            {step === 0 ? (
              "Cancelar"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </>
            )}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={nextStep}
              disabled={!canProceed}
              className="gap-1.5"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="gap-1.5 min-w-[140px]"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Criar Chamado
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
