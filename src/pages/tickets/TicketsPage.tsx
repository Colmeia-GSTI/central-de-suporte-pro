import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Ticket, Eye, Clock, ChevronLeft, ChevronRight,
  Play, X, LayoutList, Kanban, ChevronDown, Users, AlertCircle,
  SlidersHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TicketDetails } from "@/components/tickets/TicketDetails";
import { TicketsKanbanView } from "@/components/tickets/TicketsKanbanView";
import { TicketStatsBar } from "@/components/tickets/TicketStatsBar";
import { TicketMobileCard } from "@/components/tickets/TicketMobileCard";
import { useSavedViews } from "@/hooks/useSavedViews";
import { useTechnicianList } from "@/hooks/useTechnicianList";
import { TicketTransferDialog } from "@/components/tickets/TicketTransferDialog";
import { TicketPauseDialog } from "@/components/tickets/TicketPauseDialog";
import { TicketResolveDialog } from "@/components/tickets/TicketResolveDialog";
import { TicketRatingDialog } from "@/components/tickets/TicketRatingDialog";
import { AssetSelectionDialog } from "@/components/tickets/AssetSelectionDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { TicketTypeBadge } from "@/components/tickets/TicketTypeBadge";

type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
  ticket_subcategories: { id: string; name: string } | null;
  ticket_tag_assignments: { ticket_tags: { id: string; name: string; color: string | null } }[];
};

const statusLabels: Record<Enums<"ticket_status">, string> = {
  open: "Aberto", in_progress: "Em Andamento", waiting: "Aguardando",
  paused: "Pausado", waiting_third_party: "Ag. Terceiro",
  no_contact: "Sem Contato", resolved: "Resolvido", closed: "Fechado",
};

const statusColors: Record<Enums<"ticket_status">, string> = {
  open: "bg-status-open text-white", in_progress: "bg-status-progress text-white",
  waiting: "bg-status-waiting text-white", paused: "bg-amber-500 text-white",
  waiting_third_party: "bg-purple-500 text-white", no_contact: "bg-orange-500 text-white",
  resolved: "bg-status-success text-white", closed: "bg-muted text-muted-foreground",
};

const priorityLabels: Record<Enums<"ticket_priority">, string> = {
  low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica",
};

const priorityColors: Record<Enums<"ticket_priority">, string> = {
  low: "bg-priority-low text-white", medium: "bg-priority-medium text-white",
  high: "bg-priority-high text-white", critical: "bg-priority-critical text-white",
};

const PAGE_SIZE = 20;

export default function TicketsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicketInitialTab, setSelectedTicketInitialTab] = useState<"details" | "comments" | "history" | undefined>(undefined);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [isAssetDialogOpen, setIsAssetDialogOpen] = useState(false);
  const [pendingStartTicket, setPendingStartTicket] = useState<TicketWithRelations | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManageTickets = can("tickets", "manage");
  const queryClient = useQueryClient();
  const { views: savedViews, saveView, deleteView } = useSavedViews();

  // Active filter count for badge
  const activeFilterCount = [
    priorityFilter !== "all",
    technicianFilter !== "all",
    clientFilter !== "all",
    typeFilter !== "all",
  ].filter(Boolean).length;

  // ── Bulk mutations ──
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase.from("tickets").update({ status: status as Enums<"ticket_status"> }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
      toast({ title: `${ids.length} chamado(s) atualizado(s) para "${statusLabels[status as Enums<"ticket_status">] || status}"` });
      setSelectedIds(new Set());
    },
    onError: () => toast({ title: "Erro ao atualizar status em lote", variant: "destructive" }),
  });

  const bulkPriorityMutation = useMutation({
    mutationFn: async ({ ids, priority }: { ids: string[]; priority: string }) => {
      const { error } = await supabase.from("tickets").update({ priority: priority as Enums<"ticket_priority"> }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ title: `Prioridade de ${ids.length} chamado(s) atualizada` });
      setSelectedIds(new Set());
    },
    onError: () => toast({ title: "Erro ao atualizar prioridade em lote", variant: "destructive" }),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, userId }: { ids: string[]; userId: string | null }) => {
      const { error } = await supabase.from("tickets").update({ assigned_to: userId }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
      toast({ title: `${ids.length} chamado(s) atribuído(s)` });
      setSelectedIds(new Set());
    },
    onError: () => toast({ title: "Erro ao atribuir chamados em lote", variant: "destructive" }),
  });

  const { data: staffMembers = [] } = useTechnicianList();

  const { data: clientsForFilter = [] } = useQuery({
    queryKey: ["clients-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      const params = new URLSearchParams();
      ["title", "description", "client_id", "priority"].forEach((k) => {
        const v = searchParams.get(k);
        if (v) params.set(k, v);
      });
      navigate(`/tickets/new${params.toString() ? `?${params}` : ""}`);
    }
  }, [searchParams, navigate]);

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["tickets", debouncedSearch, statusFilter, priorityFilter, technicianFilter, clientFilter, typeFilter, cursor],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(`
          *,
          clients(id, name),
          ticket_categories(id, name),
          ticket_subcategories(id, name),
          ticket_tag_assignments(ticket_tags(id, name, color)),
          requester_contact:client_contacts!tickets_requester_contact_id_fkey(
            id, name, email, phone, whatsapp, role
          ),
          monitored_device:monitored_devices!tickets_monitored_device_id_fkey(
            id, hostname, name, is_online
          )
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (cursor) query = query.lt("created_at", cursor);

      if (debouncedSearch) {
        const searchNum = parseInt(debouncedSearch);
        if (!isNaN(searchNum)) {
          query = query.or(`title.ilike.%${debouncedSearch}%,ticket_number.eq.${searchNum}`);
        } else {
          query = query.ilike("title", `%${debouncedSearch}%`);
        }
      }

      if (statusFilter === "active") query = query.not("status", "in", '("resolved","closed")');
      else if (statusFilter === "waiting") query = query.in("status", ["waiting", "waiting_third_party"]);
      else if (statusFilter !== "all") query = query.eq("status", statusFilter as Enums<"ticket_status">);

      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as Enums<"ticket_priority">);
      if (technicianFilter === "unassigned") query = query.is("assigned_to", null);
      else if (technicianFilter !== "all") query = query.eq("assigned_to", technicianFilter);
      if (clientFilter !== "all") query = query.eq("client_id", clientFilter);

      // Type filter
      if (typeFilter === "external") query = query.eq("is_internal", false);
      else if (typeFilter === "internal") query = query.eq("is_internal", true).eq("origin", "internal");
      else if (typeFilter === "task") query = query.eq("is_internal", true).eq("origin", "task");

      const { data, error, count } = await query;
      if (error) throw error;

      const hasNextPage = data && data.length > PAGE_SIZE;
      const tickets = hasNextPage ? data.slice(0, PAGE_SIZE) : data || [];
      const nextCursor = hasNextPage && tickets.length > 0 ? tickets[tickets.length - 1].created_at : null;

      return { tickets: tickets as TicketWithRelations[], total: count || 0, hasNextPage, nextCursor };
    },
  });

  const tickets = data?.tickets || [];
  const hasNextPage = data?.hasNextPage || false;
  const hasPreviousPage = previousCursors.length > 0;

  // Reactive ticket detail query — keeps selectedTicket fresh after mutations
  const { data: freshTicketDetail } = useQuery({
    queryKey: ["ticket-detail", selectedTicketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          *,
          clients(id, name),
          ticket_categories(id, name),
          ticket_subcategories(id, name),
          ticket_tag_assignments(ticket_tags(id, name, color))
        `)
        .eq("id", selectedTicketId!)
        .single();
      if (error) throw error;
      return data as TicketWithRelations;
    },
    enabled: !!selectedTicketId,
    staleTime: 5_000,
  });

  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    // Prefer list data (most up-to-date after invalidation), fallback to dedicated query
    return tickets.find(t => t.id === selectedTicketId) ?? freshTicketDetail ?? null;
  }, [selectedTicketId, tickets, freshTicketDetail]);

  const handleViewTicket = (ticket: TicketWithRelations) => {
    setSelectedTicketInitialTab("comments");
    setSelectedTicketId(ticket.id);
  };

  const startTicketMutation = useMutation({
    mutationFn: async ({ ticketId, assetId, assetDescription }: { ticketId: string; assetId: string | null; assetDescription: string | null }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const nowIso = new Date().toISOString();

      // 0. Close orphan open sessions (prevent duplicates)
      await supabase
        .from("ticket_attendance_sessions")
        .update({ ended_at: nowIso })
        .eq("ticket_id", ticketId)
        .is("ended_at", null);

      // 1. Create attendance session
      const { error: sessErr } = await supabase
        .from("ticket_attendance_sessions")
        .insert({ ticket_id: ticketId, started_by: user.id, started_at: nowIso });
      if (sessErr) throw sessErr;

      // 2. Update ticket status + started_at
      const { error } = await supabase
        .from("tickets")
        .update({
          status: "in_progress" as Enums<"ticket_status">,
          assigned_to: user.id,
          started_at: nowIso,
          first_response_at: nowIso,
          asset_id: assetId,
          asset_description: assetDescription,
        })
        .eq("id", ticketId);
      if (error) throw error;

      // 3. Record in history
      const assetInfo = assetId ? "com ativo vinculado" : assetDescription ? `dispositivo: ${assetDescription}` : "";
      const { error: historyError } = await supabase.from("ticket_history").insert([{
        ticket_id: ticketId, user_id: user.id, old_status: "open", new_status: "in_progress",
        comment: `Atendimento iniciado${assetInfo ? ` (${assetInfo})` : ""}`,
      }]);
      if (historyError) logger.warn("Failed to insert ticket_history (start)", "Tickets", { error: historyError.message });
      return ticketId;
    },
    onSuccess: (ticketId) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-attendance-sessions", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      toast({ title: "Atendimento iniciado" });
      setSelectedTicketInitialTab("comments");
      setSelectedTicketId(ticketId);
      setPendingStartTicket(null);
      setIsAssetDialogOpen(false);
    },
    onError: () => toast({ title: "Erro ao iniciar atendimento", variant: "destructive" }),
  });

  const handleStartTicket = (e: React.MouseEvent, ticket: TicketWithRelations) => {
    e.stopPropagation();
    setPendingStartTicket(ticket);
    setIsAssetDialogOpen(true);
  };

  const handleAssetConfirm = (assetId: string | null, assetDescription: string | null) => {
    if (pendingStartTicket) startTicketMutation.mutate({ ticketId: pendingStartTicket.id, assetId, assetDescription });
  };

  const handleNextPage = () => {
    if (data?.nextCursor) { setPreviousCursors([...previousCursors, cursor || ""]); setCursor(data.nextCursor); }
  };
  const handlePreviousPage = () => {
    if (hasPreviousPage) { const nc = [...previousCursors]; const prev = nc.pop(); setPreviousCursors(nc); setCursor(prev === "" ? null : prev || null); }
  };
  const handleResetPagination = () => { setCursor(null); setPreviousCursors([]); };

  useEffect(() => { handleResetPagination(); }, [debouncedSearch, statusFilter, priorityFilter, technicianFilter, clientFilter, typeFilter]);

  const clearAllFilters = () => {
    setPriorityFilter("all");
    setTechnicianFilter("all");
    setClientFilter("all");
    setTypeFilter("all");
  };

  return (
    <AppLayout>
      <div className="space-y-3">
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Chamados</h1>
            {data?.total !== undefined && (
              <Badge variant="secondary" className="font-mono text-xs tabular-nums">
                {data.total}
              </Badge>
            )}
          </div>
          <PermissionGate module="tickets" action="create">
            <Button size="sm" onClick={() => navigate("/tickets/new")} className="gap-1.5 h-8 active:scale-[0.98] transition-transform">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Novo Chamado</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </PermissionGate>
        </div>

        {/* Stats Bar */}
        <TicketStatsBar
          activeFilter={technicianFilter === "unassigned" ? "unassigned" : statusFilter}
          onFilterChange={(filter) => {
            handleResetPagination();
            if (filter === "unassigned") {
              setStatusFilter("active");
              setTechnicianFilter("unassigned");
            } else {
              setTechnicianFilter("all");
              setStatusFilter(filter);
            }
          }}
          activeTypeFilter={typeFilter}
          onTypeFilterChange={(type) => {
            setTypeFilter(type);
            handleResetPagination();
          }}
        />

        {/* Compact Search + Filters Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar título ou nº..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-base md:text-sm bg-card"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs hidden sm:flex">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="waiting">Aguardando</SelectItem>
              <SelectItem value="paused">Pausado</SelectItem>
              <SelectItem value="waiting_third_party">Ag. Terceiro</SelectItem>
              <SelectItem value="no_contact">Sem Contato</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
            </SelectContent>
          </Select>

          {/* More filters toggle */}
          <Button
            variant={showFilters || activeFilterCount > 0 ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5 h-8 text-xs relative"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* View toggle */}
          <div className="hidden sm:flex items-center border rounded-md overflow-hidden h-8">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="rounded-none h-8 w-8 p-0"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className="rounded-none h-8 w-8 p-0"
            >
              <Kanban className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Saved Views */}
          {savedViews.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 h-8 text-xs hidden md:flex">
                  Vistas ({savedViews.length})
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Aplicar vista</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedViews.map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    className="flex items-center justify-between"
                    onSelect={() => {
                      setStatusFilter(v.filters.status || "active");
                      setPriorityFilter(v.filters.priority || "all");
                      setTechnicianFilter(v.filters.technician || "all");
                      setClientFilter(v.filters.client || "all");
                      if (v.filters.search !== undefined) setSearch(v.filters.search);
                    }}
                  >
                    <span>{v.name}</span>
                    <button className="text-muted-foreground hover:text-destructive ml-2" onClick={(e) => { e.stopPropagation(); deleteView(v.id); }} aria-label="Excluir vista">
                      <X className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {showFilters && (
          <TicketFilters
            statusFilter={statusFilter}
            priorityFilter={priorityFilter}
            technicianFilter={technicianFilter}
            clientFilter={clientFilter}
            typeFilter={typeFilter}
            onStatusChange={setStatusFilter}
            onPriorityChange={setPriorityFilter}
            onTechnicianChange={setTechnicianFilter}
            onClientChange={setClientFilter}
            onTypeChange={setTypeFilter}
            clients={clientsForFilter}
            onClearAll={clearAllFilters}
            onSaveView={() => {
              const name = window.prompt("Nome para esta vista:");
              if (!name?.trim()) return;
              saveView(name.trim(), { status: statusFilter, priority: priorityFilter, technician: technicianFilter, client: clientFilter, search });
              toast({ title: `Vista "${name.trim()}" salva` });
            }}
            activeFilterCount={activeFilterCount}
          />
        )}

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && canManageTickets && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5">
            <span className="text-xs font-semibold text-primary">{selectedIds.size} selecionado(s)</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]">Status <ChevronDown className="h-3 w-3" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Alterar status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["open", "in_progress", "waiting", "resolved", "closed"] as const).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: s })}>
                    {statusLabels[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]">
                  <AlertCircle className="h-3 w-3" />Prior. <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Alterar prioridade</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["critical", "high", "medium", "low"] as const).map((p) => (
                  <DropdownMenuItem key={p} onClick={() => bulkPriorityMutation.mutate({ ids: [...selectedIds], priority: p })}>
                    {priorityLabels[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]">
                  <Users className="h-3 w-3" />Atribuir <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Atribuir técnico</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => bulkAssignMutation.mutate({ ids: [...selectedIds], userId: null })}>Remover atribuição</DropdownMenuItem>
                <DropdownMenuSeparator />
                {staffMembers.map((s) => (
                  <DropdownMenuItem key={s.user_id} onClick={() => bulkAssignMutation.mutate({ ids: [...selectedIds], userId: s.user_id })}>
                    {s.full_name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground ml-auto" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3 mr-1" />Cancelar
            </Button>
          </div>
        )}

        {/* Kanban View */}
        {viewMode === "kanban" && (
          <TicketsKanbanView tickets={tickets} onTicketClick={handleViewTicket} />
        )}

        {/* Table / Mobile Cards View */}
        {viewMode !== "kanban" && (
          <>
            {/* Mobile Cards */}
            {isMobile ? (
              <div className="space-y-2">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                  ))
                ) : tickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Ticket className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <h3 className="font-semibold text-base">Nenhum chamado</h3>
                    <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou crie um novo</p>
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <TicketMobileCard
                      key={ticket.id}
                      ticket={ticket}
                      onView={handleViewTicket}
                      onStart={handleStartTicket}
                      isStartPending={startTicketMutation.isPending}
                    />
                  ))
                )}
              </div>
            ) : (
              /* Desktop Table - Dense */
              <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-8 py-2">
                        <Checkbox
                          checked={tickets.length > 0 && selectedIds.size === tickets.length}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedIds(new Set(tickets.map((t) => t.id)));
                            else setSelectedIds(new Set());
                          }}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead className="w-16 py-2 text-xs font-semibold">#</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Título</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Cliente</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Categoria</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Tags</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Status</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Prior.</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">SLA</TableHead>
                      <TableHead className="py-2 text-xs font-semibold">Criado</TableHead>
                      <TableHead className="py-2 text-xs font-semibold text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-3.5" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-10" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-40" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-20" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-16" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-16" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-5 w-12" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-12" /></TableCell>
                          <TableCell className="py-1.5"><Skeleton className="h-3.5 w-20" /></TableCell>
                          <TableCell className="py-1.5 text-right"><Skeleton className="h-6 w-6 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : tickets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-12">
                          <Ticket className="mx-auto h-10 w-10 text-muted-foreground/30" />
                          <h3 className="mt-3 font-semibold text-sm">Nenhum chamado encontrado</h3>
                          <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou crie um novo</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      tickets.map((ticket) => (
                        <TableRow
                          key={ticket.id}
                          className={`cursor-pointer hover:bg-muted/40 transition-colors text-sm ${selectedIds.has(ticket.id) ? "bg-primary/5" : ""}`}
                          onClick={() => handleViewTicket(ticket)}
                        >
                          <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(ticket.id)}
                              onCheckedChange={(checked) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(ticket.id); else next.delete(ticket.id);
                                  return next;
                                });
                              }}
                              aria-label={`Selecionar #${ticket.ticket_number}`}
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-xs text-muted-foreground">#{ticket.ticket_number}</span>
                              <TicketTypeBadge isInternal={ticket.is_internal} origin={ticket.origin} />
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <span className="max-w-[220px] truncate block text-sm font-medium text-foreground">{ticket.title}</span>
                          </TableCell>
                          <TableCell className="py-1.5 text-xs text-muted-foreground">{ticket.clients?.name || "—"}</TableCell>
                          <TableCell className="py-1.5">
                            <span className="text-xs">{ticket.ticket_categories?.name || "—"}</span>
                            {ticket.ticket_subcategories?.name && (
                              <span className="text-[10px] text-muted-foreground block">→ {ticket.ticket_subcategories.name}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex flex-wrap gap-0.5 max-w-28">
                              {ticket.ticket_tag_assignments?.slice(0, 2).map((a) => (
                                <span
                                  key={a.ticket_tags.id}
                                  className="inline-flex px-1.5 py-0 rounded-full text-[9px] font-medium border"
                                  style={{
                                    backgroundColor: `${a.ticket_tags.color || "#6b7280"}15`,
                                    borderColor: a.ticket_tags.color || "#6b7280",
                                    color: a.ticket_tags.color || "#6b7280",
                                  }}
                                >
                                  {a.ticket_tags.name}
                                </span>
                              ))}
                              {ticket.ticket_tag_assignments?.length > 2 && (
                                <span className="text-[9px] text-muted-foreground">+{ticket.ticket_tag_assignments.length - 2}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 h-5 ${statusColors[ticket.status]}`}>{statusLabels[ticket.status]}</Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 h-5 ${priorityColors[ticket.priority]}`}>{priorityLabels[ticket.priority]}</Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <SLAIndicator
                              ticket={{
                                id: ticket.id, created_at: ticket.created_at,
                                first_response_at: ticket.first_response_at,
                                resolved_at: ticket.resolved_at, priority: ticket.priority,
                                client_id: ticket.client_id, category_id: ticket.category_id,
                              }}
                              compact
                            />
                          </TableCell>
                          <TableCell className="py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                          </TableCell>
                          <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              {ticket.status === "open" && !ticket.assigned_to && (
                                <Button
                                  size="sm"
                                  className="gap-1 h-6 text-[10px] bg-success hover:bg-success/90 text-success-foreground px-2"
                                  onClick={(e) => handleStartTicket(e, ticket)}
                                  disabled={startTicketMutation.isPending}
                                >
                                  <Play className="h-3 w-3" />
                                  Iniciar
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewTicket(ticket)} aria-label="Ver chamado">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Compact Pagination */}
                {(hasNextPage || hasPreviousPage) && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {tickets.length} de {data?.total || 0}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={handlePreviousPage} disabled={!hasPreviousPage}>
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={handleNextPage} disabled={!hasNextPage}>
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Ticket Details Sheet (side panel like Zendesk) */}
        <Sheet open={!!selectedTicketId} onOpenChange={() => { setSelectedTicketId(null); setSelectedTicketInitialTab(undefined); }}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
            <SheetHeader className="p-6 pb-0">
              <SheetTitle className="sr-only">Detalhes do Chamado</SheetTitle>
            </SheetHeader>
            <div className="p-6 pt-2">
              {selectedTicket && (
                <TicketDetails
                  ticket={selectedTicket}
                  onClose={() => setSelectedTicketId(null)}
                  initialTab={selectedTicketInitialTab}
                  onTransfer={() => setIsTransferOpen(true)}
                  onPause={() => setIsPauseOpen(true)}
                  onResolve={() => setIsResolveOpen(true)}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Action Dialogs */}
        {selectedTicket && (
          <>
            <TicketTransferDialog
              open={isTransferOpen} onOpenChange={setIsTransferOpen}
              ticketId={selectedTicket.id} currentAssignedTo={selectedTicket.assigned_to}
              currentDepartmentId={selectedTicket.department_id}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); queryClient.invalidateQueries({ queryKey: ["ticket-detail", selectedTicketId] }); queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] }); }}
            />
            <TicketPauseDialog
              open={isPauseOpen} onOpenChange={setIsPauseOpen}
              ticketId={selectedTicket.id}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); queryClient.invalidateQueries({ queryKey: ["ticket-detail", selectedTicketId] }); queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] }); }}
            />
            <TicketResolveDialog
              open={isResolveOpen} onOpenChange={setIsResolveOpen}
              ticketId={selectedTicket.id} ticketNumber={selectedTicket.ticket_number}
              currentStatus={selectedTicket.status} categoryId={selectedTicket.category_id}
              clientId={selectedTicket.client_id} ticketTitle={selectedTicket.title}
              ticketCreatedAt={selectedTicket.created_at} ticketStartedAt={selectedTicket.started_at}
              firstResponseAt={selectedTicket.first_response_at}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); queryClient.invalidateQueries({ queryKey: ["ticket-detail", selectedTicketId] }); queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] }); setIsResolveOpen(false); }}
            />
            <TicketRatingDialog
              open={isRatingOpen} onOpenChange={setIsRatingOpen}
              ticketId={selectedTicket.id} ticketNumber={selectedTicket.ticket_number}
              ticketTitle={selectedTicket.title}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); setSelectedTicketId(null); }}
            />
          </>
        )}

        <AssetSelectionDialog
          open={isAssetDialogOpen}
          onOpenChange={(open) => { setIsAssetDialogOpen(open); if (!open) setPendingStartTicket(null); }}
          clientId={pendingStartTicket?.client_id || null}
          ticketNumber={pendingStartTicket?.ticket_number || 0}
          onConfirm={handleAssetConfirm}
          isPending={startTicketMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}
