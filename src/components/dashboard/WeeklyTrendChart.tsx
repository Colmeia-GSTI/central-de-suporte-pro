import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WeeklyTrendChartProps {
  data: { day: string; tickets: number; resolved: number }[];
  isLoading?: boolean;
}

export function WeeklyTrendChart({ data, isLoading }: WeeklyTrendChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <Card className="premium-card h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
            >
              <TrendingUp className="h-5 w-5 text-success" />
            </motion.div>
            Tendência Semanal
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[250px] flex items-center justify-center">
              <Skeleton className="h-full w-full skeleton-premium" />
            </div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ticketsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="resolvedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="tickets"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#ticketsGradient)"
                    name="Novos"
                    animationDuration={1500}
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    fill="url(#resolvedGradient)"
                    name="Resolvidos"
                    animationDuration={1500}
                    animationBegin={300}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
