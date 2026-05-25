import type { Enums } from "@/integrations/supabase/types";

export type TicketStatus = Enums<"ticket_status">;
export type TicketPriority = Enums<"ticket_priority">;

export const statusLabels: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  paused: "Pausado",
  waiting_third_party: "Aguardando Terceiro",
  no_contact: "Sem Contato",
  resolved: "Resolvido",
  closed: "Fechado",
};

/** Versão curta para tabelas densas. */
export const statusLabelsShort: Record<TicketStatus, string> = {
  ...statusLabels,
  waiting_third_party: "Ag. Terceiro",
};

export const statusColors: Record<TicketStatus, string> = {
  open: "bg-status-open text-white",
  in_progress: "bg-status-progress text-white",
  waiting: "bg-status-waiting text-white",
  paused: "bg-amber-500 text-white",
  waiting_third_party: "bg-purple-500 text-white",
  no_contact: "bg-orange-500 text-white",
  resolved: "bg-status-success text-white",
  closed: "bg-muted text-muted-foreground",
};

export const priorityLabels: Record<TicketPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export const priorityColors: Record<TicketPriority, string> = {
  low: "bg-priority-low text-white",
  medium: "bg-priority-medium text-white",
  high: "bg-priority-high text-white",
  critical: "bg-priority-critical text-white",
};

/**
 * Transições de status válidas. Fonte única usada por TicketDetailsTab,
 * Kanban e ações em lote para impedir mudanças de estado inválidas.
 */
export const validTransitions: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "waiting", "paused", "waiting_third_party", "no_contact", "closed"],
  in_progress: ["waiting", "paused", "waiting_third_party", "no_contact", "resolved", "closed"],
  waiting: ["in_progress", "paused", "waiting_third_party", "no_contact", "resolved", "closed"],
  paused: ["in_progress", "waiting", "waiting_third_party", "no_contact"],
  waiting_third_party: ["in_progress", "waiting", "paused", "no_contact"],
  no_contact: ["in_progress", "waiting", "paused", "waiting_third_party", "closed"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return (validTransitions[from] || []).includes(to);
}
