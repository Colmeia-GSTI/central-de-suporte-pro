import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Users, AlertCircle, Building2, Tag } from "lucide-react";
import { motion } from "framer-motion";
import { useTechnicianList } from "@/hooks/useTechnicianList";

interface TicketFiltersProps {
  statusFilter: string;
  priorityFilter: string;
  technicianFilter: string;
  clientFilter: string;
  typeFilter: string;
  onStatusChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onTechnicianChange: (v: string) => void;
  onClientChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  clients: { id: string; name: string }[];
  onClearAll: () => void;
  onSaveView: () => void;
  activeFilterCount: number;
}

export function TicketFilters({
  statusFilter,
  priorityFilter,
  technicianFilter,
  clientFilter,
  typeFilter,
  onStatusChange,
  onPriorityChange,
  onTechnicianChange,
  onClientChange,
  onTypeChange,
  clients,
  onClearAll,
  onSaveView,
  activeFilterCount,
}: TicketFiltersProps) {
  const { data: technicians = [] } = useTechnicianList();

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="flex flex-wrap items-center gap-2 p-2.5 bg-muted/20 border border-border/50 rounded-lg"
    >
      {/* Mobile Status filter */}
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-32 h-8 text-xs sm:hidden">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Ativos</SelectItem>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="open">Aberto</SelectItem>
          <SelectItem value="in_progress">Em Andamento</SelectItem>
          <SelectItem value="waiting">Aguardando</SelectItem>
          <SelectItem value="resolved">Resolvido</SelectItem>
          <SelectItem value="closed">Fechado</SelectItem>
        </SelectContent>
      </Select>

      <Select value={priorityFilter} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <AlertCircle className="h-3 w-3 mr-1 text-muted-foreground" />
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas prioridades</SelectItem>
          <SelectItem value="critical">Crítica</SelectItem>
          <SelectItem value="high">Alta</SelectItem>
          <SelectItem value="medium">Média</SelectItem>
          <SelectItem value="low">Baixa</SelectItem>
        </SelectContent>
      </Select>

      <Select value={technicianFilter} onValueChange={onTechnicianChange}>
        <SelectTrigger className="w-40 h-8 text-xs">
          <Users className="h-3 w-3 mr-1 text-muted-foreground" />
          <SelectValue placeholder="Técnico" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos técnicos</SelectItem>
          <SelectItem value="unassigned">Sem técnico</SelectItem>
          {technicians.map((s) => (
            <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={clientFilter} onValueChange={onClientChange}>
        <SelectTrigger className="w-40 h-8 text-xs">
          <Building2 className="h-3 w-3 mr-1 text-muted-foreground" />
          <SelectValue placeholder="Cliente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos clientes</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <Tag className="h-3 w-3 mr-1 text-muted-foreground" />
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          <SelectItem value="external">Externos</SelectItem>
          <SelectItem value="internal">Internos</SelectItem>
          <SelectItem value="task">Tarefas</SelectItem>
        </SelectContent>
      </Select>

      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-7 text-xs" onClick={onClearAll}>
          <X className="h-3 w-3" />
          Limpar
        </Button>
      )}

      <div className="ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onSaveView}
        >
          Salvar Vista
        </Button>
      </div>
    </motion.div>
  );
}
