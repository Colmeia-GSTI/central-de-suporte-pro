import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowRight, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  PlayCircle,
  PauseCircle,
  XCircle,
  MessageSquare,
  Pencil,
  Plus,
  ArrowRightLeft,
  Timer
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Enums } from "@/integrations/supabase/types";

interface TicketHistoryTabProps {
  ticketId: string;
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

// Detecta o tipo de evento baseado no comentário
const getEventType = (item: { old_status: string | null; new_status: string | null; comment: string | null }) => {
  const comment = item.comment?.toLowerCase() || "";
  if (comment.includes("chamado criado")) return "created";
  if (comment.includes("chamado resolvido") || item.new_status === "resolved") return "resolved";
  if (comment.includes("comentário")) return "comment";
  if (comment.includes("edição:")) return "edit";
  if (comment.includes("transferido") || comment.includes("transferência")) return "transfer";
  if (comment.includes("pausado") || comment.includes("pausa")) return "pause";
  if (item.old_status || item.new_status) return "status";
  return "other";
};

const getEventIcon = (item: { old_status: string | null; new_status: string | null; comment: string | null }) => {
  const eventType = getEventType(item);
  
  switch (eventType) {
    case "created":
      return <Plus className="h-4 w-4 text-green-500" />;
    case "resolved":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "comment":
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case "edit":
      return <Pencil className="h-4 w-4 text-amber-500" />;
    case "transfer":
      return <ArrowRightLeft className="h-4 w-4 text-purple-500" />;
    case "pause":
      return <Timer className="h-4 w-4 text-orange-500" />;
    case "status":
      return getStatusIcon(item.new_status as Enums<"ticket_status">);
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const getStatusIcon = (status: Enums<"ticket_status"> | null | undefined) => {
  switch (status) {
    case "open":
      return <AlertTriangle className="h-4 w-4 text-status-open" />;
    case "in_progress":
      return <PlayCircle className="h-4 w-4 text-status-progress" />;
    case "waiting":
      return <PauseCircle className="h-4 w-4 text-status-waiting" />;
    case "resolved":
      return <CheckCircle className="h-4 w-4 text-status-success" />;
    case "closed":
      return <XCircle className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

type FieldChange = { field: string; label: string; old: string; new: string };

type TicketHistoryRow = {
  id: string;
  ticket_id: string;
  user_id: string | null;
  old_status: Enums<"ticket_status"> | null;
  new_status: Enums<"ticket_status"> | null;
  comment: string | null;
  field_changes?: FieldChange[] | null;
  created_at: string;
  user_full_name?: string | null;
};

const getStatusLabel = (status: Enums<"ticket_status"> | null | undefined) =>
  status ? statusLabels[status] : "—";

export function TicketHistoryTab({ ticketId }: TicketHistoryTabProps) {
  const { data: history = [], isLoading, isError } = useQuery({
    queryKey: ["ticket-history", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_history")
        .select("id, ticket_id, user_id, old_status, new_status, comment, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data || []) as TicketHistoryRow[];
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter(Boolean))
      ) as string[];

      const nameByUserId = new Map<string, string>();
      if (userIds.length) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        if (!profilesError && profilesData) {
          for (const p of profilesData as unknown as { user_id: string; full_name: string }[]) {
            nameByUserId.set(p.user_id, p.full_name);
          }
        }
      }

      return rows.map((r) => ({
        ...r,
        user_full_name: r.user_id ? nameByUserId.get(r.user_id) ?? null : null,
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Erro ao carregar histórico
      </p>
    );
  }

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhuma alteração registrada
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {history.map((item, index) => (
        <div key={item.id} className="flex gap-3">
          {/* Timeline Line */}
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              {getEventIcon(item)}
            </div>
            {index < history.length - 1 && (
              <div className="w-px flex-1 bg-border my-1" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="font-medium">
                {(item as TicketHistoryRow).user_full_name || "Sistema"}
              </span>
              {(() => {
                const eventType = getEventType(item);
                switch (eventType) {
                  case "created":
                    return <span className="text-muted-foreground">criou o chamado</span>;
                  case "resolved":
                    return <span className="text-muted-foreground">resolveu o chamado</span>;
                  case "comment":
                    return <span className="text-muted-foreground">adicionou um comentário</span>;
                  case "edit":
                    return <span className="text-muted-foreground">editou o chamado</span>;
                  case "transfer":
                    return <span className="text-muted-foreground">transferiu o chamado</span>;
                  case "pause":
                    return <span className="text-muted-foreground">pausou o chamado</span>;
                  case "status":
                    return <span className="text-muted-foreground">alterou o status</span>;
                  default:
                    return <span className="text-muted-foreground">registrou uma atualização</span>;
                }
              })()}
            </div>
            
            {/* Mostrar mudança de status (exceto resolved que tem tratamento especial) */}
            {(item.old_status || item.new_status) && getEventType(item) === "status" && (
              <div className="flex items-center gap-2 mt-1 text-sm">
                <span className="text-muted-foreground">{getStatusLabel(item.old_status)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{getStatusLabel(item.new_status)}</span>
              </div>
            )}

            {/* Destacar resolução com card verde */}
            {getEventType(item) === "resolved" && item.comment && (
              <div className="mt-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">
                  {item.comment.replace(/^Chamado resolvido(\s*\([^)]+\))?: ?/i, "")}
                </p>
              </div>
            )}

            {/* Mostrar detalhes de edição com field_changes estruturados */}
            {getEventType(item) === "edit" && (
              <div className="mt-1 space-y-1">
                {(item as TicketHistoryRow).field_changes && (item as TicketHistoryRow).field_changes!.length > 0 ? (
                  <div className="bg-muted/50 p-2 rounded space-y-1">
                    {(item as TicketHistoryRow).field_changes!.map((fc, i) => (
                      <div key={i} className="text-xs flex items-start gap-1 flex-wrap">
                        <span className="font-medium text-foreground">{fc.label}:</span>
                        <span className="text-muted-foreground line-through">{fc.old || "—"}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="text-foreground font-medium">{fc.new || "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : item.comment ? (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {item.comment.replace("Edição: ", "")}
                  </p>
                ) : null}
              </div>
            )}

            {/* Outros comentários genéricos (não edição) */}
            {item.comment && getEventType(item) !== "edit" && getEventType(item) !== "created" && getEventType(item) !== "comment" && (
              <p className="text-sm text-muted-foreground mt-1 italic">
                "{item.comment}"
              </p>
            )}

            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
