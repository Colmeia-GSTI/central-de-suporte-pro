import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Ticket, Users, Clock, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AnimatedStatCard } from "@/components/dashboard/AnimatedStatCard";
import { TicketStatusChart } from "@/components/dashboard/TicketStatusChart";
import { WeeklyTrendChart } from "@/components/dashboard/WeeklyTrendChart";
import { RecentTicketsList } from "@/components/dashboard/RecentTicketsList";
import { TechnicianDashboard } from "@/components/dashboard/TechnicianDashboard";

interface DashboardStats {
  openTickets: number;
  inProgressTickets: number;
  waitingTickets: number;
  resolvedToday: number;
  slaViolated: number;
  activeClients: number;
  resolutionRate: number;
}

export default function Dashboard() {
  const { profile, roles, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  // Redirect client users to the portal
  const isClientUser = roles.includes("client") || roles.includes("client_master");
  const isStaffUser = roles.some(r => ["admin", "manager", "technician", "financial"].includes(r));
  
  useEffect(() => {
    if (rolesLoaded && isClientUser && !isStaffUser) {
      navigate("/portal", { replace: true });
    }
  }, [rolesLoaded, isClientUser, isStaffUser, navigate]);

  // Check if user is technician only (no admin or manager roles)
  const isTechnicianOnly = roles.includes("technician") && 
    !roles.includes("admin") && 
    !roles.includes("manager");
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardStats> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        openResult,
        inProgressResult,
        waitingResult,
        resolvedTodayResult,
        slaViolatedResult,
        clientsResult,
        totalClosedResult,
      ] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .eq("status", "resolved")
          .gte("resolved_at", today.toISOString()),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress"])
          .lt("sla_deadline", new Date().toISOString()),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .in("status", ["resolved", "closed"]),
      ]);

      const totalTickets = (openResult.count || 0) + (inProgressResult.count || 0) + (totalClosedResult.count || 0);
      const resolutionRate = totalTickets > 0 
        ? Math.round(((totalClosedResult.count || 0) / totalTickets) * 100)
        : 0;

      return {
        openTickets: openResult.count || 0,
        inProgressTickets: inProgressResult.count || 0,
        waitingTickets: waitingResult.count || 0,
        resolvedToday: resolvedTodayResult.count || 0,
        slaViolated: slaViolatedResult.count || 0,
        activeClients: clientsResult.count || 0,
        resolutionRate,
      };
    },
    staleTime: 1000 * 60,
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

  // Optimized: Single RPC call instead of 14 separate queries
  const { data: weeklyData, isLoading: isLoadingWeekly } = useQuery({
    queryKey: ["weekly-trend"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_weekly_ticket_trend");
      
      if (error) {
        // Fallback to empty array silently
        return [];
      }
      
      return (data || []).map((row: { day: string; tickets: number; resolved: number }) => ({
        day: row.day,
        tickets: Number(row.tickets) || 0,
        resolved: Number(row.resolved) || 0,
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const statCards = [
    { title: "Chamados Abertos", value: stats?.openTickets ?? 0, icon: Ticket, color: "text-primary", href: "/tickets?status=open" },
    { title: "Em Andamento", value: stats?.inProgressTickets ?? 0, icon: Clock, color: "text-warning", href: "/tickets?status=in_progress" },
    { title: "Resolvidos Hoje", value: stats?.resolvedToday ?? 0, icon: CheckCircle, color: "text-success" },
    { title: "SLA Violado", value: stats?.slaViolated ?? 0, icon: AlertTriangle, color: "text-destructive", href: "/tickets" },
    { title: "Clientes Ativos", value: stats?.activeClients ?? 0, icon: Users, color: "text-primary", href: "/clients" },
    { title: "Taxa de Resolução", value: `${stats?.resolutionRate ?? 0}%`, icon: TrendingUp, color: "text-success" },
  ];

  // Render technician-specific dashboard
  if (isTechnicianOnly) {
    return (
      <AppLayout title="Dashboard">
        <TechnicianDashboard />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard">
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
              Olá, {profile?.full_name?.split(" ")[0] || "Usuário"}! 👋
            </h2>
            <p className="text-muted-foreground">
              Aqui está o resumo do seu dia
            </p>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TicketStatusChart
            data={{
              open: stats?.openTickets ?? 0,
              inProgress: stats?.inProgressTickets ?? 0,
              waiting: stats?.waitingTickets ?? 0,
              resolved: stats?.resolvedToday ?? 0,
            }}
            isLoading={isLoading}
          />
          <WeeklyTrendChart
            data={weeklyData || []}
            isLoading={isLoadingWeekly}
          />
        </div>

        {/* Recent Tickets */}
        <RecentTicketsList
          tickets={recentTickets || []}
          isLoading={isLoadingTickets}
        />
      </div>
    </AppLayout>
  );
}
