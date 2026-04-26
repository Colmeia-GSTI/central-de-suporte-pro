import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

interface TechnicianMiniRankingProps {
  startDate: Date;
}

export function TechnicianMiniRanking({ startDate }: TechnicianMiniRankingProps) {
  const gamificationEnabled = useFeatureFlag("gamification_enabled");

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["technician-mini-ranking", startDate.toISOString()],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_technician_ranking", {
        start_date: startDate.toISOString(),
        limit_count: 5,
      });
      return (data as { name: string; points: number }[] | null) || [];
    },
    staleTime: 1000 * 60 * 5,
    enabled: gamificationEnabled,
  });

  if (!gamificationEnabled) return null;

  const maxPoints = ranking?.[0]?.points || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
    >
      <Card className="premium-card h-full">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5 text-primary" />
            Top Técnicos
          </CardTitle>
          <Link to="/gamification">
            <Button variant="ghost" size="sm" className="text-xs gap-1 group h-7">
              Ver mais
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !ranking?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Trophy className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">Sem dados no período</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ranking.map((tech, i) => {
                const initials = tech.name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase();
                return (
                  <motion.div
                    key={tech.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-2.5"
                  >
                    <span className="text-xs font-bold text-muted-foreground w-4 text-right">
                      {i + 1}
                    </span>
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm truncate">{tech.name}</span>
                        <span className="text-xs font-semibold text-primary ml-2 flex-shrink-0">
                          {tech.points} pts
                        </span>
                      </div>
                      <Progress
                        value={(tech.points / maxPoints) * 100}
                        className="h-1.5"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
