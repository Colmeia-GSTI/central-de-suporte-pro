import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Copy } from "lucide-react";
import type { AuditLogRecord } from "@/hooks/useAuditLogs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { MouseEvent } from "react";

interface Props {
  log: AuditLogRecord;
  onView: (log: AuditLogRecord) => void;
}

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

export function AuditLogRow({ log, onView }: Props) {
  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!log.record_id) return;
    try {
      await navigator.clipboard.writeText(log.record_id);
      toast.success("ID copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <TableRow>
      <TableCell className="text-xs whitespace-nowrap">
        {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
      </TableCell>
      <TableCell className="font-mono text-xs">{log.table_name}</TableCell>
      <TableCell>
        <Badge variant={ACTION_VARIANT[log.action] ?? "outline"}>{log.action}</Badge>
      </TableCell>
      <TableCell className="text-sm">
        {log.user_name || log.user_email || <span className="text-muted-foreground italic">Sistema</span>}
      </TableCell>
      <TableCell className="font-mono text-xs hidden md:table-cell max-w-[200px]">
        {log.record_id ? (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate block flex-1 cursor-help">{log.record_id}</span>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">{log.record_id}</span>
              </TooltipContent>
            </Tooltip>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleCopy} aria-label="Copiar ID">
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="ghost" onClick={() => onView(log)} aria-label="Ver detalhes">
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
