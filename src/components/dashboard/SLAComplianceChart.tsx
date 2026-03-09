import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SLAComplianceChartProps {
  met: number;
  violated: number;
  isLoading?: boolean;
}

export function SLAComplianceChart({ met, violated, isLoading }: SLAComplianceChartProps) {
  const total = met + violated;
  const percentage = total > 0 ? Math.round((met / total) * 100) : 100;

  const chartData = [
    { name: "Dentro do SLA", value: met || 1 },
    { name: "Violado", value: violated },
  ];

  const getColor = () => {
    if (percentage >= 90) return "hsl(var(--success))";
    if (percentage >= 70) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="premium-card h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-success" />
            Conformidade SLA
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[200px]">
              <Skeleton className="h-[160px] w-[160px] rounded-full" />
            </div>
          ) : (
            <div className="relative h-[200px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    dataKey="value"
                    animationDuration={1200}
                  >
                    <Cell fill={getColor()} />
                    <Cell fill="hsl(var(--muted))" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  className="text-3xl font-bold"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: "spring" }}
                  style={{ color: getColor() }}
                >
                  {percentage}%
                </motion.span>
                <span className="text-xs text-muted-foreground">
                  {met}/{total} dentro
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
