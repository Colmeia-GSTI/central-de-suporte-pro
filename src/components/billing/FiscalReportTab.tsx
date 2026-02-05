import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/currency";
import { FiscalReportExport } from "./FiscalReportExport";

export function FiscalReportTab() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const { data: nfseList = [], isLoading } = useQuery({
    queryKey: ["fiscal-report", selectedMonth],
    queryFn: async () => {
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from("nfse_history")
        .select("id, numero_nfse, status, valor_servico, valor_iss, valor_pis, valor_cofins, valor_csll, valor_irrf, valor_inss, valor_liquido, data_emissao, client_id, clients(name)")
        .gte("data_emissao", startDate)
        .lte("data_emissao", endDate)
        .in("status", ["autorizada", "cancelada"])
        .order("data_emissao", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const authorized = nfseList.filter((n: any) => n.status === "autorizada");
  const cancelled = nfseList.filter((n: any) => n.status === "cancelada");

  const sumField = (list: any[], field: string) =>
    list.reduce((acc, n) => acc + Number(n[field] || 0), 0);

  const summary = {
    totalEmitidas: authorized.length,
    totalCanceladas: cancelled.length,
    valorServicos: sumField(authorized, "valor_servico"),
    valorIss: sumField(authorized, "valor_iss"),
    valorPis: sumField(authorized, "valor_pis"),
    valorCofins: sumField(authorized, "valor_cofins"),
    valorCsll: sumField(authorized, "valor_csll"),
    valorIrrf: sumField(authorized, "valor_irrf"),
    valorInss: sumField(authorized, "valor_inss"),
    valorLiquido: sumField(authorized, "valor_liquido"),
  };

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    };
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FiscalReportExport data={nfseList} month={selectedMonth} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-status-success" />
              NFS-e Emitidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalEmitidas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-status-danger" />
              NFS-e Canceladas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalCanceladas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Total Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.valorServicos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Líquido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-status-success">{formatCurrency(summary.valorLiquido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tax Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de Impostos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "ISS", value: summary.valorIss },
                { label: "PIS", value: summary.valorPis },
                { label: "COFINS", value: summary.valorCofins },
                { label: "CSLL", value: summary.valorCsll },
                { label: "IRRF", value: summary.valorIrrf },
                { label: "INSS", value: summary.valorInss },
              ].map((tax) => (
                <div key={tax.label} className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">{tax.label}</p>
                  <p className="text-sm font-bold">{formatCurrency(tax.value)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Detalhamento NFS-e
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : nfseList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma NFS-e no período selecionado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor Serviço</TableHead>
                  <TableHead>ISS</TableHead>
                  <TableHead>Valor Líquido</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nfseList.map((nfse: any) => (
                  <TableRow key={nfse.id}>
                    <TableCell className="font-mono">
                      {nfse.numero_nfse || "—"}
                    </TableCell>
                    <TableCell>
                      {nfse.data_emissao
                        ? format(new Date(nfse.data_emissao), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell>{(nfse.clients as any)?.name || "—"}</TableCell>
                    <TableCell>{formatCurrency(Number(nfse.valor_servico || 0))}</TableCell>
                    <TableCell>{formatCurrency(Number(nfse.valor_iss || 0))}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(Number(nfse.valor_liquido || 0))}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          nfse.status === "autorizada"
                            ? "bg-status-success/20 text-status-success border-status-success/30"
                            : "bg-status-danger/20 text-status-danger border-status-danger/30"
                        }
                      >
                        {nfse.status === "autorizada" ? "Autorizada" : "Cancelada"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
