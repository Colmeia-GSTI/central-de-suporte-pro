import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ExportButton } from "@/components/export/ExportButton";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 15;

const STATUS_MAP: Record<string, { label: string; variant: "warning" | "destructive" | "success" | "info" | "secondary" }> = {
  em_aberto: { label: "Em Aberto", variant: "warning" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  pago: { label: "Pago", variant: "success" },
  renegociado: { label: "Renegociado", variant: "info" },
  perdido: { label: "Perdido", variant: "secondary" },
};

const EXPORT_COLUMNS = [
  { key: "invoice_number" as const, label: "Nº Fatura" },
  { key: "client_name" as const, label: "Cliente" },
  { key: "amount" as const, label: "Valor" },
  { key: "due_date" as const, label: "Vencimento" },
  { key: "days_overdue" as const, label: "Dias Atraso" },
  { key: "ar_status" as const, label: "Status" },
  { key: "paid_date" as const, label: "Dt. Pagamento" },
  { key: "paid_amount" as const, label: "Valor Pago" },
];

export function AccountsReceivableTab() {
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [clientFilter, setClientFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("id, invoice_number, client_name, amount, due_date, days_overdue, ar_status, paid_date, paid_amount")
        .order("due_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const clients = useMemo(() => {
    if (!rawData) return [];
    const unique = [...new Set(rawData.map((r) => r.client_name).filter(Boolean))] as string[];
    return unique.sort();
  }, [rawData]);

  const filtered = useMemo(() => {
    if (!rawData) return [];
    let list = rawData;

    if (statusFilter !== "todos") {
      list = list.filter((r) => r.ar_status === statusFilter);
    }
    if (clientFilter !== "todos") {
      list = list.filter((r) => r.client_name === clientFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.client_name?.toLowerCase().includes(q) ||
          String(r.invoice_number).includes(q)
      );
    }
    return list;
  }, [rawData, statusFilter, clientFilter, search]);

  const summary = useMemo(() => {
    const em_aberto = filtered
      .filter((r) => r.ar_status === "em_aberto")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const atrasado = filtered
      .filter((r) => r.ar_status === "atrasado")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const pago = filtered
      .filter((r) => r.ar_status === "pago")
      .reduce((s, r) => s + Number(r.paid_amount ?? r.amount ?? 0), 0);
    return { em_aberto, atrasado, pago };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
  };

  const renderBadge = (status: string | null) => {
    const s = STATUS_MAP[status ?? ""] ?? { label: status ?? "—", variant: "secondary" as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[160px]">
          <CardContent className="p-3 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">Em Aberto</p>
              <p className="font-semibold text-sm">{formatCurrency(summary.em_aberto)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Atrasado</p>
              <p className="font-semibold text-sm">{formatCurrency(summary.atrasado)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[160px]">
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Pago</p>
              <p className="font-semibold text-sm">{formatCurrency(summary.pago)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou nº fatura..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Status</SelectItem>
            <SelectItem value="em_aberto">Em Aberto</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="renegociado">Renegociado</SelectItem>
            <SelectItem value="perdido">Perdido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ExportButton data={filtered} filename="contas-a-receber" columns={EXPORT_COLUMNS} />
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Fatura</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Dias Atraso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dt. Pagamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">#{row.invoice_number}</TableCell>
                  <TableCell>{row.client_name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(row.amount ?? 0))}</TableCell>
                  <TableCell>{formatDate(row.due_date)}</TableCell>
                  <TableCell className="text-right">{row.days_overdue ?? 0}</TableCell>
                  <TableCell>{renderBadge(row.ar_status)}</TableCell>
                  <TableCell>{formatDate(row.paid_date)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {paginated.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado</p>
        ) : (
          paginated.map((row) => (
            <Card key={row.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">#{row.invoice_number}</p>
                    <p className="text-sm text-muted-foreground">{row.client_name}</p>
                  </div>
                  {renderBadge(row.ar_status)}
                </div>
                <div className="flex justify-between text-sm">
                  <span>Valor: {formatCurrency(Number(row.amount ?? 0))}</span>
                  <span>Venc: {formatDate(row.due_date)}</span>
                </div>
                {(row.days_overdue ?? 0) > 0 && (
                  <p className="text-xs text-destructive">{row.days_overdue} dias em atraso</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const n = start + i;
              if (n > totalPages) return null;
              return (
                <PaginationItem key={n}>
                  <PaginationLink isActive={n === page} onClick={() => setPage(n)} className="cursor-pointer">
                    {n}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} registro(s) encontrado(s)
      </p>
    </div>
  );
}
