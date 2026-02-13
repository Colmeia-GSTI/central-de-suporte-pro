import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, Receipt, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AdditionalChargesReportTabProps {
  startDate: Date;
}

interface ReportData {
  by_client: { client_name: string; client_id: string; charge_count: number; total_amount: number }[];
  totals: { total_count: number; total_amount: number };
  avulsas: { total_count: number; total_amount: number };
  monthly: { month: string; additional_amount: number; recurring_amount: number }[];
  upsell_candidates: { client_name: string; client_id: string; avulsa_count: number; avulsa_total: number }[];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function AdditionalChargesReportTab({ startDate }: AdditionalChargesReportTabProps) {
  const endDate = useMemo(() => new Date(), []);

  const { data: report, isLoading } = useQuery({
    queryKey: ["additional-charges-report", startDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_additional_charges_report", {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });
      if (error) throw error;
      return data as unknown as ReportData;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const chartData = (report?.monthly || []).map(m => ({
    month: format(new Date(m.month + "-01"), "MMM/yy", { locale: ptBR }),
    adicionais: m.additional_amount,
    recorrente: m.recurring_amount,
  }));

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Total de Adicionais no Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(report?.totals?.total_amount || 0)}</p>
            <p className="text-xs text-muted-foreground">{report?.totals?.total_count || 0} lançamentos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Total de Notas Avulsas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(report?.avulsas?.total_amount || 0)}</p>
            <p className="text-xs text-muted-foreground">{report?.avulsas?.total_count || 0} notas emitidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Upsell Candidates */}
      {(report?.upsell_candidates?.length || 0) > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              Candidatos a Contrato
              <Badge variant="secondary" className="ml-auto">{report?.upsell_candidates?.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Clientes com 3+ notas avulsas no período — considere migrar para contrato recorrente.
            </p>
            <div className="space-y-2">
              {report?.upsell_candidates?.map(c => (
                <div key={c.client_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">{c.client_name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono">{c.avulsa_count} avulsas</span>
                    <span className="ml-3 text-muted-foreground">{formatCurrency(c.avulsa_total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ranking by Client */}
      {(report?.by_client?.length || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Adicionais por Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2">Cliente</th>
                    <th className="text-right pb-2">Qtd</th>
                    <th className="text-right pb-2">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.by_client?.map(c => (
                    <tr key={c.client_id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{c.client_name}</td>
                      <td className="py-2 text-right">{c.charge_count}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(c.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Adicionais vs Receita Recorrente</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Sem dados para o período selecionado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="adicionais" name="Adicionais" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recorrente" name="Recorrente" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.3} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
