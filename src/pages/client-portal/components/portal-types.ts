export interface PortalTicket {
  id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
  satisfaction_rating: number | null;
  client_id: string | null;
  requester_contact_id: string | null;
  ticket_categories: { name: string } | null;
  requester: { name: string } | null;
}

export const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  paused: "Pausado",
  waiting_third_party: "Aguardando Terceiro",
  no_contact: "Sem Contato",
  resolved: "Resolvido",
  closed: "Fechado",
};

export const statusColors: Record<string, string> = {
  open: "bg-blue-500",
  in_progress: "bg-yellow-500",
  waiting: "bg-orange-500",
  paused: "bg-purple-500",
  waiting_third_party: "bg-indigo-500",
  no_contact: "bg-red-500",
  resolved: "bg-green-500",
  closed: "bg-gray-500",
};

export const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};
