import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PriorityData {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface PriorityDistributionChartProps {
  data: PriorityData;
  isLoading?: boolean;
}

const ITEMS = [
  { key: "critical", label: "Crítico", color: "hsl(var(--destructive))" },
  { key: "high", label: "Alto", color: "hsl(var(--priority-high))" },
  { key: "medium", label: "Médio", color: "hsl(var(--warning))" },
  { key: "low", label: "Baixo", color: "hsl(var(--success))" },
] as const;

export function PriorityDistributionChart({ data, isLoading }: PriorityDistributionChartProps) {
  const chartData = ITEMS.map((item) => ({
    name: item.label,
    value: data[item.key],
    color: item.color,
  }));

  const total = Object.values(data).reduce((s, v) => s + v, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <Card className="premium-card h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-warning" />
            Por Prioridade
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 h-[200px] flex flex-col justify-center">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">Sem dados no período</p>
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [value, "Chamados"]}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={1000} barSize={20}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
