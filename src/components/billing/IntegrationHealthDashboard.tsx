import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Activity, TrendingDown, ShieldCheck, ShieldAlert, Ticket, RefreshCw, Loader2, RotateCcw, FileSearch } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

export function IntegrationHealthDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isPollingBoletos, setIsPollingBoletos] = useState(false);
  const [isCheckingNfse, setIsCheckingNfse] = useState(false);

  const handleForcePollingAll = async () => {
    setIsPollingBoletos(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-services", { body: { services: ["boleto"] } });
      if (error) throw error;
      toast.success("Polling executado", {
        description: `${data.processed || 0} consultados, ${data.updated || 0} atualizados`,
      });
      queryClient.invalidateQueries({ queryKey: ["integration-health-stats"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro no polling", { description: getErrorMessage(e) });
    } finally {
      setIsPollingBoletos(false);
    }
  };

  const handleCheckNfseAll = async () => {
    setIsCheckingNfse(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-services", { body: { services: ["asaas_nfse"] } });
      if (error) throw error;
      toast.success("Verificação concluída", {
        description: `${data.updated || 0} nota(s) atualizada(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["integration-health-stats"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro ao verificar NFS-e", { description: getErrorMessage(e) });
    } finally {
      setIsCheckingNfse(false);
    }
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ["integration-health-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_integration_health_stats");
      if (error) throw error;
      return data as {
        stale_boletos: number;
        stale_nfse: number;
        failure_rate_24h: number;
        avg_bank_return_hours: number;
        failures_by_hour: { hour: string; count: number }[];
      };
    },
    refetchInterval: 60_000,
  });

  // Fetch SLA definitions
  const { data: slaDefinitions } = useQuery({
    queryKey: ["financial-incident-slas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_incident_slas")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch open incidents (invoices with errors in last 48h)
  const { data: openIncidents } = useQuery({
    queryKey: ["open-financial-incidents"],
    queryFn: async () => {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data: boletoErrors, error: e1 } = await supabase
        .from("invoices")
        .select("id, invoice_number, client:clients(name), updated_at, boleto_status")
        .eq("boleto_status", "erro")
        .gte("updated_at", since)
        .limit(20);
      
      const { data: nfseErrors, error: e2 } = await supabase
        .from("nfse_history")
        .select("id, numero_nfse, clients(name), updated_at, status, mensagem_retorno")
        .in("status", ["erro", "rejeitada"])
        .gte("updated_at", since)
        .limit(20);

      const incidents: {
        id: string;
        type: string;
        label: string;
        client: string;
        since: string;
        hoursElapsed: number;
        slaHours: number;
        slaBreached: boolean;
        slaWarning: boolean;
      }[] = [];

      const getSlaHours = (type: string) => {
        const sla = slaDefinitions?.find(s => s.incident_type === type);
        return sla?.resolution_hours || 24;
      };

      if (!e1 && boletoErrors) {
        for (const inv of boletoErrors) {
          const hrs = differenceInHours(new Date(), new Date(inv.updated_at));
          const slaHrs = getSlaHours("boleto_failure");
          incidents.push({
            id: inv.id,
            type: "boleto_failure",
            label: `Fatura #${inv.invoice_number}`,
            client: (inv.client as any)?.name || "—",
            since: inv.updated_at,
            hoursElapsed: hrs,
            slaHours: slaHrs,
            slaBreached: hrs > slaHrs,
            slaWarning: hrs > slaHrs * 0.75 && hrs <= slaHrs,
          });
        }
      }

      if (!e2 && nfseErrors) {
        for (const nf of nfseErrors) {
          const hrs = differenceInHours(new Date(), new Date(nf.updated_at));
          const isE0014 = nf.mensagem_retorno?.includes("E0014");
          const type = isE0014 ? "e0014" : "nfse_failure";
          const slaHrs = getSlaHours(type);
          incidents.push({
            id: nf.id,
            type,
            label: `NFS-e ${nf.numero_nfse || nf.id.slice(0, 8)}`,
            client: (nf.clients as any)?.name || "—",
            since: nf.updated_at,
            hoursElapsed: hrs,
            slaHours: slaHrs,
            slaBreached: hrs > slaHrs,
            slaWarning: hrs > slaHrs * 0.75 && hrs <= slaHrs,
          });
        }
      }

      return incidents.sort((a, b) => (a.slaBreached ? -1 : 1) - (b.slaBreached ? -1 : 1));
    },
    enabled: !!slaDefinitions,
    refetchInterval: 60_000,
  });

  // Retention compliance
  const { data: retentionData } = useQuery({
    queryKey: ["retention-compliance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_retention_policies")
        .select("*")
        .eq("bucket_name", "nfse-files")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
      </div>
    );
  }

  const chartData = (stats?.failures_by_hour || []).map(item => ({
    hour: format(new Date(item.hour), "HH:mm", { locale: ptBR }),
    falhas: item.count,
  }));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-status-warning" />
              Boletos Pendentes &gt; 1h
            </CardTitle>
          </CardHeader>
           <CardContent>
            <div className={`text-3xl font-bold ${(stats?.stale_boletos || 0) > 0 ? "text-status-warning" : "text-status-success"}`}>
              {stats?.stale_boletos || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">aguardando processamento</p>
            {(stats?.stale_boletos || 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs w-full"
                disabled={isPollingBoletos}
                onClick={handleForcePollingAll}
              >
                {isPollingBoletos ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Forçar Polling
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-danger" />
              NFS-e Processando &gt; 2h
            </CardTitle>
          </CardHeader>
           <CardContent>
            <div className={`text-3xl font-bold ${(stats?.stale_nfse || 0) > 0 ? "text-status-danger" : "text-status-success"}`}>
              {stats?.stale_nfse || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">notas paradas</p>
            {(stats?.stale_nfse || 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs w-full"
                disabled={isCheckingNfse}
                onClick={handleCheckNfseAll}
              >
                {isCheckingNfse ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileSearch className="h-3 w-3 mr-1" />}
                Verificar Status
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              Tempo Médio Banco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.avg_bank_return_hours || 0}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">retorno boletos (30 dias)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-status-danger" />
              Taxa de Falha 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${(stats?.failure_rate_24h || 0) > 5 ? "text-status-danger" : "text-foreground"}`}>
              {stats?.failure_rate_24h || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">billing / nfse / banco</p>
          </CardContent>
        </Card>
      </div>

      {/* Retention Compliance Card */}
      {retentionData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-success" />
              Retenção Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Bucket</p>
                <p className="font-mono font-medium">{retentionData.bucket_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Retenção</p>
                <p className="font-medium">{Math.round(retentionData.retention_days / 365)} anos</p>
              </div>
              <Badge variant="secondary" className="ml-auto">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Política ativa
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Incidents / SLA Section */}
      {openIncidents && openIncidents.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Incidentes Abertos
              <Badge variant="destructive" className="ml-2">{openIncidents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {openIncidents.slice(0, 10).map(inc => (
                <div key={inc.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {inc.slaBreached ? (
                      <Badge variant="destructive" className="text-xs shrink-0">SLA estourado</Badge>
                    ) : inc.slaWarning ? (
                      <Badge className="bg-status-warning text-white text-xs shrink-0">Atenção</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs shrink-0">Dentro do SLA</Badge>
                    )}
                    <span className="font-medium truncate">{inc.label}</span>
                    <span className="text-muted-foreground truncate">{inc.client}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {inc.hoursElapsed}h / {inc.slaHours}h
                    </span>
                    {inc.type === "boleto_failure" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigate("/billing?tab=errors")}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Corrigir
                      </Button>
                    )}
                    {(inc.type === "nfse_failure" || inc.type === "e0014") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigate("/billing?tab=errors")}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Corrigir
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => navigate("/tickets/new")}
                    >
                      <Ticket className="h-3 w-3 mr-1" />
                      Ticket
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failures by Hour Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Falhas por Hora (últimas 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              <div className="text-center">
                <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma falha registrada nas últimas 24h</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(label) => `Hora: ${label}`}
                />
                <Bar dataKey="falhas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
