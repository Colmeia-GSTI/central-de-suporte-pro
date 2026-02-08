import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Ticket,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trophy,
  Server,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TVDashboardPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = ["metrics", "tickets", "ranking", "monitoring"];

  // Auto-rotate slides
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 15000); // 15 seconds per slide
    return () => clearInterval(interval);
  }, []);

  const { data: ticketStats } = useQuery({
    queryKey: ["tv-ticket-stats"],
    queryFn: async () => {
      const [total, open, inProgress, waiting, resolved, critical] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "resolved"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("priority", "critical"),
      ]);

      return {
        total: total.count || 0,
        open: open.count || 0,
        inProgress: inProgress.count || 0,
        waiting: waiting.count || 0,
        resolved: resolved.count || 0,
        critical: critical.count || 0,
      };
    },
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  });

  const { data: recentTickets = [] } = useQuery({
    queryKey: ["tv-recent-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, clients(name)")
        .in("status", ["open", "in_progress", "waiting"])
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  });

  const { data: ranking = [] } = useQuery({
    queryKey: ["tv-ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_technician_ranking", {
        start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        limit_count: 5,
      });
      if (error) throw error;
      return (data || []).map((r: any, index: number) => ({
        userId: `rank-${index}`,
        name: r.name || "Usuário",
        points: Number(r.points) || 0,
      }));
    },
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    staleTime: 120000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["tv-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, is_online, last_seen_at")
        .order("name")
        .limit(10);
      if (error) throw error;
      return data;
    },
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  });

  const priorityColors: Record<string, string> = {
    low: "bg-priority-low",
    medium: "bg-priority-medium",
    high: "bg-priority-high",
    critical: "bg-priority-critical",
  };

  const statusColors: Record<string, string> = {
    open: "bg-status-open",
    in_progress: "bg-status-progress",
    waiting: "bg-status-warning",
  };

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold">Central de Helpdesk</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i === currentSlide ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </Badge>
        </div>
      </div>

      {/* Metrics Slide */}
      {currentSlide === 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl">Total de Tickets</CardTitle>
              <Ticket className="h-8 w-8 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold">{ticketStats?.total || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-status-open/20 to-status-open/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl">Em Aberto</CardTitle>
              <Clock className="h-8 w-8 text-status-open" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-status-open">
                {ticketStats?.open || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-status-progress/20 to-status-progress/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl">Em Andamento</CardTitle>
              <Activity className="h-8 w-8 text-status-progress" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-status-progress">
                {ticketStats?.inProgress || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-priority-critical/20 to-priority-critical/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xl">Críticos</CardTitle>
              <AlertTriangle className="h-8 w-8 text-priority-critical" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-priority-critical">
                {ticketStats?.critical || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tickets Slide */}
      {currentSlide === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Ticket className="h-6 w-6" />
              Fila de Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {recentTickets.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                >
                  <div
                    className={`w-2 h-12 rounded-full ${priorityColors[ticket.priority]}`}
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-lg">#{ticket.ticket_number}</p>
                    <p className="text-muted-foreground truncate">{ticket.title}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={`${statusColors[ticket.status]} text-white`}>
                      {ticket.status === "open" && "Aberto"}
                      {ticket.status === "in_progress" && "Em Andamento"}
                      {ticket.status === "waiting" && "Aguardando"}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      {ticket.clients?.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ranking Slide */}
      {currentSlide === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              Ranking de Técnicos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ranking.map((tech, index) => (
                <div
                  key={tech.userId}
                  className={`flex items-center gap-4 p-6 rounded-lg border ${
                    index === 0 ? "bg-yellow-500/10 border-yellow-500/30" : ""
                  }`}
                >
                  <div className="text-4xl font-bold w-16 text-center">
                    {index + 1}º
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-semibold">{tech.name}</p>
                    <Progress value={(tech.points / 10000) * 100} className="h-3 mt-2" />
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold">{tech.points}</div>
                    <div className="text-muted-foreground">pontos</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monitoring Slide */}
      {currentSlide === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Server className="h-6 w-6" />
              Status de Monitoramento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className={`p-4 rounded-lg border ${
                    device.is_online
                      ? "bg-status-success/10 border-status-success/30"
                      : "bg-status-danger/10 border-status-danger/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full ${
                        device.is_online ? "bg-status-success" : "bg-status-danger"
                      }`}
                    />
                    <div>
                      <p className="font-semibold">{device.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {device.is_online ? "Online" : "Offline"}
                        {device.last_seen_at && !device.is_online && (
                          <> - Último check: {formatDistanceToNow(new Date(device.last_seen_at), { locale: ptBR })}</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
