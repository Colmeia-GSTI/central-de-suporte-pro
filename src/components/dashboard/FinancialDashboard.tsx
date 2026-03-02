import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  FileText,
  AlertTriangle,
  DollarSign,
  Receipt,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { AnimatedStatCard } from "@/components/dashboard/AnimatedStatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  overdue: "Vencida",
  paid: "Paga",
  cancelled: "Cancelada",
};

const statusColors: Record<string, string> = {
  pending: "bg-warning text-warning-foreground",
  overdue: "bg-destructive text-destructive-foreground",
  paid: "bg-success text-success-foreground",
};

export function FinancialDashboard() {
  const { profile } = useAuth();

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysLater = addDays(today, 7).toISOString().split("T")[0];
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  // Stats: pending, overdue, revenue this month, pending NFS-e
  const { data: stats, isLoading } = useQuery({
    queryKey: ["financial-dashboard-stats"],
    queryFn: async () => {
      const [pendingRes, overdueRes, revenueRes, nfseRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gte("due_date", todayStr),
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${todayStr})`),
        supabase
          .from("invoices")
          .select("amount")
          .eq("status", "paid")
          .gte("paid_date", firstOfMonth),
        supabase
          .from("nfse_history")
          .select("id", { count: "exact", head: true })
          .in("status", ["pendente", "processando"]),
      ]);

      const monthRevenue = (revenueRes.data || []).reduce(
        (sum, inv) => sum + Number(inv.amount || 0),
        0
      );

      return {
        pending: pendingRes.count || 0,
        overdue: overdueRes.count || 0,
        revenue: monthRevenue,
        pendingNfse: nfseRes.count || 0,
      };
    },
    staleTime: 1000 * 60 * 2,
  });

  // Upcoming invoices (next 7 days)
  const { data: upcomingInvoices, isLoading: loadingUpcoming } = useQuery({
    queryKey: ["financial-dashboard-upcoming"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, due_date, status, client:clients(name)")
        .eq("status", "pending")
        .gte("due_date", todayStr)
        .lte("due_date", sevenDaysLater)
        .order("due_date", { ascending: true })
        .limit(10);
      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Olá, {profile?.full_name?.split(" ")[0] || "Financeiro"}! 👋
        </h2>
        <p className="text-muted-foreground">Resumo financeiro do momento</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatedStatCard
          title="Faturas Pendentes"
          value={stats?.pending ?? 0}
          icon={FileText}
          color="text-warning"
          isLoading={isLoading}
          index={0}
          href="/billing"
        />
        <AnimatedStatCard
          title="Faturas Vencidas"
          value={stats?.overdue ?? 0}
          icon={AlertTriangle}
          color="text-destructive"
          isLoading={isLoading}
          index={1}
          href="/billing"
        />
        <AnimatedStatCard
          title="Receita do Mês"
          value={formatCurrencyBRLWithSymbol(stats?.revenue ?? 0)}
          icon={DollarSign}
          color="text-success"
          isLoading={isLoading}
          index={2}
        />
        <AnimatedStatCard
          title="NFS-e Pendentes"
          value={stats?.pendingNfse ?? 0}
          icon={Receipt}
          color="text-primary"
          isLoading={isLoading}
          index={3}
          href="/billing"
        />
      </div>

      {/* Upcoming invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Próximos Vencimentos (7 dias)
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/billing">
              Ver todos
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            {loadingUpcoming ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : upcomingInvoices?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma fatura com vencimento próximo</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingInvoices?.map((inv) => (
                  <Link
                    key={inv.id}
                    to="/billing"
                    className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{inv.invoice_number}
                          </span>
                          <Badge
                            className={statusColors[inv.status] || ""}
                            variant="secondary"
                          >
                            {statusLabels[inv.status] || inv.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {inv.client?.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">
                          {formatCurrencyBRLWithSymbol(Number(inv.amount))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
