import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, User, GripVertical, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { TicketTypeBadge } from "./TicketTypeBadge";

type TicketWithRelations = Tables<"tickets"> & {
  clients: { id: string; name: string } | null;
  ticket_categories: { id: string; name: string } | null;
};

interface TicketsKanbanViewProps {
  tickets: TicketWithRelations[];
  onTicketClick: (ticket: TicketWithRelations) => void;
}

const KANBAN_COLUMNS: { key: Enums<"ticket_status">; label: string; dotColor: string; bgColor: string }[] = [
  { key: "open", label: "Aberto", dotColor: "bg-status-open", bgColor: "bg-status-open/5 dark:bg-status-open/10" },
  { key: "in_progress", label: "Em Andamento", dotColor: "bg-info", bgColor: "bg-info/5 dark:bg-info/10" },
  { key: "waiting", label: "Aguardando", dotColor: "bg-warning", bgColor: "bg-warning/5 dark:bg-warning/10" },
  { key: "paused", label: "Pausado", dotColor: "bg-amber-500", bgColor: "bg-amber-500/5 dark:bg-amber-500/10" },
  { key: "waiting_third_party", label: "Ag. Terceiro", dotColor: "bg-purple-500", bgColor: "bg-purple-500/5 dark:bg-purple-500/10" },
  { key: "resolved", label: "Resolvido", dotColor: "bg-success", bgColor: "bg-success/5 dark:bg-success/10" },
];

const priorityConfig: Record<Enums<"ticket_priority">, { label: string; dotClass: string; bgClass: string }> = {
  low: { label: "Baixa", dotClass: "bg-success", bgClass: "bg-success/10 text-success" },
  medium: { label: "Média", dotClass: "bg-primary", bgClass: "bg-primary/10 text-primary-foreground" },
  high: { label: "Alta", dotClass: "bg-orange-500", bgClass: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  critical: { label: "Crítica", dotClass: "bg-destructive", bgClass: "bg-destructive/10 text-destructive" },
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
      queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
    },
    onError: () => toast.error("Erro ao mover chamado"),
  });

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData("ticketId", ticketId);
    e.dataTransfer.effectAllowed = "move";
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
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px] snap-x snap-mandatory md:snap-none">
      {KANBAN_COLUMNS.map((col, colIdx) => {
        const colTickets = tickets.filter((t) => t.status === col.key);
        return (
          <motion.div
            key={col.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: colIdx * 0.05 }}
            className={`flex-shrink-0 w-72 snap-start rounded-xl border ${col.bgColor} flex flex-col`}
            onDrop={(e) => handleDrop(e, col.key)}
            onDragOver={handleDragOver}
          >
            {/* Column Header */}
            <div className="px-3 py-2.5 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                  <span className="font-semibold text-sm">{col.label}</span>
                </div>
                <span className="text-xs font-medium bg-background/80 backdrop-blur-sm rounded-full px-2 py-0.5 border tabular-nums">
                  {colTickets.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[600px]">
              {colTickets.length === 0 && (
                <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border border-dashed rounded-lg bg-background/50">
                  Arraste chamados aqui
                </div>
              )}
              {colTickets.map((ticket, idx) => {
                const prio = priorityConfig[ticket.priority];
                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    draggable
                    onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, ticket.id)}
                    onClick={() => onTicketClick(ticket)}
                    className="group bg-card border rounded-xl p-3 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all space-y-2.5 select-none active:scale-[0.98]"
                  >
                    {/* Top: drag handle + number + priority */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-xs text-muted-foreground font-mono">#{ticket.ticket_number}</span>
                        <TicketTypeBadge isInternal={ticket.is_internal} origin={ticket.origin} />
                      </div>
                      <Badge className={`text-[10px] px-1.5 py-0 h-5 border-0 ${prio.bgClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${prio.dotClass} mr-1`} />
                        {prio.label}
                      </Badge>
                    </div>

                    {/* Title */}
                    <p className="text-sm font-medium line-clamp-2 leading-snug">{ticket.title}</p>

                    {/* Client */}
                    {ticket.clients?.name && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{ticket.clients.name}</span>
                      </div>
                    )}

                    {/* Bottom: SLA + age */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
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
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
