import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface RecentTicket {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  client?: { name: string } | null;
}

interface RecentTicketsListProps {
  tickets: RecentTicket[];
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  open: "bg-primary/20 text-primary border-primary/30",
  in_progress: "bg-warning/20 text-warning border-warning/30",
  waiting: "bg-muted text-muted-foreground border-muted",
  resolved: "bg-success/20 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-muted",
};

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  resolved: "Resolvido",
  closed: "Fechado",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/20 text-warning",
  high: "bg-orange-500/20 text-orange-500",
  critical: "bg-destructive/20 text-destructive",
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0 },
};

export function RecentTicketsList({ tickets, isLoading }: RecentTicketsListProps) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <Card className="premium-card h-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <Ticket className="h-5 w-5 text-primary" />
            </motion.div>
            Chamados Recentes
          </CardTitle>
          <Link to="/tickets">
            <Button variant="ghost" size="sm" className="text-xs gap-1 group">
              Ver todos
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full skeleton-premium" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Ticket className="h-12 w-12 mb-4 opacity-20" />
              <p>Nenhum chamado recente</p>
              <p className="text-sm">Os chamados aparecerão aqui</p>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="space-y-3"
            >
              {tickets.map((ticket) => (
                <motion.div
                  key={ticket.id}
                  variants={itemVariants}
                  whileHover={{ x: 4, backgroundColor: "hsl(var(--accent) / 0.5)" }}
                  onClick={() => navigate(`/tickets?open=${ticket.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{ticket.ticket_number}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[ticket.status]}`}
                      >
                        {statusLabels[ticket.status]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${priorityColors[ticket.priority]}`}
                      >
                        {ticket.priority}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{ticket.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{ticket.client?.name || "Sem cliente"}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(ticket.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
