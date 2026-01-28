import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Ticket } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TicketStatusChartProps {
  data: {
    open: number;
    inProgress: number;
    waiting: number;
    resolved: number;
  };
  isLoading?: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--warning))",
  "hsl(var(--muted))",
  "hsl(var(--success))",
];

export function TicketStatusChart({ data, isLoading }: TicketStatusChartProps) {
  const chartData = [
    { name: "Abertos", value: data.open, color: COLORS[0] },
    { name: "Em Andamento", value: data.inProgress, color: COLORS[1] },
    { name: "Aguardando", value: data.waiting, color: COLORS[2] },
    { name: "Resolvidos", value: data.resolved, color: COLORS[3] },
  ].filter(item => item.value > 0);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="premium-card h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Ticket className="h-5 w-5 text-primary" />
            </motion.div>
            Distribuição de Chamados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[250px]">
              <Skeleton className="h-[200px] w-[200px] rounded-full skeleton-premium" />
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
              <Ticket className="h-12 w-12 mb-4 opacity-20" />
              <p>Nenhum chamado encontrado</p>
            </div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke="transparent"
                        className="drop-shadow-lg transition-all duration-200 hover:opacity-80"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [value, "Chamados"]}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "20px" }}
                    formatter={(value) => (
                      <span className="text-sm text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
