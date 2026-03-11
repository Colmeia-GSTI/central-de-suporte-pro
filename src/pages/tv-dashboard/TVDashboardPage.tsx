import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Ticket,
  Clock,
  AlertTriangle,
  Trophy,
  Server,
  Activity,
  Timer,
  BarChart3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TVDashboardPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [clock, setClock] = useState(new Date());
  const [ticketScrollIndex, setTicketScrollIndex] = useState(0);
  const slides = ["metrics", "tickets", "ranking", "monitoring"];

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-rotate slides every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll tickets every 5s
  useEffect(() => {
    if (currentSlide !== 1) return;
    const interval = setInterval(() => {
      setTicketScrollIndex((prev) => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [currentSlide]);

  const { data: ticketStats } = useQuery({
    queryKey: ["tv-ticket-stats"],
    queryFn: async () => {
      const [total, open, inProgress, waiting, critical] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("priority", "critical"),
      ]);
      return {
        total: total.count || 0,
        open: open.count || 0,
        inProgress: inProgress.count || 0,
        waiting: waiting.count || 0,
        critical: critical.count || 0,
      };
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 30000,
  });

  // All open tickets for scrolling list
  const { data: openTickets = [] } = useQuery({
    queryKey: ["tv-open-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, ticket_number, title, priority, status, created_at, assigned_to, clients(name)")
        .in("status", ["open", "in_progress", "waiting"])
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 30000,
  });

  // Today's technician ranking
  const { data: ranking = [] } = useQuery({
    queryKey: ["tv-ranking-today"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.rpc("get_technician_ranking", {
        start_date: todayStart.toISOString(),
        limit_count: 8,
      });
      if (error) throw error;
      return (data || []).map((r: unknown, index: number) => {
        const row = r as { name: string; points: number };
        return {
          userId: `rank-${index}`,
          name: row.name || "Usuário",
          points: Number(row.points) || 0,
        };
      });
    },
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  });

  // Average response time (last 7 days)
  const { data: avgResponseTime } = useQuery({
    queryKey: ["tv-avg-response"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("tickets")
        .select("created_at, first_response_at")
        .not("first_response_at", "is", null)
        .gte("created_at", sevenDaysAgo)
        .limit(200);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const totalMinutes = data.reduce((sum, t) => {
        const diff = new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime();
        return sum + diff / 60000;
      }, 0);
      const avg = totalMinutes / data.length;
      if (avg < 60) return `${Math.round(avg)}min`;
      return `${Math.round(avg / 60)}h ${Math.round(avg % 60)}min`;
    },
    refetchInterval: 300000,
    staleTime: 120000,
  });

  // Hourly volume (today)
  const { data: hourlyVolume = [] } = useQuery({
    queryKey: ["tv-hourly-volume"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("tickets")
        .select("created_at")
        .gte("created_at", todayStart.toISOString())
        .limit(500);
      if (error) throw error;
      const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
      (data || []).forEach((t) => {
        const h = new Date(t.created_at).getHours();
        hours[h].count++;
      });
      return hours.filter((h) => h.hour >= 6 && h.hour <= 22);
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["tv-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, is_online, last_seen_at")
        .order("name")
        .limit(15);
      if (error) throw error;
      return data;
    },
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  });

  const priorityLabels: Record<string, string> = {
    low: "Baixa",
    medium: "Média",
    high: "Alta",
    critical: "Crítica",
  };

  const priorityColors: Record<string, string> = {
    low: "bg-priority-low",
    medium: "bg-priority-medium",
    high: "bg-priority-high",
    critical: "bg-priority-critical",
  };

  const statusLabels: Record<string, string> = {
    open: "Aberto",
    in_progress: "Em Andamento",
    waiting: "Aguardando",
  };

  const statusColors: Record<string, string> = {
    open: "bg-status-open",
    in_progress: "bg-status-progress",
    waiting: "bg-status-warning",
  };

  // Visible tickets with auto-scroll
  const visibleTickets = openTickets.length > 0
    ? Array.from({ length: Math.min(8, openTickets.length) }, (_, i) =>
        openTickets[(ticketScrollIndex + i) % openTickets.length]
      )
    : [];

  const maxHourly = Math.max(...hourlyVolume.map((h) => h.count), 1);
  const maxRankingPoints = ranking[0]?.points || 1;

  return (
    <div className="min-h-[100dvh] bg-background p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl lg:text-4xl font-bold font-display">Central de Helpdesk</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {slides.map((s, i) => (
              <button
                key={s}
                onClick={() => setCurrentSlide(i)}
                aria-label={`Slide ${s}`}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i === currentSlide ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2 font-mono">
            {clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </Badge>
        </div>
      </div>

      {/* Slide 1: Metrics + Avg Response + Hourly Volume */}
      {currentSlide === 0 && (
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <Card className="bg-gradient-to-br from-primary/20 to-primary/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Total</CardTitle>
                <Ticket className="h-7 w-7 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold">{ticketStats?.total || 0}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-status-open/20 to-status-open/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Abertos</CardTitle>
                <Clock className="h-7 w-7 text-status-open" />
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-status-open">{ticketStats?.open || 0}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-status-progress/20 to-status-progress/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Andamento</CardTitle>
                <Activity className="h-7 w-7 text-status-progress" />
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-status-progress">{ticketStats?.inProgress || 0}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-priority-critical/20 to-priority-critical/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Críticos</CardTitle>
                <AlertTriangle className="h-7 w-7 text-priority-critical" />
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-priority-critical">{ticketStats?.critical || 0}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/20 to-accent/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">T. Resposta</CardTitle>
                <Timer className="h-7 w-7 text-accent-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{avgResponseTime || "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">Média 7 dias</p>
              </CardContent>
            </Card>
          </div>

          {/* Hourly volume bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Volume por Hora — Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {hourlyVolume.map((h) => (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-foreground">
                      {h.count > 0 ? h.count : ""}
                    </span>
                    <div
                      className="w-full bg-primary/80 rounded-t transition-all"
                      style={{ height: `${(h.count / maxHourly) * 100}%`, minHeight: h.count > 0 ? 4 : 0 }}
                    />
                    <span className="text-[10px] text-muted-foreground">{h.hour}h</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Slide 2: Live Tickets (auto-scroll) */}
      {currentSlide === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Ticket className="h-6 w-6" />
              Fila de Chamados em Tempo Real
              <Badge variant="outline" className="ml-2">{openTickets.length} abertos</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visibleTickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xl">
                Nenhum chamado aberto 🎉
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {visibleTickets.map((ticket) => (
                  <div
                    key={`${ticket.id}-${ticketScrollIndex}`}
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card animate-in fade-in slide-in-from-bottom-2 duration-500"
                  >
                    <div className={`w-2 h-14 rounded-full ${priorityColors[ticket.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg">#{ticket.ticket_number}</p>
                        <Badge variant="outline" className="text-xs">{priorityLabels[ticket.priority]}</Badge>
                      </div>
                      <p className="text-muted-foreground truncate">{ticket.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {(ticket as Record<string, unknown>).clients
                          ? ((ticket as Record<string, unknown>).clients as { name: string }).name
                          : "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge className={`${statusColors[ticket.status]} text-white`}>
                        {statusLabels[ticket.status]}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(ticket.created_at), { locale: ptBR, addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Slide 3: Ranking do Dia */}
      {currentSlide === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Ranking de Técnicos — Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xl">
                Sem atividade registrada hoje
              </div>
            ) : (
              <div className="space-y-4">
                {ranking.map((tech, index) => (
                  <div
                    key={tech.userId}
                    className={`flex items-center gap-4 p-5 rounded-lg border transition-all ${
                      index === 0
                        ? "bg-primary/10 border-primary/30 scale-[1.02]"
                        : index === 1
                        ? "bg-muted/60"
                        : ""
                    }`}
                  >
                    <div className={`text-4xl font-bold w-16 text-center ${
                      index === 0 ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {index + 1}º
                    </div>
                    <div className="flex-1">
                      <p className="text-2xl font-semibold">{tech.name}</p>
                      <Progress
                        value={(tech.points / maxRankingPoints) * 100}
                        className="h-3 mt-2"
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-bold">{tech.points}</div>
                      <div className="text-muted-foreground">pontos</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Slide 4: Monitoring */}
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
                          <> — {formatDistanceToNow(new Date(device.last_seen_at), { locale: ptBR, addSuffix: true })}</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {devices.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground text-xl">
                  Nenhum dispositivo monitorado
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
