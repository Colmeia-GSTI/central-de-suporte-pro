import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Mail,
  MessageSquare,
  Building2,
  Activity,
  Calendar,
  Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface IntegrationStatus {
  type: string;
  name: string;
  icon: React.ReactNode;
  isActive: boolean;
  lastSync?: string | null;
  error?: string | null;
}

const INTEGRATION_META: Record<string, { name: string; icon: React.ReactNode; category: string }> = {
  resend: { name: "Email (Resend)", icon: <Mail className="h-4 w-4" />, category: "Comunicação" },
  google_calendar: { name: "Google Calendar", icon: <Calendar className="h-4 w-4" />, category: "Comunicação" },
  evolution_api: { name: "WhatsApp (Evolution)", icon: <MessageSquare className="h-4 w-4" />, category: "Mensagens" },
  telegram: { name: "Telegram Bot", icon: <Send className="h-4 w-4" />, category: "Mensagens" },
  banco_inter: { name: "Banco Inter", icon: <Building2 className="h-4 w-4" />, category: "Financeiro" },
  asaas: { name: "Asaas (NFS-e)", icon: <Building2 className="h-4 w-4" />, category: "Financeiro" },
  checkmk: { name: "Check MK", icon: <Activity className="h-4 w-4" />, category: "Monitoramento" },
  tactical_rmm: { name: "Tactical RMM", icon: <Activity className="h-4 w-4" />, category: "Monitoramento" },
};

export function IntegrationStatusPanel() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data: integrations, isLoading, refetch } = useQuery({
    queryKey: ["integration-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("integration_type, is_active, last_sync_at, settings")
        .order("integration_type");

      if (error) throw error;

      return data.map((int) => ({
        type: int.integration_type,
        name: INTEGRATION_META[int.integration_type]?.name || int.integration_type,
        icon: INTEGRATION_META[int.integration_type]?.icon || <Activity className="h-4 w-4" />,
        category: INTEGRATION_META[int.integration_type]?.category || "Outros",
        isActive: int.is_active,
        lastSync: int.last_sync_at,
      })) as IntegrationStatus[];
    },
    staleTime: 60000,
  });

  const handleSync = async (integrationType: string) => {
    setSyncing(integrationType);
    try {
      let functionName = "";
      switch (integrationType) {
        case "tactical_rmm":
          functionName = "tactical-rmm-sync";
          break;
        case "checkmk":
          functionName = "checkmk-sync";
          break;
        default:
          toast({
            title: "Sincronização não disponível",
            description: "Esta integração não suporta sincronização manual",
            variant: "destructive",
          });
          return;
      }

      const { error } = await supabase.functions.invoke(functionName, {
        body: { action: "sync" },
      });

      if (error) throw error;

      // Update last_sync_at
      await supabase
        .from("integration_settings")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("integration_type", integrationType);

      toast({
        title: "Sincronização concluída",
        description: `${INTEGRATION_META[integrationType]?.name} sincronizado com sucesso`,
      });

      refetch();
    } catch (error) {
      toast({
        title: "Erro na sincronização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSyncing(null);
    }
  };

  const activeCount = integrations?.filter((i) => i.isActive).length || 0;
  const totalCount = integrations?.length || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Group by category
  const grouped = integrations?.reduce(
    (acc, int) => {
      const cat = (int as IntegrationStatus & { category: string }).category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(int);
      return acc;
    },
    {} as Record<string, IntegrationStatus[]>
  );

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Resumo das Integrações</CardTitle>
          <CardDescription>
            Visão geral do estado das integrações configuradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-status-success" />
              <span className="text-2xl font-bold">{activeCount}</span>
              <span className="text-muted-foreground">ativas</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{totalCount - activeCount}</span>
              <span className="text-muted-foreground">inativas</span>
            </div>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Cards by Category */}
      {grouped &&
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {category}
            </h4>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((integration) => (
                <Card key={integration.type} className={integration.isActive ? "" : "opacity-60"}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            integration.isActive
                              ? "bg-status-success/10 text-status-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {integration.icon}
                        </div>
                        <div>
                          <p className="font-medium">{integration.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              variant={integration.isActive ? "default" : "secondary"}
                              className={integration.isActive ? "bg-status-success" : ""}
                            >
                              {integration.isActive ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {integration.isActive &&
                        (integration.type === "tactical_rmm" || integration.type === "checkmk") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSync(integration.type)}
                            disabled={syncing === integration.type}
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${syncing === integration.type ? "animate-spin" : ""}`}
                            />
                          </Button>
                        )}
                    </div>
                    {integration.lastSync && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Última sincronização:{" "}
                        {formatDistanceToNow(new Date(integration.lastSync), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

      {(!integrations || integrations.length === 0) && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">
              Nenhuma integração configurada. Configure as integrações nas abas acima.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scheduled Automations (CRONs) */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Automações Agendadas
        </h4>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { name: "Verificação de SLA", description: "Notifica sobre chamados próximos de violar o SLA", fn: "notify-sla-breach" },
            { name: "Reajuste de Contratos", description: "Verifica contratos com reajuste pendente", fn: "check-contract-adjustments" },
            { name: "Geração de Faturas", description: "Gera faturas mensais automaticamente", fn: "generate-invoice-payments" },
            { name: "Polling de Serviços", description: "Monitora status de serviços externos", fn: "poll-services" },
          ].map((cron) => (
            <Card key={cron.fn}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <RefreshCw className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{cron.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cron.description}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Badge variant="outline" className="text-xs">
                    Automático (CRON)
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
