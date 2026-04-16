import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";
import { Building2, Clock, Play, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { TicketTypeBadge } from "@/components/tickets/TicketTypeBadge";

type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
  ticket_subcategories: { id: string; name: string } | null;
  ticket_tag_assignments: { ticket_tags: { id: string; name: string; color: string | null } }[];
};

interface TicketMobileCardProps {
  ticket: TicketWithRelations;
  onView: (ticket: TicketWithRelations) => void;
  onStart?: (e: React.MouseEvent, ticket: TicketWithRelations) => void;
  isStartPending?: boolean;
}

const statusLabels: Record<Enums<"ticket_status">, string> = {
  open: "Aberto", in_progress: "Andamento", waiting: "Aguardando",
  paused: "Pausado", waiting_third_party: "Ag. Terceiro",
  no_contact: "S/ Contato", resolved: "Resolvido", closed: "Fechado",
};

const statusColors: Record<Enums<"ticket_status">, string> = {
  open: "bg-status-open text-white", in_progress: "bg-status-progress text-white",
  waiting: "bg-status-waiting text-white", paused: "bg-amber-500 text-white",
  waiting_third_party: "bg-purple-500 text-white", no_contact: "bg-orange-500 text-white",
  resolved: "bg-status-success text-white", closed: "bg-muted text-muted-foreground",
};

const priorityDot: Record<Enums<"ticket_priority">, string> = {
  low: "bg-success", medium: "bg-primary", high: "bg-orange-500", critical: "bg-destructive",
};

export function TicketMobileCard({ ticket, onView, onStart, isStartPending }: TicketMobileCardProps) {
  const canStart = ticket.status === "open" && !ticket.assigned_to;

  return (
    <div
      className="bg-card border border-border/50 rounded-lg p-3 space-y-2 active:scale-[0.98] transition-transform cursor-pointer"
      onClick={() => onView(ticket)}
    >
      {/* Row 1: number + priority dot + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">#{ticket.ticket_number}</span>
          <TicketTypeBadge isInternal={ticket.is_internal} origin={ticket.origin} />
          <span className={`w-2 h-2 rounded-full ${priorityDot[ticket.priority]}`} />
        </div>
        <Badge className={`text-[9px] px-1.5 py-0 h-4 ${statusColors[ticket.status]}`}>
          {statusLabels[ticket.status]}
        </Badge>
      </div>

      {/* Title */}
      <h3 className="font-medium text-sm leading-snug line-clamp-1">{ticket.title}</h3>

      {/* Client + time */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2 truncate">
          {ticket.clients?.name && (
            <span className="flex items-center gap-1 truncate">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              {ticket.clients.name}
            </span>
          )}
        </div>
        <span className="flex items-center gap-0.5 flex-shrink-0">
          <Clock className="h-2.5 w-2.5" />
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>

      {/* Bottom: SLA + actions */}
      <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
        <SLAIndicator
          ticket={{
            id: ticket.id, created_at: ticket.created_at,
            first_response_at: ticket.first_response_at,
            resolved_at: ticket.resolved_at, priority: ticket.priority,
            client_id: ticket.client_id, category_id: ticket.category_id,
          }}
          compact
        />
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canStart && onStart && (
            <Button
              size="sm"
              className="gap-1 h-6 text-[10px] bg-success hover:bg-success/90 text-success-foreground px-2"
              onClick={(e) => onStart(e, ticket)}
              disabled={isStartPending}
            >
              <Play className="h-3 w-3" />
              Iniciar
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onView(ticket)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
