import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

type Period = "today" | "7d" | "30d";

interface DashboardHeaderProps {
  userName: string;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

const periodLabels: Record<Period, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

export function DashboardHeader({ userName, period, onPeriodChange }: DashboardHeaderProps) {
  const now = new Date();
  const dateStr = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <div className="space-y-1">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Olá, {userName}! 👋
        </h2>
        <p className="text-muted-foreground capitalize text-sm">{dateStr}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Period selector */}
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 gap-0.5">
          {(["today", "7d", "30d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 select-none ${
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <Link to="/tickets/new">
          <Button size="sm" className="gap-1.5 hidden sm:inline-flex">
            <Plus className="h-4 w-4" />
            Novo Chamado
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
