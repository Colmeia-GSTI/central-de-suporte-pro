import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Clock, Building2, Tag, Pencil, Save, X, CheckCircle, History, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { EntityHistoryTimeline, HistoryEntry } from "@/components/ui/EntityHistoryTimeline";
import { TagsInput } from "@/components/tickets/TagsInput";
import { TagBadge } from "@/components/tickets/TagBadge";
import { RequesterContactCard } from "@/components/tickets/RequesterContactCard";
import { TicketLinksSection } from "@/components/tickets/TicketLinksSection";
import type { Tables, Enums } from "@/integrations/supabase/types";

type RequesterContactType = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: string | null;
};

type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
  ticket_subcategories?: { id: string; name: string } | null;
  requester_contact?: RequesterContactType | null;
  subcategory_id?: string | null;
  asset_description?: string | null;
};

interface TicketDetailsTabProps {
  ticket: TicketWithRelations;
  onUpdate?: () => void;
}

interface TicketFormData {
  technicians: { user_id: string; full_name: string }[];
  categories: { id: string; name: string }[];
  assets: { id: string; name: string; asset_type: string }[];
}

const statusLabels: Record<Enums<"ticket_status">, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  paused: "Pausado",
  waiting_third_party: "Aguardando Terceiro",
  no_contact: "Sem Contato",
  resolved: "Resolvido",
  closed: "Fechado",
};

const statusColors: Record<Enums<"ticket_status">, string> = {
  open: "bg-status-open text-white",
  in_progress: "bg-status-progress text-white",
  waiting: "bg-status-waiting text-white",
  paused: "bg-amber-500 text-white",
  waiting_third_party: "bg-purple-500 text-white",
  no_contact: "bg-orange-500 text-white",
  resolved: "bg-status-success text-white",
  closed: "bg-muted text-muted-foreground",
};

const priorityLabels: Record<Enums<"ticket_priority">, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function TicketDetailsTab({ ticket, onUpdate }: TicketDetailsTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [formData, setFormData] = useState({
    title: ticket.title,
    description: ticket.description || "",
    status: ticket.status,
    priority: ticket.priority,
    category_id: ticket.category_id || "",
    subcategory_id: ticket.subcategory_id || "",
    assigned_to: ticket.assigned_to || "",
    asset_id: ticket.asset_id || "",
  });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Reset form when ticket changes
  useEffect(() => {
    setFormData({
      title: ticket.title,
      description: ticket.description || "",
      status: ticket.status,
      priority: ticket.priority,
      category_id: ticket.category_id || "",
      subcategory_id: ticket.subcategory_id || "",
      assigned_to: ticket.assigned_to || "",
      asset_id: ticket.asset_id || "",
    });
  }, [ticket]);

  // Load current tags for this ticket
  const { data: ticketTags = [] } = useQuery({
    queryKey: ["ticket-tags-assignments", ticket.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_tag_assignments")
        .select("tag_id, ticket_tags(id, name, color)")
        .eq("ticket_id", ticket.id);
      if (error) throw error;
      return data;
    },
  });

  // Sync selectedTagIds with current tags
  useEffect(() => {
    setSelectedTagIds(ticketTags.map((t) => t.tag_id));
  }, [ticketTags]);

  // CONSOLIDATED: Single RPC call for all form data (technicians, categories, assets)
  const { data: formDataRpc } = useQuery({
    queryKey: ["ticket-form-data", ticket.client_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ticket_form_data", {
        p_client_id: ticket.client_id || null,
      });
      if (error) throw error;
      return data as unknown as TicketFormData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const technicians = useMemo(() => formDataRpc?.technicians || [], [formDataRpc]);
  const categories = useMemo(() => formDataRpc?.categories || [], [formDataRpc]);
  const assets = useMemo(() => formDataRpc?.assets || [], [formDataRpc]);

  // Fetch subcategories based on selected category
  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-for-category", formData.category_id],
    queryFn: async () => {
      if (!formData.category_id) return [];
      const { data, error } = await supabase
        .from("ticket_subcategories")
        .select("id, name")
        .eq("category_id", formData.category_id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!formData.category_id,
  });

  // Fetch recent history for timeline
  const { data: recentHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["ticket-recent-history", ticket.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_history")
        .select("id, user_id, comment, old_status, new_status, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;

      // Get user names for history entries
      const userIds = Array.from(
        new Set(data.map((h) => h.user_id).filter(Boolean))
      ) as string[];

      const nameByUserId = new Map<string, string>();
      if (userIds.length) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        if (profilesData) {
          for (const p of profilesData) {
            nameByUserId.set(p.user_id, p.full_name);
          }
        }
      }

      return data.map((h): HistoryEntry => ({
        id: h.id,
        user_name: h.user_id ? nameByUserId.get(h.user_id) ?? null : null,
        action: h.comment || (h.old_status && h.new_status 
          ? `Status: ${statusLabels[h.old_status as Enums<"ticket_status">] || h.old_status} → ${statusLabels[h.new_status as Enums<"ticket_status">] || h.new_status}`
          : "Alteração registrada"),
        details: null,
        created_at: h.created_at,
      }));
    },
    enabled: isHistoryOpen,
    staleTime: 30 * 1000, // 30 seconds
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<typeof formData>) => {
      const { error } = await supabase
        .from("tickets")
        .update({
          ...updates,
          assigned_to: updates.assigned_to || null,
          asset_id: updates.asset_id || null,
          category_id: updates.category_id || null,
          subcategory_id: updates.subcategory_id || null,
        })
        .eq("id", ticket.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      // Update tags
      const currentTagIds = ticketTags.map((t) => t.tag_id);
      const tagsToAdd = selectedTagIds.filter((id) => !currentTagIds.includes(id));
      const tagsToRemove = currentTagIds.filter((id) => !selectedTagIds.includes(id));

      if (tagsToAdd.length > 0) {
        await supabase.from("ticket_tag_assignments").insert(
          tagsToAdd.map((tagId) => ({ ticket_id: ticket.id, tag_id: tagId }))
        );
      }

      if (tagsToRemove.length > 0) {
        await supabase
          .from("ticket_tag_assignments")
          .delete()
          .eq("ticket_id", ticket.id)
          .in("tag_id", tagsToRemove);
      }

      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-tags-assignments", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-recent-history", ticket.id] });
      setIsEditing(false);
      toast({ title: "Chamado atualizado" });
      onUpdate?.();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar chamado", variant: "destructive" });
    },
  });

  const handleSave = async () => {
    // Build structured field changes for audit trail (FALHA-04)
    type FieldChange = { field: string; label: string; old: string; new: string };
    const fieldChanges: FieldChange[] = [];

    if (formData.title !== ticket.title) {
      fieldChanges.push({ field: "title", label: "Título", old: ticket.title, new: formData.title });
    }
    if (formData.description !== (ticket.description || "")) {
      fieldChanges.push({
        field: "description",
        label: "Descrição",
        old: (ticket.description || "").substring(0, 80),
        new: formData.description.substring(0, 80),
      });
    }
    if (formData.priority !== ticket.priority) {
      fieldChanges.push({
        field: "priority",
        label: "Prioridade",
        old: priorityLabels[ticket.priority],
        new: priorityLabels[formData.priority],
      });
    }
    if (formData.category_id !== (ticket.category_id || "")) {
      const oldCat = categories.find((c) => c.id === (ticket.category_id || ""))?.name || ticket.category_id || "-";
      const newCat = categories.find((c) => c.id === formData.category_id)?.name || formData.category_id || "-";
      fieldChanges.push({ field: "category_id", label: "Categoria", old: oldCat, new: newCat });
    }
    if (formData.assigned_to !== (ticket.assigned_to || "")) {
      const oldTech = technicians.find((t) => t.user_id === (ticket.assigned_to || ""))?.full_name || "-";
      const newTech = technicians.find((t) => t.user_id === formData.assigned_to)?.full_name || "-";
      fieldChanges.push({ field: "assigned_to", label: "Técnico", old: oldTech, new: newTech });
    }
    if (formData.asset_id !== (ticket.asset_id || "")) {
      const oldAsset = assets.find((a) => a.id === (ticket.asset_id || ""))?.name || "-";
      const newAsset = assets.find((a) => a.id === formData.asset_id)?.name || "-";
      fieldChanges.push({ field: "asset_id", label: "Ativo", old: oldAsset, new: newAsset });
    }

    if (fieldChanges.length > 0) {
      const summary = fieldChanges.map((c) => `${c.label}: "${c.old}" → "${c.new}"`).join("; ");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: historyError } = await (supabase.from("ticket_history") as any).insert({
        ticket_id: ticket.id,
        user_id: user?.id,
        old_status: null,
        new_status: null,
        comment: `Edição: ${fieldChanges.map((c) => c.label).join(", ")}`,
        field_changes: fieldChanges,
      });
      if (historyError) {
        logger.warn("Failed to insert edit history", "Tickets", { error: historyError.message });
      }
    }

    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    setFormData({
      title: ticket.title,
      description: ticket.description || "",
      status: ticket.status,
      priority: ticket.priority,
      category_id: ticket.category_id || "",
      subcategory_id: ticket.subcategory_id || "",
      assigned_to: ticket.assigned_to || "",
      asset_id: ticket.asset_id || "",
    });
    setSelectedTagIds(ticketTags.map((t) => t.tag_id));
    setIsEditing(false);
  };

  // Valid status transitions - prevents invalid state changes
  const validTransitions: Record<string, string[]> = {
    open: ["in_progress", "waiting", "paused", "waiting_third_party", "no_contact", "closed"],
    in_progress: ["waiting", "paused", "waiting_third_party", "no_contact", "resolved", "closed"],
    waiting: ["in_progress", "paused", "waiting_third_party", "no_contact", "resolved", "closed"],
    paused: ["in_progress", "waiting", "waiting_third_party", "no_contact"],
    waiting_third_party: ["in_progress", "waiting", "paused", "no_contact"],
    no_contact: ["in_progress", "waiting", "paused", "waiting_third_party", "closed"],
    resolved: ["closed", "in_progress"],
    closed: ["in_progress"],
  };

  const handleStatusChange = async (newStatus: string) => {
    const oldStatus = formData.status;
    const allowed = validTransitions[oldStatus] || [];
    if (!allowed.includes(newStatus)) {
      toast({
        title: "Transição inválida",
        description: `Não é possível mudar de "${statusLabels[oldStatus]}" para "${statusLabels[newStatus as Enums<"ticket_status">]}"`,
        variant: "destructive",
      });
      return;
    }
    setFormData((prev) => ({ ...prev, status: newStatus as Enums<"ticket_status"> }));
    if (!isEditing) {
      const nowIso = new Date().toISOString();
      const typedNew = newStatus as Enums<"ticket_status">;
      const pauseStatuses: Enums<"ticket_status">[] = ["paused", "waiting_third_party", "no_contact"];
      const closedStatuses: Enums<"ticket_status">[] = ["resolved", "closed"];

      try {
        // --- Session / Pause management ---

        // Transitioning TO in_progress: open new session, close active pause
        if (typedNew === "in_progress") {
          // Close any active pause
          const { error: pauseErr } = await supabase
            .from("ticket_pauses")
            .update({ resumed_at: nowIso })
            .eq("ticket_id", ticket.id)
            .is("resumed_at", null);
          if (pauseErr) throw pauseErr;

          // Open new attendance session
          const { error: sessErr } = await supabase
            .from("ticket_attendance_sessions")
            .insert({ ticket_id: ticket.id, started_by: user!.id, started_at: nowIso });
          if (sessErr) throw sessErr;

          // Set started_at / first_response_at on first start
          const ticketUpdates: Record<string, unknown> = { status: typedNew };
          if (!ticket.started_at) {
            ticketUpdates.started_at = nowIso;
            ticketUpdates.first_response_at = nowIso;
          }
          const { error: tErr } = await supabase.from("tickets").update(ticketUpdates).eq("id", ticket.id);
          if (tErr) throw tErr;
        }
        // Transitioning TO a pause status: close active session, create pause record
        else if (pauseStatuses.includes(typedNew)) {
          // Close active session
          await supabase
            .from("ticket_attendance_sessions")
            .update({ ended_at: nowIso })
            .eq("ticket_id", ticket.id)
            .is("ended_at", null);

          // Create pause record
          await supabase
            .from("ticket_pauses")
            .insert({
              ticket_id: ticket.id,
              paused_at: nowIso,
              reason: `Status alterado para ${statusLabels[typedNew]}`,
            });

          const { error: tErr } = await supabase.from("tickets").update({ status: typedNew }).eq("id", ticket.id);
          if (tErr) throw tErr;
        }
        // Transitioning TO resolved/closed: close active session, set resolved_at
        else if (closedStatuses.includes(typedNew)) {
          await supabase
            .from("ticket_attendance_sessions")
            .update({ ended_at: nowIso })
            .eq("ticket_id", ticket.id)
            .is("ended_at", null);

          // Close any active pause too
          await supabase
            .from("ticket_pauses")
            .update({ resumed_at: nowIso })
            .eq("ticket_id", ticket.id)
            .is("resumed_at", null);

          const ticketUpdates: Record<string, unknown> = { status: typedNew };
          if (typedNew === "resolved" && !ticket.resolved_at) {
            ticketUpdates.resolved_at = nowIso;
          }
          const { error: tErr } = await supabase.from("tickets").update(ticketUpdates).eq("id", ticket.id);
          if (tErr) throw tErr;
        }
        // Other transitions (waiting, etc): just update status
        else {
          const { error: tErr } = await supabase.from("tickets").update({ status: typedNew }).eq("id", ticket.id);
          if (tErr) throw tErr;
        }

        // Register history
        await supabase.from("ticket_history").insert({
          ticket_id: ticket.id,
          user_id: user?.id,
          old_status: oldStatus,
          new_status: typedNew,
          comment: "Status alterado",
        });

        // Invalidate all related queries
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["ticket-attendance-sessions", ticket.id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-attendance-pauses", ticket.id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-recent-history", ticket.id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-history", ticket.id] });
        onUpdate?.();

        // Send notification
        supabase.functions.invoke("send-ticket-notification", {
          body: { ticket_id: ticket.id, event_type: "updated" },
        }).catch((err) => logger.error("Failed to send notification", "Tickets", { error: String(err) }));

      } catch (err) {
        logger.error("[handleStatusChange] Failed", "Tickets", { error: String(err) });
        toast({ title: "Erro ao alterar status", variant: "destructive" });
        // Revert local state
        setFormData((prev) => ({ ...prev, status: oldStatus }));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Requester Contact Card */}
      <RequesterContactCard contact={ticket.requester_contact || null} contactPhone={(ticket as Record<string, unknown>).contact_phone as string | null} />
      {/* Edit Toggle */}
      <div className="flex justify-end">
        {isEditing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
        )}
      </div>

      {/* Info Grid (Read-only) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            Cliente
          </p>
          <p className="font-medium">{ticket.clients?.name || "-"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Tag className="h-3 w-3" />
            Categoria
          </p>
          {isEditing ? (
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData((prev) => ({ 
                ...prev, 
                category_id: value,
                subcategory_id: "" // Reset subcategory when category changes
              }))}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div>
              <p className="font-medium">{ticket.ticket_categories?.name || "-"}</p>
              {ticket.ticket_subcategories?.name && (
                <p className="text-xs text-muted-foreground">→ {ticket.ticket_subcategories.name}</p>
              )}
            </div>
          )}
        </div>
        {/* Subcategory - only show in edit mode */}
        {isEditing && subcategories.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Subcategoria</p>
            <Select
              value={formData.subcategory_id}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, subcategory_id: value }))}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {subcategories.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Criado em
          </p>
          <p className="font-medium">
            {format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", {
              locale: ptBR,
            })}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Prioridade</p>
          {isEditing ? (
            <Select
              value={formData.priority}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, priority: value as Enums<"ticket_priority"> }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{priorityLabels[ticket.priority]}</Badge>
          )}
        </div>
      </div>

      {/* Title */}
      {isEditing && (
        <div className="space-y-2">
          <Label>Título</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          />
        </div>
      )}

      {/* Description */}
      <div className="space-y-2">
        <Label>Descrição</Label>
        {isEditing ? (
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={4}
          />
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 p-4 rounded-lg">
            {ticket.description || "Sem descrição"}
          </p>
        )}
      </div>

      {/* Solução Aplicada (apenas quando resolvido/fechado) */}
      {(ticket.status === "resolved" || ticket.status === "closed") && 
        ticket.resolution_notes && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Solução Aplicada
          </Label>
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 rounded-lg">
            <p className="text-sm whitespace-pre-wrap">
              {ticket.resolution_notes}
            </p>
            {ticket.resolved_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Resolvido em {format(new Date(ticket.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Tag className="h-3 w-3" />
          Tags
        </Label>
        {isEditing ? (
          <TagsInput
            selectedTagIds={selectedTagIds}
            onChange={setSelectedTagIds}
          />
        ) : (
          <div className="flex flex-wrap gap-1 min-h-[24px]">
            {ticketTags.length === 0 ? (
              <span className="text-sm text-muted-foreground">Nenhuma tag</span>
            ) : (
              ticketTags.map((assignment) => (
                <TagBadge
                  key={assignment.tag_id}
                  name={(assignment.ticket_tags as { name: string; color: string | null } | null)?.name || ""}
                  color={(assignment.ticket_tags as { name: string; color: string | null } | null)?.color || "#6b7280"}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Assignment & Asset */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Técnico Responsável</Label>
          <Select
            value={formData.assigned_to || "__none__"}
            onValueChange={(value) => {
              const actualValue = value === "__none__" ? "" : value;
              setFormData((prev) => ({ ...prev, assigned_to: actualValue }));
              if (!isEditing) {
                updateMutation.mutate({ assigned_to: actualValue });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Não atribuído</SelectItem>
              {technicians.map((tech) => (
                <SelectItem key={tech.user_id} value={tech.user_id}>
                  {tech.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Dispositivo Atendido</Label>
          {/* Show asset_description if set (when "Outro" was selected) */}
          {ticket.asset_description && !formData.asset_id ? (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">{ticket.asset_description}</p>
              <p className="text-xs text-muted-foreground mt-1">Descrição personalizada</p>
            </div>
          ) : (
            <Select
              value={formData.asset_id || "__none__"}
              onValueChange={(value) => {
                const actualValue = value === "__none__" ? "" : value;
                setFormData((prev) => ({ ...prev, asset_id: actualValue }));
                if (!isEditing) {
                  updateMutation.mutate({ asset_id: actualValue });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar ativo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {assets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name} ({asset.asset_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-4 pt-4 border-t">
        <span className="text-sm font-medium">Status:</span>
        <Select value={formData.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Aberto</SelectItem>
            <SelectItem value="in_progress">Em Andamento</SelectItem>
            <SelectItem value="waiting">Aguardando</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="waiting_third_party">Aguardando Terceiro</SelectItem>
            <SelectItem value="no_contact">Sem Contato</SelectItem>
            <SelectItem value="resolved">Resolvido</SelectItem>
            <SelectItem value="closed">Fechado</SelectItem>
          </SelectContent>
        </Select>
        <Badge className={statusColors[formData.status]}>{statusLabels[formData.status]}</Badge>
      </div>

      {/* Ticket Links Section */}
      <TicketLinksSection ticketId={ticket.id} ticketNumber={ticket.ticket_number} />

      {/* Recent History Collapsible */}
      <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Últimas Alterações
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isHistoryOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {isHistoryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : recentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico encontrado.</p>
          ) : (
            <EntityHistoryTimeline entries={recentHistory} />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
