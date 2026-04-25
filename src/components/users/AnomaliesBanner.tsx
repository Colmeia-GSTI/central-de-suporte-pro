import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface AnomalyReport {
  orphans: unknown[];
  zombies: unknown[];
  unconfirmed_old: unknown[];
  roleless: unknown[];
}

export function AnomaliesBanner() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ total: number; report: AnomalyReport } | null>({
    queryKey: ["auth-anomalies"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("detect-auth-anomalies", { body: {} });
      if (error) return null;
      return data as { total: number; report: AnomalyReport };
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("detect-auth-anomalies", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      queryClient.setQueryData(["auth-anomalies"], d);
      toast.success("Verificação de anomalias concluída");
    },
    onError: () => toast.error("Falha ao verificar anomalias"),
  });

  if (isLoading || !data || data.total === 0) return null;

  return (
    <Alert className="border-status-warning/50 bg-status-warning/10">
      <AlertTriangle className="h-4 w-4 text-status-warning" />
      <AlertTitle>Anomalias detectadas no cadastro</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>
          {data.report.orphans.length} órfãos · {data.report.zombies.length} zumbis ·{" "}
          {data.report.unconfirmed_old.length} não confirmados (&gt;7d) ·{" "}
          {data.report.roleless.length} sem papel
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
