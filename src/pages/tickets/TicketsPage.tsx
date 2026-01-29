import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Ticket, Eye, Clock, ChevronLeft, ChevronRight, Play, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TicketForm } from "@/components/tickets/TicketForm";
import { TicketDetails } from "@/components/tickets/TicketDetails";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [cursor, setCursor] = useState<string | null>(null); // Cursor-based pagination
  const [previousCursors, setPreviousCursors] = useState<string[]>([]); // Stack de cursors anteriores
  const [initialFormData, setInitialFormData] = useState<{
    title?: string;
    description?: string;
    client_id?: string;
    priority?: "low" | "medium" | "high" | "critical";
  } | undefined>(undefined);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Handle URL params for opening ticket form with pre-filled data
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      const title = searchParams.get("title") || "";
      const description = searchParams.get("description") || "";
      const client_id = searchParams.get("client_id") || "";
      const priority = searchParams.get("priority") as "low" | "medium" | "high" | "critical" | null;
      
      setInitialFormData({
        title,
        description,
        client_id,
        priority: priority || "medium",
      });
      setIsFormOpen(true);
      
      // Clear the URL params after opening
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  
  // Debounce search to avoid too many queries
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["tickets", debouncedSearch, statusFilter, cursor],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(`
          *,
          clients(id, name),
          ticket_categories(id, name),
          ticket_subcategories(id, name),
          ticket_tag_assignments(ticket_tags(id, name, color))
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

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setInitialFormData(undefined);
  };

  const handleViewTicket = (ticket: TicketWithRelations) => {
    setSelectedTicket(ticket);
  };

  // Mutation para iniciar atendimento
  const startTicketMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from("tickets")
        .update({
          status: "in_progress" as Enums<"ticket_status">,
          assigned_to: user?.id,
          first_response_at: new Date().toISOString(),
        })
        .eq("id", ticketId);
      if (error) throw error;

      // Registrar no histórico
      const { error: historyError } = await supabase.from("ticket_history").insert([
        {
          ticket_id: ticketId,
          user_id: user?.id,
          old_status: "open",
          new_status: "in_progress",
          comment: "Atendimento iniciado",
        },
      ]);

      // Best-effort: não falha o fluxo caso o histórico não grave
      if (historyError) {
        console.warn("Failed to insert ticket_history (start):", historyError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ title: "Atendimento iniciado" });
    },
    onError: () => {
      toast({ title: "Erro ao iniciar atendimento", variant: "destructive" });
    },
  });

  const handleStartTicket = (e: React.MouseEvent, ticketId: string) => {
    e.stopPropagation();
    startTicketMutation.mutate(ticketId);
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
  }, [debouncedSearch, statusFilter]);

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
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <PermissionGate module="tickets" action="create">
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Chamado
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo Chamado</DialogTitle>
              </DialogHeader>
              <TicketForm onSuccess={handleCloseForm} onCancel={handleCloseForm} initialData={initialFormData} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por título ou número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
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
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
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
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
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
                  <TableCell colSpan={10} className="text-center py-8">
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
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleViewTicket(ticket)}
                  >
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
                            variant="default"
                            size="sm"
                            className="gap-1 h-7 text-xs"
                            onClick={(e) => handleStartTicket(e, ticket.id)}
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

        {/* Ticket Details Dialog */}
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedTicket && (
              <TicketDetails
                ticket={selectedTicket}
                onClose={() => setSelectedTicket(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}