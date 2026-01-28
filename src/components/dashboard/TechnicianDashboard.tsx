import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Ticket, Clock, AlertTriangle, Bell, Calendar, ExternalLink } from "lucide-react";
import { AnimatedStatCard } from "@/components/dashboard/AnimatedStatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SLAIndicator } from "@/components/tickets/SLAIndicator";

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  medium: "bg-warning text-warning-foreground",
  low: "bg-muted text-muted-foreground",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-500 text-white",
  in_progress: "bg-warning text-warning-foreground",
  waiting: "bg-purple-500 text-white",
};

const alertLevelColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  error: "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-blue-500 text-white",
};

const eventTypeLabels: Record<string, string> = {
  meeting: "Reunião",
  visit: "Visita",
  call: "Ligação",
  maintenance: "Manutenção",
  other: "Outro",
};

export function TechnicianDashboard() {
  const { user, profile } = useAuth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Fetch tickets assigned to technician
  const { data: myTickets, isLoading: loadingTickets } = useQuery({
    queryKey: ["my-tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, ticket_number, title, status, priority, 
          sla_deadline, created_at, first_response_at, category_id,
          client:clients(id, name)
        `)
        .eq("assigned_to", user?.id)
        .in("status", ["open", "in_progress", "waiting"])
        .order("sla_deadline", { ascending: true, nullsFirst: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch active alerts
  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ["active-alerts-technician"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoring_alerts")
        .select(`
          id, level, title, message, created_at,
          device:monitored_devices(name, client:clients(name))
        `)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch today's events
  const { data: todayEvents, isLoading: loadingEvents } = useQuery({
    queryKey: ["today-events", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, start_time, end_time, event_type, location, client:clients(name)")
        .eq("user_id", user?.id)
        .gte("start_time", today.toISOString())
        .lt("start_time", tomorrow.toISOString())
        .order("start_time");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Calculate stats
  const stats = {
    totalAssigned: myTickets?.length || 0,
    inProgress: myTickets?.filter(t => t.status === "in_progress").length || 0,
    slaAtRisk: myTickets?.filter(t => 
      t.sla_deadline && new Date(t.sla_deadline) < new Date()
    ).length || 0,
    activeAlerts: alerts?.length || 0,
    todayEvents: todayEvents?.length || 0,
  };

  const isLoading = loadingTickets || loadingAlerts || loadingEvents;

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Olá, {profile?.full_name?.split(" ")[0] || "Técnico"}! 👋
          </h2>
          <p className="text-muted-foreground">
            Você tem {stats.totalAssigned} chamado{stats.totalAssigned !== 1 ? "s" : ""} atribuído{stats.totalAssigned !== 1 ? "s" : ""}
          </p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <AnimatedStatCard
          title="Meus Chamados"
          value={stats.totalAssigned}
          icon={Ticket}
          color="text-primary"
          isLoading={isLoading}
          index={0}
        />
        <AnimatedStatCard
          title="Em Andamento"
          value={stats.inProgress}
          icon={Clock}
          color="text-warning"
          isLoading={isLoading}
          index={1}
        />
        <AnimatedStatCard
          title="SLA em Risco"
          value={stats.slaAtRisk}
          icon={AlertTriangle}
          color="text-destructive"
          isLoading={isLoading}
          index={2}
        />
        <AnimatedStatCard
          title="Alertas Ativos"
          value={stats.activeAlerts}
          icon={Bell}
          color="text-orange-500"
          isLoading={isLoading}
          index={3}
        />
        <AnimatedStatCard
          title="Agenda Hoje"
          value={stats.todayEvents}
          icon={Calendar}
          color="text-primary"
          isLoading={isLoading}
          index={4}
        />
      </div>

      {/* Three Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Tickets */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Meus Chamados
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tickets">
                Ver todos
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] pr-4">
              {loadingTickets ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : myTickets?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum chamado atribuído</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myTickets?.map((ticket) => (
                    <Link
                      key={ticket.id}
                      to={`/tickets?id=${ticket.id}`}
                      className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground">
                              #{ticket.ticket_number}
                            </span>
                            <Badge className={priorityColors[ticket.priority]} variant="secondary">
                              {ticket.priority}
                            </Badge>
                            <Badge className={statusColors[ticket.status]} variant="secondary">
                              {ticket.status === "open" ? "Aberto" : 
                               ticket.status === "in_progress" ? "Em Andamento" : "Aguardando"}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium truncate">{ticket.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {ticket.client?.name}
                          </p>
                        </div>
                        <SLAIndicator ticket={ticket as any} compact />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Active Alerts */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              Alertas Pendentes
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/monitoring">
                Ver todos
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] pr-4">
              {loadingAlerts ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : alerts?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum alerta ativo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts?.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <Badge className={alertLevelColors[alert.level] || alertLevelColors.info}>
                          {alert.level}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{alert.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {alert.device?.client?.name} - {alert.device?.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(alert.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Agenda de Hoje
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/calendar">
                Ver agenda
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] pr-4">
              {loadingEvents ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : todayEvents?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum evento agendado para hoje</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayEvents?.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-primary font-mono text-sm font-semibold whitespace-nowrap">
                          {format(new Date(event.start_time), "HH:mm")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          {event.client && (
                            <p className="text-xs text-muted-foreground truncate">
                              {event.client.name}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {eventTypeLabels[event.event_type] || event.event_type}
                            </Badge>
                            {event.location && (
                              <span className="text-xs text-muted-foreground truncate">
                                📍 {event.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
