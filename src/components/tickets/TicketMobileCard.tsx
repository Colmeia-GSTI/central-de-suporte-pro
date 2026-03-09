import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";
import { Building2, Clock, Play, Eye, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables, Enums } from "@/integrations/supabase/types";

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
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  paused: "Pausado",
  waiting_third_party: "Ag. Terceiro",
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

const priorityConfig: Record<Enums<"ticket_priority">, { label: string; dotClass: string }> = {
  low: { label: "Baixa", dotClass: "bg-success" },
  medium: { label: "Média", dotClass: "bg-primary" },
  high: { label: "Alta", dotClass: "bg-orange-500" },
  critical: { label: "Crítica", dotClass: "bg-destructive" },
};

export function TicketMobileCard({ ticket, onView, onStart, isStartPending }: TicketMobileCardProps) {
  const priority = priorityConfig[ticket.priority];
  const canStart = ticket.status === "open" && !ticket.assigned_to;

  return (
    <div
      className="bg-card border rounded-xl p-4 space-y-3 active:scale-[0.98] transition-transform cursor-pointer"
      onClick={() => onView(ticket)}
    >
      {/* Top row: ticket number + status + priority dot */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">#{ticket.ticket_number}</span>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${priority.dotClass}`} />
            <span className="text-xs text-muted-foreground">{priority.label}</span>
          </div>
        </div>
        <Badge className={`text-[10px] px-2 py-0.5 ${statusColors[ticket.status]}`}>
          {statusLabels[ticket.status]}
        </Badge>
      </div>

      {/* Title */}
      <h3 className="font-medium text-sm leading-snug line-clamp-2">{ticket.title}</h3>

      {/* Client + Category */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {ticket.clients?.name && (
          <span className="flex items-center gap-1 truncate">
            <Building2 className="h-3 w-3 flex-shrink-0" />
            {ticket.clients.name}
          </span>
        )}
        {ticket.ticket_categories?.name && (
          <span className="flex items-center gap-1 truncate">
            <Tag className="h-3 w-3 flex-shrink-0" />
            {ticket.ticket_categories.name}
          </span>
        )}
      </div>

      {/* Tags */}
      {ticket.ticket_tag_assignments?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ticket.ticket_tag_assignments.slice(0, 3).map((a) => (
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
          {ticket.ticket_tag_assignments.length > 3 && (
            <span className="text-[10px] text-muted-foreground self-center">
              +{ticket.ticket_tag_assignments.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Bottom: SLA + time + actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <div className="flex items-center gap-2">
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
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canStart && onStart && (
            <Button
              size="sm"
              className="gap-1 h-7 text-xs bg-success hover:bg-success/90 text-success-foreground"
              onClick={(e) => onStart(e, ticket)}
              disabled={isStartPending}
            >
              <Play className="h-3 w-3" />
              Iniciar
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(ticket)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
