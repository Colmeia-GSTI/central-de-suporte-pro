import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tv, RefreshCw, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BusinessHoursForm } from "./BusinessHoursForm";
import type { Tables } from "@/integrations/supabase/types";

export function SystemTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tvConfig } = useQuery({
    queryKey: ["tv-dashboard-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tv_dashboard_config")
        .select("id, name, access_token, rotation_interval, theme, show_tickets, show_ranking, show_monitoring, show_metrics")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateTVConfigMutation = useMutation({
    mutationFn: async (updates: Partial<Tables<"tv_dashboard_config">>) => {
      if (!tvConfig) return;
      const { error } = await supabase
        .from("tv_dashboard_config")
        .update(updates)
        .eq("id", tvConfig.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tv-dashboard-config"] });
      toast({ title: "Configuração salva" });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async () => {
      if (!tvConfig) return;
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from("tv_dashboard_config")
        .update({ access_token: newToken })
        .eq("id", tvConfig.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tv-dashboard-config"] });
      toast({ title: "Token regenerado" });
    },
  });

  const copyTVUrl = () => {
    const url = `${window.location.origin}/tv-dashboard`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiada para a área de transferência" });
  };

  return (
    <div className="space-y-6">
      {/* TV Dashboard Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" />
            Dashboard para TV
          </CardTitle>
          <CardDescription>
            Configure o dashboard público para exibição em monitores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {tvConfig && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do Dashboard</Label>
                  <Input
                    value={tvConfig.name}
                    onChange={(e) =>
                      updateTVConfigMutation.mutate({ name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Intervalo de Rotação (segundos)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={tvConfig.rotation_interval}
                    onChange={(e) =>
                      updateTVConfigMutation.mutate({
                        rotation_interval: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tema</Label>
                  <Select
                    value={tvConfig.theme}
                    onValueChange={(v) => updateTVConfigMutation.mutate({ theme: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="light">Claro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Seções Visíveis</Label>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-metrics">Métricas</Label>
                    <Switch
                      id="show-metrics"
                      checked={tvConfig.show_metrics}
                      onCheckedChange={(v) =>
                        updateTVConfigMutation.mutate({ show_metrics: v })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-tickets">Fila de Tickets</Label>
                    <Switch
                      id="show-tickets"
                      checked={tvConfig.show_tickets}
                      onCheckedChange={(v) =>
                        updateTVConfigMutation.mutate({ show_tickets: v })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-ranking">Ranking de Técnicos</Label>
                    <Switch
                      id="show-ranking"
                      checked={tvConfig.show_ranking}
                      onCheckedChange={(v) =>
                        updateTVConfigMutation.mutate({ show_ranking: v })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-monitoring">Monitoramento</Label>
                    <Switch
                      id="show-monitoring"
                      checked={tvConfig.show_monitoring}
                      onCheckedChange={(v) =>
                        updateTVConfigMutation.mutate({ show_monitoring: v })
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Acesso</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={`${window.location.origin}/tv-dashboard`}
                    readOnly
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={copyTVUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={tvConfig.access_token}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => regenerateTokenMutation.mutate()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use o token para autenticar o acesso ao dashboard via API
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>Sobre o Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Versão</span>
              <span className="font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plataforma</span>
              <span>Central de Helpdesk</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Módulos</span>
              <span>10 ativos</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
