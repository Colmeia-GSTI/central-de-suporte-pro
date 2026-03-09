import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, MessageSquare, History, ArrowRightLeft, Pause, CheckCircle, PhoneOff,
  Clock, Building2, User, ExternalLink,
} from "lucide-react";
import { NoContactButton } from "./NoContactButton";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SLAIndicator } from "./SLAIndicator";
import { TicketDetailsTab } from "./TicketDetailsTab";
import { TicketCommentsTab } from "./TicketCommentsTab";
import { TicketHistoryTab } from "./TicketHistoryTab";
import type { Tables, Enums } from "@/integrations/supabase/types";

type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
};

interface TicketDetailsProps {
  ticket: TicketWithRelations;
  onClose: () => void;
  initialTab?: "details" | "comments" | "history";
  onTransfer?: () => void;
  onPause?: () => void;
  onResolve?: () => void;
}

const statusLabels: Record<Enums<"ticket_status">, string> = {
  open: "Aberto", in_progress: "Em Andamento", waiting: "Aguardando",
  paused: "Pausado", waiting_third_party: "Aguardando Terceiro",
  no_contact: "Sem Contato", resolved: "Resolvido", closed: "Fechado",
};

const statusColors: Record<Enums<"ticket_status">, string> = {
  open: "bg-status-open text-white", in_progress: "bg-status-progress text-white",
  waiting: "bg-status-waiting text-white", paused: "bg-amber-500 text-white",
  waiting_third_party: "bg-purple-500 text-white", no_contact: "bg-orange-500 text-white",
  resolved: "bg-status-success text-white", closed: "bg-muted text-muted-foreground",
};

const canPauseStatuses: Enums<"ticket_status">[] = ["open", "in_progress", "waiting"];
const canResolveStatuses: Enums<"ticket_status">[] = [
  "open", "in_progress", "waiting", "paused", "waiting_third_party", "no_contact"
];

export function TicketDetails({ ticket, onClose, initialTab, onTransfer, onPause, onResolve }: TicketDetailsProps) {
  const [activeTab, setActiveTab] = useState(initialTab || "details");
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const handleUpdate = () => queryClient.invalidateQueries({ queryKey: ["tickets"] });

  const canEditTicket = can("tickets", "edit");
  const canManageTicket = can("tickets", "manage");
  const canPause = canEditTicket && canPauseStatuses.includes(ticket.status);
  const canResolve = canEditTicket && canResolveStatuses.includes(ticket.status);

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground font-mono">#{ticket.ticket_number}</span>
              <Badge className={statusColors[ticket.status]}>
                {statusLabels[ticket.status]}
              </Badge>
            </div>
            <h2 className="text-lg font-semibold leading-snug">{ticket.title}</h2>
          </div>
        </div>

        {/* Quick Info Row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ticket.clients?.name && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {ticket.clients.name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
          </span>
          <SLAIndicator
            ticket={{
              id: ticket.id, created_at: ticket.created_at,
              first_response_at: ticket.first_response_at,
              resolved_at: ticket.resolved_at, priority: ticket.priority,
              client_id: ticket.client_id, category_id: ticket.category_id,
            }}
            compact
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {canResolve && onResolve && (
            <Button size="sm" onClick={onResolve} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white h-8 text-xs">
              <CheckCircle className="h-3.5 w-3.5" />
              Finalizar
            </Button>
          )}
          {canPause && onPause && (
            <Button variant="outline" size="sm" onClick={onPause} className="gap-1.5 h-8 text-xs">
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
          )}
          {canEditTicket && (
            <NoContactButton ticketId={ticket.id} ticketNumber={ticket.ticket_number} currentStatus={ticket.status} />
          )}
          {canManageTicket && onTransfer && (
            <Button variant="outline" size="sm" onClick={onTransfer} className="gap-1.5 h-8 text-xs">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transferir
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Detalhes</span>
            <span className="sm:hidden">Info</span>
          </TabsTrigger>
          <TabsTrigger value="comments" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Comentários</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Histórico</span>
            <span className="sm:hidden">Log</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <TicketDetailsTab ticket={ticket} onUpdate={handleUpdate} />
        </TabsContent>
        <TabsContent value="comments" className="mt-4">
          <TicketCommentsTab ticketId={ticket.id} ticketCreatedBy={ticket.created_by} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <TicketHistoryTab ticketId={ticket.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
