import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables, Enums } from "@/integrations/supabase/types";

type TicketWithRelations = Tables<"tickets"> & {
  clients: { id: string; name: string } | null;
  ticket_categories: { id: string; name: string } | null;
};

interface TicketsKanbanViewProps {
  tickets: TicketWithRelations[];
  onTicketClick: (ticket: TicketWithRelations) => void;
}

const KANBAN_COLUMNS: { key: Enums<"ticket_status">; label: string; color: string }[] = [
  { key: "open",               label: "Aberto",              color: "border-blue-500 bg-blue-50 dark:bg-blue-950/20" },
  { key: "in_progress",        label: "Em Andamento",        color: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" },
  { key: "waiting",            label: "Aguardando",          color: "border-purple-500 bg-purple-50 dark:bg-purple-950/20" },
  { key: "paused",             label: "Pausado",             color: "border-amber-500 bg-amber-50 dark:bg-amber-950/20" },
  { key: "waiting_third_party",label: "Ag. Terceiro",        color: "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20" },
  { key: "resolved",           label: "Resolvido",           color: "border-green-500 bg-green-50 dark:bg-green-950/20" },
];

const priorityColors: Record<Enums<"ticket_priority">, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const priorityLabels: Record<Enums<"ticket_priority">, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function TicketsKanbanView({ tickets, onTicketClick }: TicketsKanbanViewProps) {
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: Enums<"ticket_status"> }) => {
      const { error } = await supabase
        .from("tickets")
        .update({ status })
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: () => toast.error("Erro ao mover chamado"),
  });

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData("ticketId", ticketId);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: Enums<"ticket_status">) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData("ticketId");
    if (!ticketId) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;
    moveMutation.mutate({ ticketId, status: targetStatus });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
      {KANBAN_COLUMNS.map((col) => {
        const colTickets = tickets.filter((t) => t.status === col.key);
        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-72 rounded-lg border-t-4 bg-muted/30 ${col.color} flex flex-col`}
            onDrop={(e) => handleDrop(e, col.key)}
            onDragOver={handleDragOver}
          >
            {/* Column Header */}
            <div className="px-3 py-2 border-b">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{col.label}</span>
                <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5 border">
                  {colTickets.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[600px]">
              {colTickets.length === 0 && (
                <div className="flex items-center justify-center h-20 text-xs text-muted-foreground border border-dashed rounded-lg">
                  Nenhum chamado
                </div>
              )}
              {colTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, ticket.id)}
                  onClick={() => onTicketClick(ticket)}
                  className="bg-background border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2 select-none"
                >
                  {/* Ticket number + priority */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground font-mono">#{ticket.ticket_number}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${priorityColors[ticket.priority]}`}>
                      {priorityLabels[ticket.priority]}
                    </Badge>
                  </div>

                  {/* Title */}
                  <p className="text-sm font-medium line-clamp-2">{ticket.title}</p>

                  {/* Client */}
                  {ticket.clients?.name && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      <span className="truncate">{ticket.clients.name}</span>
                    </div>
                  )}

                  {/* SLA + Age */}
                  <div className="flex items-center justify-between">
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
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
