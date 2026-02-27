import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Ticket, Eye, Clock, ChevronLeft, ChevronRight, Play, Tag, X, LayoutList, Kanban, ChevronDown, Users, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TicketDetails } from "@/components/tickets/TicketDetails";
import { TicketsKanbanView } from "@/components/tickets/TicketsKanbanView";
import { useSavedViews } from "@/hooks/useSavedViews";
import { TicketTransferDialog } from "@/components/tickets/TicketTransferDialog";
import { TicketPauseDialog } from "@/components/tickets/TicketPauseDialog";
import { TicketResolveDialog } from "@/components/tickets/TicketResolveDialog";
import { TicketRatingDialog } from "@/components/tickets/TicketRatingDialog";
import { AssetSelectionDialog } from "@/components/tickets/AssetSelectionDialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";

type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
  ticket_subcategories: { id: string; name: string } | null;
  ticket_tag_assignments: { ticket_tags: { id: string; name: string; color: string | null } }[];
};

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

const priorityColors: Record<Enums<"ticket_priority">, string> = {
  low: "bg-priority-low text-white",
  medium: "bg-priority-medium text-white",
  high: "bg-priority-high text-white",
  critical: "bg-priority-critical text-white",
};

const PAGE_SIZE = 20;

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [selectedTicketInitialTab, setSelectedTicketInitialTab] = useState<"details" | "comments" | "history" | undefined>(undefined);
  const [cursor, setCursor] = useState<string | null>(null); // Cursor-based pagination
  const [previousCursors, setPreviousCursors] = useState<string[]>([]); // Stack de cursors anteriores

  // State for secondary dialogs (moved out of nested Dialog to prevent portal conflicts)
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [isRatingOpen, setIsRatingOpen] = useState(false);

  // State for asset selection dialog when starting ticket
  const [isAssetDialogOpen, setIsAssetDialogOpen] = useState(false);
  const [pendingStartTicket, setPendingStartTicket] = useState<TicketWithRelations | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { views: savedViews, saveView, deleteView } = useSavedViews();

  // ── Bulk action mutations (FALHA-10) ──────────────────────────
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from("tickets")
        .update({ status: status as Enums<"ticket_status"> })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ title: `${ids.length} chamado(s) atualizado(s) para "${status}"` });
      setSelectedIds(new Set());
    },
    onError: () => toast({ title: "Erro ao atualizar status em lote", variant: "destructive" }),
  });

  const bulkPriorityMutation = useMutation({
    mutationFn: async ({ ids, priority }: { ids: string[]; priority: string }) => {
      const { error } = await supabase
        .from("tickets")
        .update({ priority: priority as Enums<"ticket_priority"> })
        .in("id", ids);
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
      const { error } = await supabase
        .from("tickets")
        .update({ assigned_to: userId })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ title: `${ids.length} chamado(s) atribuído(s)` });
      setSelectedIds(new Set());
    },
    onError: () => toast({ title: "Erro ao atribuir chamados em lote", variant: "destructive" }),
  });

  // Fetch staff members for technician filter
  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-members-filter"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["technician", "manager", "admin"]);
      if (rolesError) throw rolesError;
      const staffIds = [...new Set((rolesData || []).map((r) => r.user_id))];
      if (staffIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", staffIds)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch active clients for client filter
  const { data: clientsForFilter = [] } = useQuery({
    queryKey: ["clients-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Handle URL params for opening ticket form with pre-filled data (redirect to new page)
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      const title = searchParams.get("title") || "";
      const description = searchParams.get("description") || "";
      const client_id = searchParams.get("client_id") || "";
      const priority = searchParams.get("priority") || "";
      
      // Redirect to new ticket page with params
      const params = new URLSearchParams();
      if (title) params.set("title", title);
      if (description) params.set("description", description);
      if (client_id) params.set("client_id", client_id);
      if (priority) params.set("priority", priority);
      
      navigate(`/tickets/new${params.toString() ? `?${params.toString()}` : ""}`);
    }
  }, [searchParams, navigate]);
  
  // Debounce search to avoid too many queries
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
        .limit(PAGE_SIZE + 1); // Fetch one extra to check if there's a next page

      // Cursor-based pagination: use created_at as cursor
      if (cursor) {
        query = query.lt("created_at", cursor);
      }

      if (debouncedSearch) {
        const searchNum = parseInt(debouncedSearch);
        if (!isNaN(searchNum)) {
          query = query.or(`title.ilike.%${debouncedSearch}%,ticket_number.eq.${searchNum}`);
        } else {
          query = query.ilike("title", `%${debouncedSearch}%`);
        }
      }

      if (statusFilter === "active") {
        query = query.not("status", "in", '("resolved","closed")');
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as Enums<"ticket_status">);
      }

      if (priorityFilter !== "all") {
        query = query.eq("priority", priorityFilter as Enums<"ticket_priority">);
      }

      if (technicianFilter === "unassigned") {
        query = query.is("assigned_to", null);
      } else if (technicianFilter !== "all") {
        query = query.eq("assigned_to", technicianFilter);
      }

      if (clientFilter !== "all") {
        query = query.eq("client_id", clientFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      // Check if there's a next page
      const hasNextPage = data && data.length > PAGE_SIZE;
      const tickets = hasNextPage ? data.slice(0, PAGE_SIZE) : data || [];
      const nextCursor = hasNextPage && tickets.length > 0 
        ? tickets[tickets.length - 1].created_at 
        : null;
      
      return { 
        tickets: tickets as TicketWithRelations[], 
        total: count || 0,
        hasNextPage,
        nextCursor
      };
    },
  });
  
  const tickets = data?.tickets || [];
  const hasNextPage = data?.hasNextPage || false;
  const hasPreviousPage = previousCursors.length > 0;

  const handleViewTicket = (ticket: TicketWithRelations) => {
    setSelectedTicketInitialTab(undefined);
    setSelectedTicket(ticket);
  };

  // Mutation para iniciar atendimento com ativo obrigatório
  const startTicketMutation = useMutation({
    mutationFn: async ({ 
      ticketId, 
      assetId, 
      assetDescription 
    }: { 
      ticketId: string; 
      assetId: string | null; 
      assetDescription: string | null;
    }) => {
      const { error } = await supabase
        .from("tickets")
        .update({
          status: "in_progress" as Enums<"ticket_status">,
          assigned_to: user?.id,
          first_response_at: new Date().toISOString(),
          asset_id: assetId,
          asset_description: assetDescription,
        })
        .eq("id", ticketId);
      if (error) throw error;

      // Registrar no histórico com informação do ativo
      const assetInfo = assetId 
        ? "com ativo vinculado" 
        : assetDescription 
          ? `dispositivo: ${assetDescription}` 
          : "";
      
      const { error: historyError } = await supabase.from("ticket_history").insert([
        {
          ticket_id: ticketId,
          user_id: user?.id,
          old_status: "open",
          new_status: "in_progress",
          comment: `Atendimento iniciado${assetInfo ? ` (${assetInfo})` : ""}`,
        },
      ]);

      // Best-effort: não falha o fluxo caso o histórico não grave
      if (historyError) {
        logger.warn("Failed to insert ticket_history (start)", "Tickets", { error: historyError.message });
      }
      
      return ticketId;
    },
    onSuccess: (ticketId) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ title: "Atendimento iniciado" });
      
      // Build optimistically updated ticket to avoid showing stale data
      const ticket = tickets.find(t => t.id === ticketId);
      if (ticket) {
        const updatedTicket: TicketWithRelations = {
          ...ticket,
          status: "in_progress" as Enums<"ticket_status">,
          assigned_to: user?.id ?? null,
          first_response_at: new Date().toISOString(),
        };
        setSelectedTicketInitialTab("comments");
        setSelectedTicket(updatedTicket);
      }
      
      // Reset pending state
      setPendingStartTicket(null);
      setIsAssetDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao iniciar atendimento", variant: "destructive" });
    },
  });

  // Handle click on "Iniciar" button - opens asset selection dialog
  const handleStartTicket = (e: React.MouseEvent, ticket: TicketWithRelations) => {
    e.stopPropagation();
    setPendingStartTicket(ticket);
    setIsAssetDialogOpen(true);
  };

  // Callback from asset selection dialog
  const handleAssetConfirm = (assetId: string | null, assetDescription: string | null) => {
    if (pendingStartTicket) {
      startTicketMutation.mutate({
        ticketId: pendingStartTicket.id,
        assetId,
        assetDescription,
      });
    }
  };

  const handleNextPage = () => {
    if (data?.nextCursor) {
      setPreviousCursors([...previousCursors, cursor || ""]);
      setCursor(data.nextCursor);
    }
  };

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      const newCursors = [...previousCursors];
      const previousCursor = newCursors.pop();
      setPreviousCursors(newCursors);
      setCursor(previousCursor === "" ? null : previousCursor || null);
    }
  };

  const handleResetPagination = () => {
    setCursor(null);
    setPreviousCursors([]);
  };

  // Reset pagination when filters change
  useEffect(() => {
    handleResetPagination();
  }, [debouncedSearch, statusFilter, priorityFilter, technicianFilter, clientFilter]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chamados</h1>
            <p className="text-muted-foreground">
              Gerencie chamados de suporte
            </p>
          </div>
          <PermissionGate module="tickets" action="create">
            <Button onClick={() => navigate("/tickets/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Chamado
            </Button>
          </PermissionGate>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="all">Todos os status</SelectItem>
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

            <Select value={priorityFilter} onValueChange={(val) => setPriorityFilter(val)}>
              <SelectTrigger className="w-36">
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

            <Select value={technicianFilter} onValueChange={(val) => setTechnicianFilter(val)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os técnicos</SelectItem>
                <SelectItem value="unassigned">Sem técnico</SelectItem>
                {staffMembers.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={clientFilter} onValueChange={(val) => setClientFilter(val)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clientsForFilter.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(priorityFilter !== "all" || technicianFilter !== "all" || clientFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => {
                  setPriorityFilter("all");
                  setTechnicianFilter("all");
                  setClientFilter("all");
                }}
              >
                <X className="h-3 w-3" />
                Limpar filtros
              </Button>
            )}

            {/* Saved Views (FALHA-20) */}
            <div className="ml-auto flex items-center gap-2">
              {savedViews.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                      Vistas Salvas ({savedViews.length})
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
                        <button
                          className="text-muted-foreground hover:text-destructive ml-2"
                          onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}
                          aria-label="Excluir vista"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  const name = window.prompt("Nome para esta vista:");
                  if (!name?.trim()) return;
                  saveView(name.trim(), {
                    status: statusFilter,
                    priority: priorityFilter,
                    technician: technicianFilter,
                    client: clientFilter,
                    search,
                  });
                  toast({ title: `Vista "${name.trim()}" salva` });
                }}
              >
                Salvar Vista
              </Button>
            </div>
          </div>
        </div>

        {/* View Mode Toggle + Bulk Action Bar */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("table")}
            className="gap-1.5"
          >
            <LayoutList className="h-4 w-4" />
            Tabela
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("kanban")}
            className="gap-1.5"
          >
            <Kanban className="h-4 w-4" />
            Kanban
          </Button>

          {selectedIds.size > 0 && (
            <div className="ml-4 flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5">
              <span className="text-sm font-medium text-primary">
                {selectedIds.size} selecionado(s)
              </span>

              {/* Bulk: Change Status */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    Status
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Alterar status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {["open", "in_progress", "waiting", "resolved", "closed"].map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: s })}
                    >
                      {s === "open" ? "Aberto" : s === "in_progress" ? "Em Andamento" : s === "waiting" ? "Aguardando" : s === "resolved" ? "Resolvido" : "Fechado"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Bulk: Change Priority */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <AlertCircle className="h-3 w-3" />
                    Prioridade
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Alterar prioridade</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[["critical","Crítica"],["high","Alta"],["medium","Média"],["low","Baixa"]].map(([val, label]) => (
                    <DropdownMenuItem
                      key={val}
                      onClick={() => bulkPriorityMutation.mutate({ ids: [...selectedIds], priority: val })}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Bulk: Assign Technician */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    Atribuir
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Atribuir técnico</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => bulkAssignMutation.mutate({ ids: [...selectedIds], userId: null })}>
                    Remover atribuição
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {staffMembers.map((s) => (
                    <DropdownMenuItem
                      key={s.user_id}
                      onClick={() => bulkAssignMutation.mutate({ ids: [...selectedIds], userId: s.user_id })}
                    >
                      {s.full_name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-3 w-3 mr-1" />
                Cancelar
              </Button>
            </div>
          )}
        </div>

        {/* Kanban View (FALHA-11) */}
        {viewMode === "kanban" && (
          <TicketsKanbanView
            tickets={tickets}
            onTicketClick={handleViewTicket}
          />
        )}

        {/* Table View */}
        {viewMode !== "kanban" && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={11} className="text-center py-8">
                    <Ticket className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-muted-foreground">
                      Nenhum chamado encontrado
                    </p>
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
                            if (checked) next.add(ticket.id);
                            else next.delete(ticket.id);
                            return next;
                          });
                        }}
                        aria-label={`Selecionar chamado #${ticket.ticket_number}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      #{ticket.ticket_number}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate font-medium">
                        {ticket.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      {ticket.clients?.name || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span>{ticket.ticket_categories?.name || (
                          <span className="text-muted-foreground">-</span>
                        )}</span>
                        {ticket.ticket_subcategories?.name && (
                          <span className="text-xs text-muted-foreground">
                            → {ticket.ticket_subcategories.name}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-32">
                        {ticket.ticket_tag_assignments?.slice(0, 3).map((assignment) => (
                          <span
                            key={assignment.ticket_tags.id}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                            style={{
                              backgroundColor: `${assignment.ticket_tags.color || "#6b7280"}20`,
                              borderColor: assignment.ticket_tags.color || "#6b7280",
                              color: assignment.ticket_tags.color || "#6b7280",
                            }}
                          >
                            <span 
                              className="w-1 h-1 rounded-full" 
                              style={{ backgroundColor: assignment.ticket_tags.color || "#6b7280" }}
                            />
                            {assignment.ticket_tags.name}
                          </span>
                        ))}
                        {ticket.ticket_tag_assignments?.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{ticket.ticket_tag_assignments.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[ticket.status]}>
                        {statusLabels[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={priorityColors[ticket.priority]}>
                        {priorityLabels[ticket.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <SLAIndicator 
                        ticket={{
                          id: ticket.id,
                          created_at: ticket.created_at,
                          first_response_at: ticket.first_response_at,
                          resolved_at: ticket.resolved_at,
                          priority: ticket.priority,
                          client_id: ticket.client_id,
                          category_id: ticket.category_id,
                        }} 
                        compact 
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(ticket.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {ticket.status === "open" && !ticket.assigned_to && (
                          <Button
                            size="sm"
                            className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                            onClick={(e) => handleStartTicket(e, ticket)}
                            disabled={startTicketMutation.isPending}
                          >
                            <Play className="h-3 w-3" />
                            Iniciar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewTicket(ticket)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Cursor-based Pagination */}
          {(hasNextPage || hasPreviousPage) && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {tickets.length} chamados carregados {data?.total ? `de ${data.total} total` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage}
                >
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
        )} {/* end viewMode !== "kanban" */}

        {/* Ticket Details Dialog */}
        <Dialog open={!!selectedTicket} onOpenChange={() => { setSelectedTicket(null); setSelectedTicketInitialTab(undefined); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
          </DialogContent>
        </Dialog>

        {/* Action Dialogs - Rendered outside of the main Dialog to prevent portal conflicts */}
        {selectedTicket && (
          <>
            <TicketTransferDialog
              open={isTransferOpen}
              onOpenChange={setIsTransferOpen}
              ticketId={selectedTicket.id}
              currentAssignedTo={selectedTicket.assigned_to}
              currentDepartmentId={selectedTicket.department_id}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["tickets"] });
              }}
            />

            <TicketPauseDialog
              open={isPauseOpen}
              onOpenChange={setIsPauseOpen}
              ticketId={selectedTicket.id}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["tickets"] });
              }}
            />

            <TicketResolveDialog
              open={isResolveOpen}
              onOpenChange={setIsResolveOpen}
              ticketId={selectedTicket.id}
              ticketNumber={selectedTicket.ticket_number}
              currentStatus={selectedTicket.status}
              categoryId={selectedTicket.category_id}
              clientId={selectedTicket.client_id}
              ticketTitle={selectedTicket.title}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["tickets"] });
                setIsResolveOpen(false);
                setIsRatingOpen(true);
              }}
            />

            <TicketRatingDialog
              open={isRatingOpen}
              onOpenChange={setIsRatingOpen}
              ticketId={selectedTicket.id}
              ticketNumber={selectedTicket.ticket_number}
              ticketTitle={selectedTicket.title}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["tickets"] });
                setSelectedTicket(null);
              }}
            />
          </>
        )}

        {/* Asset Selection Dialog for starting tickets */}
        <AssetSelectionDialog
          open={isAssetDialogOpen}
          onOpenChange={(open) => {
            setIsAssetDialogOpen(open);
            if (!open) setPendingStartTicket(null);
          }}
          clientId={pendingStartTicket?.client_id || null}
          ticketNumber={pendingStartTicket?.ticket_number || 0}
          onConfirm={handleAssetConfirm}
          isPending={startTicketMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}