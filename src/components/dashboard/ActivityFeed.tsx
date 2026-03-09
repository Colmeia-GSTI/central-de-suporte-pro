import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowRightLeft, CheckCircle, Plus, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ActivityFeedProps {
  className?: string;
}

const iconMap: Record<string, typeof Activity> = {
  status_change: ArrowRightLeft,
  created: Plus,
  resolved: CheckCircle,
};

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  resolved: "Resolvido",
  closed: "Fechado",
};

export function ActivityFeed({ className }: ActivityFeedProps) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ["dashboard-activity-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ticket_history")
        .select("id, ticket_id, old_status, new_status, comment, created_at, user_id, ticket:tickets(ticket_number, title), profile:profiles!ticket_history_user_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const getDescription = (item: NonNullable<typeof activities>[number]) => {
    const ticketNum = (item.ticket as { ticket_number?: number } | null)?.ticket_number;
    const userName = (item.profile as { full_name?: string } | null)?.full_name?.split(" ")[0] || "Sistema";
    const newLabel = statusLabels[item.new_status || ""] || item.new_status;

    if (!item.old_status && item.new_status) {
      return `${userName} criou #${ticketNum}`;
    }
    if (item.new_status === "resolved") {
      return `${userName} resolveu #${ticketNum}`;
    }
    return `#${ticketNum} → ${newLabel}`;
  };

  const getIcon = (item: NonNullable<typeof activities>[number]) => {
    if (!item.old_status) return Plus;
    if (item.new_status === "resolved") return CheckCircle;
    return ArrowRightLeft;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className={className}
    >
      <Card className="premium-card h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-info" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !activities?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Activity className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">Sem atividades recentes</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((item, i) => {
                const Icon = getIcon(item);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-2.5 py-2 border-b border-border/30 last:border-0"
                  >
                    <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center">
                      <Icon className="h-3 w-3 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{getDescription(item)}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
