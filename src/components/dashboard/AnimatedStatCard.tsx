import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AnimatedStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  isLoading?: boolean;
  index?: number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function AnimatedStatCard({
  title,
  value,
  icon: Icon,
  color,
  isLoading,
  index = 0,
  trend,
}: AnimatedStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={{ 
        y: -4, 
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <Card className="relative overflow-hidden group cursor-pointer premium-card">
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Glow effect */}
        <div className={`absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-300 ${color.replace('text-', 'bg-')}`} />
        
        <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <motion.div
            whileHover={{ rotate: 10, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Icon className={`h-5 w-5 ${color} drop-shadow-sm`} />
          </motion.div>
        </CardHeader>
        <CardContent className="relative z-10">
          {isLoading ? (
            <Skeleton className="h-8 w-20 skeleton-premium" />
          ) : (
            <div className="space-y-1">
              <motion.div
                className="text-2xl font-bold"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 + 0.2, type: "spring", stiffness: 300 }}
              >
                {value}
              </motion.div>
              {trend && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 + 0.3 }}
                  className={`text-xs flex items-center gap-1 ${
                    trend.isPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  <span>{trend.isPositive ? "↑" : "↓"}</span>
                  <span>{trend.value}% vs ontem</span>
                </motion.div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
