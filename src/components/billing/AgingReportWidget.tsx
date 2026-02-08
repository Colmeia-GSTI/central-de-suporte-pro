import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { differenceInDays } from "date-fns";

interface AgingBucket {
  label: string;
  range: string;
  minDays: number;
  maxDays: number;
  count: number;
  total: number;
  color: string;
}

export function AgingReportWidget() {
  const { data: buckets, isLoading } = useQuery({
    queryKey: ["aging-report-widget"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount, due_date, fine_amount, interest_amount")
        .eq("status", "overdue");

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const agingBuckets: AgingBucket[] = [
        { label: "1-15 dias", range: "1-15", minDays: 1, maxDays: 15, count: 0, total: 0, color: "bg-yellow-500" },
        { label: "16-30 dias", range: "16-30", minDays: 16, maxDays: 30, count: 0, total: 0, color: "bg-orange-500" },
        { label: "31-60 dias", range: "31-60", minDays: 31, maxDays: 60, count: 0, total: 0, color: "bg-red-500" },
        { label: "61-90 dias", range: "61-90", minDays: 61, maxDays: 90, count: 0, total: 0, color: "bg-red-700" },
        { label: "90+ dias", range: "90+", minDays: 91, maxDays: 99999, count: 0, total: 0, color: "bg-red-900" },
      ];

      for (const inv of data || []) {
        const dueDate = new Date(inv.due_date);
        const days = differenceInDays(today, dueDate);
        const totalAmount = inv.amount + (inv.fine_amount || 0) + (inv.interest_amount || 0);

        for (const bucket of agingBuckets) {
          if (days >= bucket.minDays && days <= bucket.maxDays) {
            bucket.count++;
            bucket.total += totalAmount;
            break;
          }
        }
      }

      return agingBuckets;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 120000,
  });

  const totalOverdue = buckets?.reduce((acc, b) => acc + b.total, 0) || 0;
  const totalCount = buckets?.reduce((acc, b) => acc + b.count, 0) || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="h-4 w-4 text-status-danger" />
          Aging de Recebíveis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : totalCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma fatura vencida 🎉
          </p>
        ) : (
          <div className="space-y-2">
            {buckets?.filter(b => b.count > 0).map((bucket) => {
              const pct = totalOverdue > 0 ? (bucket.total / totalOverdue) * 100 : 0;
              return (
                <div key={bucket.range} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-muted-foreground">{bucket.label}</div>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${bucket.color} rounded-full transition-all`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <div className="text-right min-w-[100px]">
                    <span className="text-xs font-medium">{formatCurrency(bucket.total)}</span>
                    <Badge variant="outline" className="ml-1 text-[10px] px-1">
                      {bucket.count}
                    </Badge>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 border-t text-sm font-medium">
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-status-danger" />
                Total Vencido
              </span>
              <span className="text-status-danger">{formatCurrency(totalOverdue)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
