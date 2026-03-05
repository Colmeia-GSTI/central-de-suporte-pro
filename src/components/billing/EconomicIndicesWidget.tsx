import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EconomicIndex {
  id: string;
  index_type: string;
  reference_date: string;
  value: number;
  accumulated_12m: number | null;
  fetched_at: string;
}

export function EconomicIndicesWidget() {
  const queryClient = useQueryClient();

  const { data: indices, isLoading } = useQuery({
    queryKey: ["economic-indices-latest"],
    queryFn: async () => {
      const { data } = await supabase
        .from("economic_indices")
        .select("id, index_type, reference_date, value, accumulated_12m, fetched_at")
        .in("index_type", ["IGPM", "IPCA", "INPC"])
        .order("reference_date", { ascending: false })
        .limit(10);

      const latest = new Map<string, EconomicIndex>();
      for (const row of data || []) {
        if (!latest.has(row.index_type)) latest.set(row.index_type, row as EconomicIndex);
      }
      return Array.from(latest.values());
    },
  });

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-economic-indices", {
        body: { months: 13 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["economic-indices-latest"] });
      const types = Object.keys(data.results || {});
      toast.success("Índices atualizados!", {
        description: types.map((t) => `${t}: ${data.results[t].inserted} registros`).join(", "),
      });
    },
    onError: (error) => {
      toast.error("Erro ao buscar índices", { description: error.message });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-chart-1" />
            Índices Econômicos
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending}
          >
            {fetchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !indices || indices.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">Nenhum índice carregado</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMutation.mutate()}
              disabled={fetchMutation.isPending}
            >
              {fetchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Buscar do Banco Central
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {indices.map((idx) => (
              <div key={idx.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{idx.index_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(idx.reference_date + "T12:00:00"), "MMM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  {idx.accumulated_12m !== null && (
                    <span className="text-[10px] text-muted-foreground">
                      Acum. 12m: {idx.accumulated_12m.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${idx.value >= 0 ? "text-status-danger" : "text-status-success"}`}>
                    {idx.value >= 0 ? "+" : ""}{idx.value.toFixed(2)}%
                  </span>
                  <div className="flex items-center justify-end">
                    {idx.value >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-status-danger" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-status-success" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground text-center">
              Fonte: Banco Central do Brasil (SGS)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
