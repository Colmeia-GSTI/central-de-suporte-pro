import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Copy,
  Filter,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ApplicationLog {
  id: string;
  user_id: string | null;
  level: string;
  module: string;
  action: string | null;
  message: string;
  context: Record<string, unknown> | null;
  error_details: { message?: string; stack?: string; code?: string } | null;
  execution_id: string | null;
  duration_ms: number | null;
  created_at: string;
}

const levelConfig: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    className: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    label: "Erro",
  },
  warn: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
    label: "Alerta",
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    label: "Info",
  },
  debug: {
    icon: <Bug className="h-4 w-4" />,
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    label: "Debug",
  },
};

const moduleLabels: Record<string, string> = {
  Billing: "Faturamento",
  Payment: "Pagamentos",
  Nfse: "NFS-e",
  Integration: "Integrações",
  Auth: "Autenticação",
  General: "Geral",
};

export function LogsViewerTab() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<ApplicationLog | null>(null);

  const { data: logs = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["application-logs", search, levelFilter, moduleFilter],
    queryFn: async () => {
      let query = supabase
        .from("application_logs")
        .select("id, level, module, action, message, execution_id, duration_ms, created_at, context, error_details")
        .order("created_at", { ascending: false })
        .limit(100);

      if (levelFilter !== "all") {
        query = query.eq("level", levelFilter);
      }

      if (moduleFilter !== "all") {
        query = query.eq("module", moduleFilter);
      }

      if (search) {
        query = query.or(`message.ilike.%${search}%,action.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ApplicationLog[];
    },
  });

  const handleExportLogs = () => {
    if (logs.length === 0) {
      toast.error("Nenhum log para exportar");
      return;
    }

    const csvContent = [
      ["Data/Hora", "Nível", "Módulo", "Ação", "Mensagem", "Execution ID", "Duração (ms)"].join(";"),
      ...logs.map((log) =>
        [
          format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss"),
          log.level,
          log.module,
          log.action || "",
          log.message.replace(/;/g, ","),
          log.execution_id || "",
          log.duration_ms?.toString() || "",
        ].join(";")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `logs_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`;
    link.click();

    toast.success("Logs exportados com sucesso!");
  };

  const handleCopyDetails = (log: ApplicationLog) => {
    const details = JSON.stringify(
      {
        message: log.message,
        context: log.context,
        error_details: log.error_details,
        execution_id: log.execution_id,
        created_at: log.created_at,
      },
      null,
      2
    );
    navigator.clipboard.writeText(details);
    toast.success("Detalhes copiados para a área de transferência");
  };

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Logs da Aplicação</h3>
        <p className="text-sm text-muted-foreground">
          Visualize e monitore logs de operações do sistema
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Logs</p>
                <p className="text-2xl font-bold">{logs.length}</p>
              </div>
              <Info className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Erros</p>
                <p className="text-2xl font-bold text-destructive">{errorCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Alertas</p>
                <p className="text-2xl font-bold text-warning">{warnCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Módulos</p>
                <p className="text-2xl font-bold">
                  {new Set(logs.map((l) => l.module)).size}
                </p>
              </div>
              <Filter className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Filtros</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportLogs}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar mensagem ou ação..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Níveis</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="warn">Alerta</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>

            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Módulos</SelectItem>
                <SelectItem value="Billing">Faturamento</SelectItem>
                <SelectItem value="Payment">Pagamentos</SelectItem>
                <SelectItem value="Nfse">NFS-e</SelectItem>
                <SelectItem value="Integration">Integrações</SelectItem>
                <SelectItem value="Auth">Autenticação</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Carregando logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum log encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Data/Hora</TableHead>
                  <TableHead className="w-[100px]">Nível</TableHead>
                  <TableHead className="w-[120px]">Módulo</TableHead>
                  <TableHead className="w-[150px]">Ação</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-[80px]">Duração</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const config = levelConfig[log.level] || levelConfig.info;
                  return (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`flex items-center gap-1 w-fit ${config.className}`}
                        >
                          {config.icon}
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{moduleLabels[log.module] || log.module}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono text-muted-foreground">
                          {log.action || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm line-clamp-1">{log.message}</span>
                      </TableCell>
                      <TableCell>
                        {log.duration_ms ? (
                          <span className="text-sm font-mono">{log.duration_ms}ms</span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyDetails(log);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog && levelConfig[selectedLog.level]?.icon}
              Detalhes do Log
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Data/Hora</p>
                  <p className="font-mono">
                    {format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Módulo</p>
                  <p>{moduleLabels[selectedLog.module] || selectedLog.module}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ação</p>
                  <p className="font-mono">{selectedLog.action || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Duração</p>
                  <p className="font-mono">{selectedLog.duration_ms ? `${selectedLog.duration_ms}ms` : "-"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Mensagem</p>
                <p className="p-3 bg-muted rounded-md">{selectedLog.message}</p>
              </div>

              {selectedLog.execution_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Execution ID</p>
                  <p className="font-mono text-sm p-2 bg-muted rounded">{selectedLog.execution_id}</p>
                </div>
              )}

              {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Contexto</p>
                  <ScrollArea className="h-[150px]">
                    <pre className="text-xs font-mono p-3 bg-muted rounded-md overflow-x-auto">
                      {JSON.stringify(selectedLog.context, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {selectedLog.error_details && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">Detalhes do Erro</p>
                  <ScrollArea className="h-[150px]">
                    <pre className="text-xs font-mono p-3 bg-destructive/10 rounded-md text-destructive overflow-x-auto">
                      {JSON.stringify(selectedLog.error_details, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleCopyDetails(selectedLog)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Detalhes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
