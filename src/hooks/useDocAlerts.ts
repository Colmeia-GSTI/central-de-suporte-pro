import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DocAlert {
  id: string;
  client_id: string;
  alert_type: string;
  reference_table: string;
  reference_id: string;
  title: string;
  description: string;
  expiry_date: string;
  days_remaining: number;
  severity: string;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

const ALERT_TYPE_TO_SECTION: Record<string, string> = {
  license: "7",
  domain: "9",
  link: "3",
  software: "8",
  provider: "13",
};

export function useDocAlerts(clientId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["doc-alerts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_alerts" as any)
        .select("id, client_id, alert_type, reference_table, reference_id, title, description, expiry_date, days_remaining, severity, status, acknowledged_by, acknowledged_at, created_at")
        .eq("client_id", clientId)
        .in("status", ["active"])
        .order("severity", { ascending: true })
        .order("days_remaining", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as DocAlert[];
    },
    staleTime: 120_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("doc_alerts" as any)
        .update({
          status: "acknowledged",
          acknowledged_by: user?.id,
          acknowledged_at: new Date().toISOString(),
        } as any)
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doc-alerts", clientId] });
    },
  });

  // Count alerts per section
  const sectionCounts: Record<string, number> = {};
  const severityBySection: Record<string, string> = {};

  for (const alert of alerts) {
    const sectionId = ALERT_TYPE_TO_SECTION[alert.alert_type];
    if (sectionId) {
      sectionCounts[sectionId] = (sectionCounts[sectionId] || 0) + 1;
      // Keep the worst severity per section
      const current = severityBySection[sectionId];
      if (!current || alert.severity === "critical" || (alert.severity === "warning" && current === "info")) {
        severityBySection[sectionId] = alert.severity;
      }
    }
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return {
    alerts,
    isLoading,
    acknowledge: acknowledgeMutation.mutate,
    isAcknowledging: acknowledgeMutation.isPending,
    sectionCounts,
    severityBySection,
    criticalCount,
    warningCount,
    totalCount: alerts.length,
  };
}
