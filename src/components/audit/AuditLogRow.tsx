import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import type { AuditLogRecord } from "@/hooks/useAuditLogs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
      <TableCell className="font-mono text-xs hidden md:table-cell max-w-[180px] truncate">
        {log.record_id || "—"}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="ghost" onClick={() => onView(log)} aria-label="Ver detalhes">
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
