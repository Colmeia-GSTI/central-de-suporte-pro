import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, Clock, AlertTriangle, CheckCircle, Pause, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  accentClass: string;
  delay: number;
  tooltip?: string;
  onClick?: () => void;
}

function StatCard({ label, value, icon, colorClass, accentClass, delay, tooltip, onClick }: StatCardProps) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-card transition-all ${colorClass} ${
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]" : ""
      }`}
    >
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${accentClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
      </div>
    </motion.div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent><p>{tooltip}</p></TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export function TicketStatsBar() {
  // Use count-only (head: true) queries instead of fetching all rows
  const { data: stats, isLoading } = useQuery({
    queryKey: ["ticket-stats-bar"],
    queryFn: async () => {
      const [openRes, progressRes, waitingRes, pausedRes, unassignedRes, resolvedRes] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", ["waiting", "waiting_third_party"]),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "paused"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).is("assigned_to", null).not("status", "in", '("resolved","closed")'),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      ]);

      return {
        open: openRes.count || 0,
        in_progress: progressRes.count || 0,
        waiting: waitingRes.count || 0,
        paused: pausedRes.count || 0,
        unassigned: unassignedRes.count || 0,
        resolved: resolvedRes.count || 0,
      };
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="Abertos"
        value={stats.open}
        icon={<Ticket className="h-5 w-5 text-status-open" />}
        colorClass="border-status-open/30"
        accentClass="bg-status-open/10"
        tooltip="Chamados aguardando triagem"
        delay={0}
      />
      <StatCard
        label="Em Andamento"
        value={stats.in_progress}
        icon={<Clock className="h-5 w-5 text-info" />}
        colorClass="border-info/30"
        accentClass="bg-info/10"
        tooltip="Chamados sendo atendidos"
        delay={0.05}
      />
      <StatCard
        label="Aguardando"
        value={stats.waiting}
        icon={<AlertTriangle className="h-5 w-5 text-warning" />}
        colorClass="border-warning/30"
        accentClass="bg-warning/10"
        tooltip="Aguardando resposta do cliente ou terceiro"
        delay={0.1}
      />
      <StatCard
        label="Pausados"
        value={stats.paused}
        icon={<Pause className="h-5 w-5 text-amber-500" />}
        colorClass="border-amber-500/30"
        accentClass="bg-amber-500/10"
        tooltip="Chamados pausados temporariamente"
        delay={0.15}
      />
      <StatCard
        label="Sem Técnico"
        value={stats.unassigned}
        icon={<Users className="h-5 w-5 text-destructive" />}
        colorClass="border-destructive/30"
        accentClass="bg-destructive/10"
        tooltip="Chamados sem técnico atribuído"
        delay={0.2}
      />
      <StatCard
        label="Resolvidos"
        value={stats.resolved}
        icon={<CheckCircle className="h-5 w-5 text-success" />}
        colorClass="border-success/30"
        accentClass="bg-success/10"
        tooltip="Chamados resolvidos aguardando fechamento"
        delay={0.25}
      />
    </div>
  );
}
