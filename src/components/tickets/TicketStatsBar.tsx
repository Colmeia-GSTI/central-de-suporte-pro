import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, Clock, AlertTriangle, CheckCircle, Pause, Users, Lock, CheckSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  dotColor: string;
  isActive?: boolean;
  onClick?: () => void;
}

function StatCard({ label, value, icon, dotColor, isActive, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all duration-150",
        "hover:bg-muted/60 active:scale-[0.97]",
        isActive
          ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30 shadow-sm"
          : "bg-card border-border/50 hover:border-border"
      )}
    >
      <div className={cn("flex items-center justify-center w-9 h-9 rounded-md shrink-0", dotColor)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={cn(
          "text-2xl font-bold tabular-nums leading-none",
          isActive ? "text-primary" : "text-foreground"
        )}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1 truncate font-medium">{label}</p>
      </div>
    </button>
  );
}

interface TicketStatsBarProps {
  onFilterChange?: (filter: string) => void;
  activeFilter?: string;
  onTypeFilterChange?: (type: string) => void;
  activeTypeFilter?: string;
}

export function TicketStatsBar({ onFilterChange, activeFilter, onTypeFilterChange, activeTypeFilter }: TicketStatsBarProps) {
  const handleClick = (filter: string) => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === filter ? "active" : filter);
  };

  const handleTypeClick = (type: string) => {
    if (!onTypeFilterChange) return;
    onTypeFilterChange(activeTypeFilter === type ? "all" : type);
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ["ticket-stats-bar"],
    queryFn: async () => {
      const [openRes, progressRes, waitingRes, pausedRes, unassignedRes, resolvedRes, internalRes, taskRes] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", ["waiting", "waiting_third_party"]),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "paused"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).is("assigned_to", null).not("status", "in", '("resolved","closed")'),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "resolved"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("is_internal", true).eq("origin", "internal").not("status", "in", '("resolved","closed")'),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("is_internal", true).eq("origin", "task").not("status", "in", '("resolved","closed")'),
      ]);

      return {
        open: openRes.count || 0,
        in_progress: progressRes.count || 0,
        waiting: waitingRes.count || 0,
        paused: pausedRes.count || 0,
        unassigned: unassignedRes.count || 0,
        resolved: resolvedRes.count || 0,
        internal: internalRes.count || 0,
        task: taskRes.count || 0,
      };
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[52px] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { key: "open", label: "Abertos", value: stats.open, icon: <Ticket className="h-4 w-4 text-status-open" />, dotColor: "bg-status-open/15" },
    { key: "in_progress", label: "Andamento", value: stats.in_progress, icon: <Clock className="h-4 w-4 text-info" />, dotColor: "bg-info/15" },
    { key: "waiting", label: "Aguardando", value: stats.waiting, icon: <AlertTriangle className="h-4 w-4 text-warning" />, dotColor: "bg-warning/15" },
    { key: "paused", label: "Pausados", value: stats.paused, icon: <Pause className="h-4 w-4 text-amber-500" />, dotColor: "bg-amber-500/15" },
    { key: "unassigned", label: "S/ Técnico", value: stats.unassigned, icon: <Users className="h-4 w-4 text-destructive" />, dotColor: "bg-destructive/15" },
    { key: "resolved", label: "Resolvidos", value: stats.resolved, icon: <CheckCircle className="h-4 w-4 text-success" />, dotColor: "bg-success/15" },
  ];

  const showTypeRow = stats.internal > 0 || stats.task > 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {cards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={card.value}
            icon={card.icon}
            dotColor={card.dotColor}
            isActive={activeFilter === card.key}
            onClick={() => handleClick(card.key)}
          />
        ))}
      </div>

      {showTypeRow && (
        <div className="flex items-center gap-2 flex-wrap">
          {stats.internal > 0 && (
            <button
              type="button"
              onClick={() => handleTypeClick("internal")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all active:scale-[0.97]",
                activeTypeFilter === "internal"
                  ? "bg-info/15 border-info/40 text-info ring-1 ring-info/30"
                  : "bg-card border-border/50 text-muted-foreground hover:bg-muted/60"
              )}
            >
              <Lock className="h-3 w-3" />
              {stats.internal} interno{stats.internal !== 1 ? "s" : ""}
            </button>
          )}
          {stats.task > 0 && (
            <button
              type="button"
              onClick={() => handleTypeClick("task")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all active:scale-[0.97]",
                activeTypeFilter === "task"
                  ? "bg-purple-500/15 border-purple-500/40 text-purple-600 ring-1 ring-purple-500/30"
                  : "bg-card border-border/50 text-muted-foreground hover:bg-muted/60"
              )}
            >
              <CheckSquare className="h-3 w-3" />
              {stats.task} tarefa{stats.task !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
