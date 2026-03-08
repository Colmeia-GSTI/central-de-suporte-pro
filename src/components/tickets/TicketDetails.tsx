import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, MessageSquare, History, ArrowRightLeft, Pause, CheckCircle, PhoneOff } from "lucide-react";
import { NoContactButton } from "./NoContactButton";
import { usePermissions } from "@/hooks/usePermissions";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { TicketDetailsTab } from "./TicketDetailsTab";
import { TicketCommentsTab } from "./TicketCommentsTab";
import { TicketHistoryTab } from "./TicketHistoryTab";
import { SLAIndicator } from "./SLAIndicator";

type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
};

interface TicketDetailsProps {
  ticket: TicketWithRelations;
  onClose: () => void;
  initialTab?: "details" | "comments" | "history";
  // Callbacks for action dialogs (handled by parent to avoid nested Dialog issues)
  onTransfer?: () => void;
  onPause?: () => void;
  onResolve?: () => void;
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

// Status that can show pause button
const canPauseStatuses: Enums<"ticket_status">[] = ["open", "in_progress", "waiting"];

// Status that can be resolved
const canResolveStatuses: Enums<"ticket_status">[] = [
  "open", "in_progress", "waiting", "paused", "waiting_third_party", "no_contact"
];

export function TicketDetails({ ticket, onClose, initialTab, onTransfer, onPause, onResolve }: TicketDetailsProps) {
  const [activeTab, setActiveTab] = useState(initialTab || "details");
  const queryClient = useQueryClient();

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
  };

  const canPause = canPauseStatuses.includes(ticket.status);
  const canResolve = canResolveStatuses.includes(ticket.status);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-mono">
              Chamado #{ticket.ticket_number}
            </p>
            <h2 className="text-xl font-semibold">{ticket.title}</h2>
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
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canResolve && onResolve && (
              <Button
                size="sm"
                onClick={onResolve}
                className="gap-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                Finalizar
              </Button>
            )}
            {canPause && onPause && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPause}
                className="gap-1"
              >
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
            )}
            <NoContactButton
              ticketId={ticket.id}
              ticketNumber={ticket.ticket_number}
              currentStatus={ticket.status}
            />
            {onTransfer && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTransfer}
                className="gap-1"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transferir
              </Button>
            )}
            <Badge className={statusColors[ticket.status]}>
              {statusLabels[ticket.status]}
            </Badge>
          </div>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Detalhes
          </TabsTrigger>
          <TabsTrigger value="comments" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Comentários
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
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
