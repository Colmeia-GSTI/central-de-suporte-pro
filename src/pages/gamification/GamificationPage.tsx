import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Trophy,
  Medal,
  Star,
  Target,
  TrendingUp,
  Award,
  Zap,
  Shield,
  Clock,
  ThumbsUp,
} from "lucide-react";

const levelConfig = {
  bronze: { min: 0, max: 500, color: "bg-level-bronze", label: "Bronze" },
  silver: { min: 501, max: 1500, color: "bg-level-silver", label: "Prata" },
  gold: { min: 1501, max: 3500, color: "bg-level-gold", label: "Ouro" },
  platinum: { min: 3501, max: 7000, color: "bg-level-platinum", label: "Platina" },
  diamond: { min: 7001, max: Infinity, color: "bg-level-diamond", label: "Diamante" },
};

const badgeIcons: Record<string, React.ReactNode> = {
  velocista: <Zap className="h-6 w-6" />,
  guardiao_sla: <Shield className="h-6 w-6" />,
  maratonista: <Clock className="h-6 w-6" />,
  cinco_estrelas: <Star className="h-6 w-6" />,
  resolvedor: <ThumbsUp className="h-6 w-6" />,
};

export default function GamificationPage() {
  const { data: ranking = [], isLoading: loadingRanking } = useQuery({
    queryKey: ["technician-ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_technician_ranking", {
        start_date: new Date(0).toISOString(),
        limit_count: 10,
      });
      if (error) throw error;

      return (data || []).map((r: { name: string; points: number }) => ({
        userId: r.name,
        name: r.name,
        points: r.points,
        level: getLevel(r.points),
      }));
    },
  });

  const { data: badges = [] } = useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badges").select("id, name, icon, description").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["gamification-goals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamification_goals")
        .select("id, name, description, target_value, points_reward, period")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  function getLevel(points: number) {
    if (points >= 7001) return "diamond";
    if (points >= 3501) return "platinum";
    if (points >= 1501) return "gold";
    if (points >= 501) return "silver";
    return "bronze";
  }

  function getLevelProgress(points: number) {
    const level = getLevel(points);
    const config = levelConfig[level as keyof typeof levelConfig];
    if (level === "diamond") return 100;
    const progress = ((points - config.min) / (config.max - config.min)) * 100;
    return Math.min(progress, 100);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gamificação</h1>
          <p className="text-muted-foreground">
            Ranking, conquistas e metas dos técnicos
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
          {/* Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Ranking de Técnicos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRanking ? (
                <p className="text-center text-muted-foreground py-8">
                  Carregando...
                </p>
              ) : ranking.length === 0 ? (
                <div className="text-center py-8">
                  <Trophy className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">
                    Nenhum técnico no ranking ainda
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {ranking.map((tech, index) => {
                    const config = levelConfig[tech.level as keyof typeof levelConfig];
                    return (
                      <div
                        key={tech.userId}
                        className={`
                          flex items-center gap-4 p-4 rounded-lg border
                          ${index === 0 ? "bg-yellow-500/10 border-yellow-500/30" : ""}
                          ${index === 1 ? "bg-gray-300/10 border-gray-300/30" : ""}
                          ${index === 2 ? "bg-amber-700/10 border-amber-700/30" : ""}
                        `}
                      >
                        <div className="text-2xl font-bold text-muted-foreground w-8">
                          {index === 0 && <Medal className="h-6 w-6 text-yellow-500" />}
                          {index === 1 && <Medal className="h-6 w-6 text-gray-400" />}
                          {index === 2 && <Medal className="h-6 w-6 text-amber-700" />}
                          {index > 2 && `${index + 1}º`}
                        </div>
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className={config.color}>
                            {tech.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tech.name}</span>
                            <Badge className={`${config.color} text-white`}>
                              {config.label}
                            </Badge>
                          </div>
                          <div className="mt-1">
                            <Progress value={getLevelProgress(tech.points)} className="h-2" />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{tech.points}</div>
                          <div className="text-sm text-muted-foreground">pontos</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Badges */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  Conquistas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {badges.map((badge) => (
                    <div
                      key={badge.id}
                      className="flex flex-col items-center gap-1 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="p-2 rounded-full bg-primary/10 text-primary">
                        {badgeIcons[badge.icon || ""] || <Star className="h-6 w-6" />}
                      </div>
                      <span className="text-xs font-medium text-center">
                        {badge.name}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Goals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Metas Ativas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {goals.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    Nenhuma meta ativa
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goals.map((goal) => (
                      <div
                        key={goal.id}
                        className="p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{goal.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {goal.description}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            +{goal.points_reward} pts
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Progress value={0} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground">
                            0/{goal.target_value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Level Guide */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Níveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(levelConfig).map(([key, config]) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${config.color}`} />
                      <span className="text-sm font-medium">{config.label}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {config.min}+ pts
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
