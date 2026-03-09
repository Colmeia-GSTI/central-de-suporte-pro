import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Ticket, Users, Clock, CheckCircle, AlertTriangle, TrendingUp, Timer, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AnimatedStatCard } from "@/components/dashboard/AnimatedStatCard";
import { TicketStatusChart } from "@/components/dashboard/TicketStatusChart";
import { WeeklyTrendChart } from "@/components/dashboard/WeeklyTrendChart";
import { RecentTicketsList } from "@/components/dashboard/RecentTicketsList";
import { TechnicianDashboard } from "@/components/dashboard/TechnicianDashboard";
import { FinancialDashboard } from "@/components/dashboard/FinancialDashboard";
import { SLAComplianceChart } from "@/components/dashboard/SLAComplianceChart";
import { PriorityDistributionChart } from "@/components/dashboard/PriorityDistributionChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { TechnicianMiniRanking } from "@/components/dashboard/TechnicianMiniRanking";

type Period = "today" | "7d" | "30d";

function getPeriodStart(period: Period): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (period === "7d") now.setDate(now.getDate() - 7);
  else if (period === "30d") now.setDate(now.getDate() - 30);
  return now;
}

export default function Dashboard() {
  const { profile, roles, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("today");

  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  const isClientUser = roles.includes("client") || roles.includes("client_master");
  const isStaffUser = roles.some(r => ["admin", "manager", "technician", "financial"].includes(r));

  useEffect(() => {
    if (rolesLoaded && isClientUser && !isStaffUser) {
      navigate("/portal", { replace: true });
    }
  }, [rolesLoaded, isClientUser, isStaffUser, navigate]);

  const isTechnicianOnly = roles.includes("technician") && !roles.includes("admin") && !roles.includes("manager");
  const isFinancialOnly = roles.includes("financial") && !roles.includes("admin") && !roles.includes("manager");
  const isAdmin = roles.includes("admin");
  const isAdminOrTechnician = roles.includes("admin") || roles.includes("technician");

  // Main stats query with period filter
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", period],
    queryFn: async () => {
      const startISO = periodStart.toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        openResult, inProgressResult, waitingResult,
        resolvedResult, slaViolatedResult,
        clientsResult, totalClosedResult,
      ] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .eq("status", "resolved").gte("resolved_at", startISO),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]).lt("sla_deadline", new Date().toISOString()),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", ["resolved", "closed"]),
      ]);

      const totalTickets = (openResult.count || 0) + (inProgressResult.count || 0) + (totalClosedResult.count || 0);
      const resolutionRate = totalTickets > 0
        ? Math.round(((totalClosedResult.count || 0) / totalTickets) * 100)
        : 0;

      return {
        openTickets: openResult.count || 0,
        inProgressTickets: inProgressResult.count || 0,
        waitingTickets: waitingResult.count || 0,
        resolvedPeriod: resolvedResult.count || 0,
        slaViolated: slaViolatedResult.count || 0,
        activeClients: clientsResult.count || 0,
        resolutionRate,
      };
    },
    staleTime: 1000 * 60,
  });

  // Avg response time + CSAT
  const { data: extraStats } = useQuery({
    queryKey: ["dashboard-extra-stats", period],
    queryFn: async () => {
      const startISO = periodStart.toISOString();

      // Avg first response time (minutes)
      const { data: responseData } = await supabase
        .from("tickets")
        .select("created_at, first_response_at")
        .not("first_response_at", "is", null)
        .gte("created_at", startISO)
        .limit(200);

      let avgResponseMin = 0;
      if (responseData?.length) {
        const totalMin = responseData.reduce((sum, t) => {
          const diff = new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime();
          return sum + diff / 60000;
        }, 0);
        avgResponseMin = Math.round(totalMin / responseData.length);
      }

      // CSAT from ticket ratings
      const { data: ratingData } = await supabase
        .from("ticket_ratings")
        .select("rating")
        .gte("created_at", startISO)
        .limit(200);

      let csatScore = 0;
      if (ratingData?.length) {
        const avg = ratingData.reduce((s, r) => s + r.rating, 0) / ratingData.length;
        csatScore = Math.round(avg * 20); // 1-5 → 20-100%
      }

      return { avgResponseMin, csatScore, csatCount: ratingData?.length || 0 };
    },
    enabled: isAdmin,
    staleTime: 1000 * 60 * 5,
  });

  // SLA compliance
  const { data: slaData, isLoading: isLoadingSLA } = useQuery({
    queryKey: ["dashboard-sla-compliance", period],
    queryFn: async () => {
      const startISO = periodStart.toISOString();
      const { data } = await supabase
        .from("tickets")
        .select("sla_deadline, resolved_at, status")
        .not("sla_deadline", "is", null)
        .gte("created_at", startISO)
        .limit(500);

      let met = 0;
      let violated = 0;
      (data || []).forEach((t) => {
        const deadline = new Date(t.sla_deadline!);
        if (t.resolved_at) {
          if (new Date(t.resolved_at) <= deadline) met++;
          else violated++;
        } else if (["open", "in_progress", "waiting"].includes(t.status)) {
          if (new Date() <= deadline) met++;
          else violated++;
        }
      });
      return { met, violated };
    },
    enabled: isAdminOrTechnician,
    staleTime: 1000 * 60 * 5,
  });

  // Priority distribution
  const { data: priorityData, isLoading: isLoadingPriority } = useQuery({
    queryKey: ["dashboard-priority", period],
    queryFn: async () => {
      const startISO = periodStart.toISOString();
      const { data } = await supabase
        .from("tickets")
        .select("priority")
        .in("status", ["open", "in_progress", "waiting"])
        .gte("created_at", startISO)
        .limit(500);

      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      (data || []).forEach((t) => {
        if (t.priority in counts) counts[t.priority as keyof typeof counts]++;
      });
      return counts;
    },
    enabled: isAdminOrTechnician,
    staleTime: 1000 * 60 * 5,
  });

  const { data: recentTickets, isLoading: isLoadingTickets } = useQuery({
    queryKey: ["recent-tickets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at, client:clients(name)")
        .in("status", ["open", "in_progress", "waiting"])
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    staleTime: 1000 * 120,
  });

  const { data: weeklyData, isLoading: isLoadingWeekly } = useQuery({
    queryKey: ["weekly-trend"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_weekly_ticket_trend");
      return (data || []).map((row: { day: string; tickets: number; resolved: number }) => ({
        day: row.day,
        tickets: Number(row.tickets) || 0,
        resolved: Number(row.resolved) || 0,
      }));
    },
    enabled: isAdminOrTechnician,
    staleTime: 1000 * 60 * 5,
  });

  // Format avg response time
  const formatResponseTime = (minutes: number) => {
    if (!minutes) return "—";
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const resolvedLabel = period === "today" ? "Resolvidos Hoje" : period === "7d" ? "Resolvidos 7d" : "Resolvidos 30d";

  const allStatCards = [
    { title: "Chamados Abertos", value: stats?.openTickets ?? 0, icon: Ticket, color: "text-primary", href: "/tickets?status=open" },
    { title: "Em Andamento", value: stats?.inProgressTickets ?? 0, icon: Clock, color: "text-warning", href: "/tickets?status=in_progress" },
    { title: resolvedLabel, value: stats?.resolvedPeriod ?? 0, icon: CheckCircle, color: "text-success" },
    { title: "SLA Violado", value: stats?.slaViolated ?? 0, icon: AlertTriangle, color: "text-destructive", href: "/tickets", adminOnly: true },
    { title: "Tempo Médio Resp.", value: formatResponseTime(extraStats?.avgResponseMin || 0), icon: Timer, color: "text-info", adminOnly: true },
    { title: "CSAT", value: extraStats?.csatScore ? `${extraStats.csatScore}%` : "—", icon: Star, color: "text-primary", adminOnly: true },
  ];

  const statCards = isAdmin ? allStatCards : allStatCards.filter(c => !c.adminOnly);

  if (isTechnicianOnly) {
    return <AppLayout title="Dashboard"><TechnicianDashboard /></AppLayout>;
  }
  if (isFinancialOnly) {
    return <AppLayout title="Dashboard"><FinancialDashboard /></AppLayout>;
  }

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <DashboardHeader
          userName={profile?.full_name?.split(" ")[0] || "Usuário"}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* KPI Cards */}
        <div className={`grid grid-cols-2 md:grid-cols-3 ${isAdmin ? "xl:grid-cols-6" : ""} gap-3 sm:gap-4`}>
          {statCards.map((stat, index) => (
            <AnimatedStatCard
              key={stat.title}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              isLoading={isLoading}
              index={index}
              href={stat.href}
            />
          ))}
        </div>

        {/* SLA + Priority Row */}
        {isAdminOrTechnician && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <SLAComplianceChart
              met={slaData?.met ?? 0}
              violated={slaData?.violated ?? 0}
              isLoading={isLoadingSLA}
            />
            <PriorityDistributionChart
              data={priorityData ?? { critical: 0, high: 0, medium: 0, low: 0 }}
              isLoading={isLoadingPriority}
            />
          </div>
        )}

        {/* Charts Row */}
        {isAdminOrTechnician && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <WeeklyTrendChart data={weeklyData || []} isLoading={isLoadingWeekly} />
            <TicketStatusChart
              data={{
                open: stats?.openTickets ?? 0,
                inProgress: stats?.inProgressTickets ?? 0,
                waiting: stats?.waitingTickets ?? 0,
                resolved: stats?.resolvedPeriod ?? 0,
              }}
              isLoading={isLoading}
            />
          </div>
        )}

        {/* Bottom: Recent Tickets + Activity Feed + Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <RecentTicketsList tickets={recentTickets || []} isLoading={isLoadingTickets} />
          </div>
          <div className="space-y-4 sm:space-y-6 hidden lg:block">
            {isAdminOrTechnician && <ActivityFeed />}
            {isAdmin && <TechnicianMiniRanking startDate={periodStart} />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
