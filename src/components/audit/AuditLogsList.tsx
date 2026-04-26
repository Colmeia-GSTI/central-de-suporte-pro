import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileSearch } from "lucide-react";
import { useAuditLogs, type AuditLogRecord } from "@/hooks/useAuditLogs";
import { useDebounce } from "@/hooks/useDebounce";
import { AuditLogFilters, type FiltersState } from "./AuditLogFilters";
import { AuditLogRow } from "./AuditLogRow";
import { AuditLogDetail } from "./AuditLogDetail";

const PAGE_SIZE = 50;

const INITIAL: FiltersState = {
  table: "all",
  action: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

export function AuditLogsList() {
  const [filters, setFilters] = useState<FiltersState>(INITIAL);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);

  const debouncedSearch = useDebounce(filters.search, 500);

  // Bug #5: ao trocar qualquer filtro, voltar para página 1 para evitar paginação inválida.
  useEffect(() => {
    setPage(1);
  }, [filters.table, filters.action, debouncedSearch, filters.dateFrom, filters.dateTo]);

  const queryFilters = useMemo(
    () => ({
      tables: filters.table !== "all" ? [filters.table] : undefined,
      actions: filters.action !== "all" ? [filters.action] : undefined,
      search: debouncedSearch,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [filters.table, filters.action, debouncedSearch, filters.dateFrom, filters.dateTo, page],
  );

  const { data, isLoading, error } = useAuditLogs(queryFilters);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onFiltersChange = (v: FiltersState) => {
    setFilters(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <AuditLogFilters value={filters} onChange={onFiltersChange} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive text-sm">
              Erro ao carregar trilha de auditoria.
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileSearch className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum registro encontrado para os filtros atuais.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tabela</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="hidden md:table-cell">Registro</TableHead>
                  <TableHead className="text-right">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((log) => (
                  <AuditLogRow key={log.id} log={log} onView={setSelected} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {totalPages} · {total} registros
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <AuditLogDetail log={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
