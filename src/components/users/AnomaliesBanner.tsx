import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

interface CachedAnomalyContext {
  orphans?: number;
  zombies?: number;
  unconfirmed_old?: number;
  roleless?: number;
  triggered_by?: string | null;
}

interface CachedAnomalyState {
  total: number;
  orphans: number;
  zombies: number;
  unconfirmed_old: number;
  roleless: number;
  lastRunAt: string | null;
  stale: boolean;
}

const STALE_HOURS = 25;

export function AnomaliesBanner() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<CachedAnomalyState>({
    queryKey: ["auth-anomalies"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("application_logs")
        .select("created_at, context")
        .eq("module", "auth")
        .eq("action", "detect_anomalies")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      const last = rows?.[0];
      if (!last) {
        return { total: 0, orphans: 0, zombies: 0, unconfirmed_old: 0, roleless: 0, lastRunAt: null, stale: true };
      }
      const ctx = (last.context ?? {}) as CachedAnomalyContext;
      const orphans = ctx.orphans ?? 0;
      const zombies = ctx.zombies ?? 0;
      const unconfirmed_old = ctx.unconfirmed_old ?? 0;
      const roleless = ctx.roleless ?? 0;
      const total = orphans + zombies + unconfirmed_old + roleless;
      const ageMs = Date.now() - new Date(last.created_at).getTime();
      return {
        total, orphans, zombies, unconfirmed_old, roleless,
        lastRunAt: last.created_at,
        stale: ageMs > STALE_HOURS * 60 * 60 * 1000,
      };
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke("detect-auth-anomalies", { body: {} });
      if (error) throw error;
      return result as { total?: number; report?: { orphans: unknown[]; zombies: unknown[]; unconfirmed_old: unknown[]; roleless: unknown[] } };
    },
    onSuccess: (result) => {
      const r = result?.report;
      const next: CachedAnomalyState = {
        total: result?.total ?? 0,
        orphans: r?.orphans.length ?? 0,
        zombies: r?.zombies.length ?? 0,
        unconfirmed_old: r?.unconfirmed_old.length ?? 0,
        roleless: r?.roleless.length ?? 0,
        lastRunAt: new Date().toISOString(),
        stale: false,
      };
      queryClient.setQueryData(["auth-anomalies"], next);
      toast.success("Verificação de anomalias concluída");
    },
    onError: () => toast.error("Falha ao verificar anomalias"),
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Falha ao consultar anomalias</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>Não foi possível ler o histórico de detecção. Tente verificar manualmente.</span>
          <Button size="sm" variant="outline" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Verificar agora
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  if (data.total === 0 && !data.stale) return null;

  if (data.stale && data.total === 0) {
    return (
      <Alert className="border-status-warning/50 bg-status-warning/10">
        <AlertTriangle className="h-4 w-4 text-status-warning" />
        <AlertTitle>Detector não rodou recentemente</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>Última verificação há mais de 25h. Confirme que o cron está ativo ou rode agora.</span>
          <Button size="sm" variant="outline" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Verificar agora
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-status-warning/50 bg-status-warning/10">
      <AlertTriangle className="h-4 w-4 text-status-warning" />
      <AlertTitle>Anomalias detectadas no cadastro</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>
          {data.orphans} órfãos · {data.zombies} zumbis ·{" "}
          {data.unconfirmed_old} não confirmados (&gt;7d) ·{" "}
          {data.roleless} sem papel
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Verificar agora
        </Button>
      </AlertDescription>
    </Alert>
  );
}
