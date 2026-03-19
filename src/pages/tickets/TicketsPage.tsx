import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SlidersHorizontal, Building2, Tag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TicketDetails } from "@/components/tickets/TicketDetails";
import { TicketsKanbanView } from "@/components/tickets/TicketsKanbanView";
import { TicketStatsBar } from "@/components/tickets/TicketStatsBar";
import { TicketMobileCard } from "@/components/tickets/TicketMobileCard";
import { useSavedViews } from "@/hooks/useSavedViews";
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

  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-members-filter"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles").select("user_id").in("role", ["technician", "manager", "admin"]);
      if (rolesError) throw rolesError;
      const staffIds = [...new Set((rolesData || []).map((r) => r.user_id))];
      if (staffIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds).order("full_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

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
    queryKey: ["tickets", debouncedSearch, statusFilter, priorityFilter, technicianFilter, clientFilter, cursor],
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
      else if (statusFilter !== "all") query = query.eq("status", statusFilter as Enums<"ticket_status">);

      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as Enums<"ticket_priority">);
      if (technicianFilter === "unassigned") query = query.is("assigned_to", null);
      else if (technicianFilter !== "all") query = query.eq("assigned_to", technicianFilter);
      if (clientFilter !== "all") query = query.eq("client_id", clientFilter);

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

  useEffect(() => { handleResetPagination(); }, [debouncedSearch, statusFilter, priorityFilter, technicianFilter, clientFilter]);

  const clearAllFilters = () => {
    setPriorityFilter("all");
    setTechnicianFilter("all");
    setClientFilter("all");
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Chamados</h1>
            <p className="text-sm text-muted-foreground">
              {data?.total ? `${data.total} chamados encontrados` : "Gerencie chamados de suporte"}
            </p>
          </div>
          <PermissionGate module="tickets" action="create">
            <Button onClick={() => navigate("/tickets/new")} className="gap-2 active:scale-[0.98] transition-transform">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Chamado</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </PermissionGate>
        </motion.div>

        {/* Stats Bar */}
        <TicketStatsBar />

        {/* Search + Filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 text-base md:text-sm"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 hidden sm:flex">
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
              className="gap-1.5 relative"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {/* View toggle */}
            <div className="hidden sm:flex items-center border rounded-lg overflow-hidden">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="rounded-none gap-1 h-8"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("kanban")}
                className="rounded-none gap-1 h-8"
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

          {/* Expandable filter bar */}
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 border rounded-lg"
            >
              {/* Mobile Status filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 sm:hidden">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Aberto</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="waiting">Aguardando</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                  <SelectItem value="closed">Fechado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-40">
                  <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as prioridades</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>

              <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                <SelectTrigger className="w-44">
                  <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os técnicos</SelectItem>
                  <SelectItem value="unassigned">Sem técnico</SelectItem>
                  {staffMembers.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-44">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {clientsForFilter.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-8" onClick={clearAllFilters}>
                  <X className="h-3 w-3" />
                  Limpar
                </Button>
              )}

              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const name = window.prompt("Nome para esta vista:");
                    if (!name?.trim()) return;
                    saveView(name.trim(), { status: statusFilter, priority: priorityFilter, technician: technicianFilter, client: clientFilter, search });
                    toast({ title: `Vista "${name.trim()}" salva` });
                  }}
                >
                  Salvar Vista
                </Button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && canManageTickets && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2"
          >
            <span className="text-sm font-medium text-primary">{selectedIds.size} selecionado(s)</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">Status <ChevronDown className="h-3 w-3" /></Button>
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
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <AlertCircle className="h-3 w-3" />Prioridade <ChevronDown className="h-3 w-3" />
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
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
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

            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground ml-auto" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3 mr-1" />Cancelar
            </Button>
          </motion.div>
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
              <div className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                  ))
                ) : tickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Ticket className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold text-lg">Nenhum chamado encontrado</h3>
                    <p className="text-sm text-muted-foreground mt-1">Tente ajustar os filtros ou crie um novo chamado</p>
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
              /* Desktop Table */
              <div className="rounded-xl border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={tickets.length > 0 && selectedIds.size === tickets.length}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedIds(new Set(tickets.map((t) => t.id)));
                            else setSelectedIds(new Set());
                          }}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead className="w-20">#</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Criado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : tickets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-16">
                          <Ticket className="mx-auto h-16 w-16 text-muted-foreground/30" />
                          <h3 className="mt-4 font-semibold text-lg">Nenhum chamado encontrado</h3>
                          <p className="text-sm text-muted-foreground mt-1">Tente ajustar os filtros ou crie um novo chamado</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      tickets.map((ticket) => (
                        <TableRow
                          key={ticket.id}
                          className={`cursor-pointer hover:bg-muted/50 transition-colors ${selectedIds.has(ticket.id) ? "bg-primary/5" : ""}`}
                          onClick={() => handleViewTicket(ticket)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(ticket.id)}
                              onCheckedChange={(checked) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(ticket.id); else next.delete(ticket.id);
                                  return next;
                                });
                              }}
                              aria-label={`Selecionar chamado #${ticket.ticket_number}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">#{ticket.ticket_number}</TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate font-medium">{ticket.title}</div>
                          </TableCell>
                          <TableCell className="text-sm">{ticket.clients?.name || <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm">{ticket.ticket_categories?.name || <span className="text-muted-foreground">-</span>}</span>
                              {ticket.ticket_subcategories?.name && (
                                <span className="text-xs text-muted-foreground">→ {ticket.ticket_subcategories.name}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-32">
                              {ticket.ticket_tag_assignments?.slice(0, 3).map((a) => (
                                <span
                                  key={a.ticket_tags.id}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                                  style={{
                                    backgroundColor: `${a.ticket_tags.color || "#6b7280"}15`,
                                    borderColor: a.ticket_tags.color || "#6b7280",
                                    color: a.ticket_tags.color || "#6b7280",
                                  }}
                                >
                                  {a.ticket_tags.name}
                                </span>
                              ))}
                              {ticket.ticket_tag_assignments?.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">+{ticket.ticket_tag_assignments.length - 3}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[ticket.status]}>{statusLabels[ticket.status]}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={priorityColors[ticket.priority]}>{priorityLabels[ticket.priority]}</Badge>
                          </TableCell>
                          <TableCell>
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
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {ticket.status === "open" && !ticket.assigned_to && (
                                <Button
                                  size="sm"
                                  className="gap-1 h-7 text-xs bg-success hover:bg-success/90 text-success-foreground"
                                  onClick={(e) => handleStartTicket(e, ticket)}
                                  disabled={startTicketMutation.isPending}
                                >
                                  <Play className="h-3 w-3" />
                                  Iniciar
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => handleViewTicket(ticket)} aria-label="Ver chamado">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {(hasNextPage || hasPreviousPage) && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      {tickets.length} chamados carregados {data?.total ? `de ${data.total} total` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={!hasPreviousPage}>
                        <ChevronLeft className="h-4 w-4" />Anterior
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!hasNextPage}>
                        Próximo<ChevronRight className="h-4 w-4" />
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
                  onClose={() => setSelectedTicket(null)}
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
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] }); }}
            />
            <TicketPauseDialog
              open={isPauseOpen} onOpenChange={setIsPauseOpen}
              ticketId={selectedTicket.id}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] }); }}
            />
            <TicketResolveDialog
              open={isResolveOpen} onOpenChange={setIsResolveOpen}
              ticketId={selectedTicket.id} ticketNumber={selectedTicket.ticket_number}
              currentStatus={selectedTicket.status} categoryId={selectedTicket.category_id}
              clientId={selectedTicket.client_id} ticketTitle={selectedTicket.title}
              ticketCreatedAt={selectedTicket.created_at} ticketStartedAt={selectedTicket.started_at}
              firstResponseAt={selectedTicket.first_response_at}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] }); setIsResolveOpen(false); }}
            />
            <TicketRatingDialog
              open={isRatingOpen} onOpenChange={setIsRatingOpen}
              ticketId={selectedTicket.id} ticketNumber={selectedTicket.ticket_number}
              ticketTitle={selectedTicket.title}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); setSelectedTicket(null); }}
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
