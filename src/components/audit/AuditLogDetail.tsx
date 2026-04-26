import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AuditLogDiff } from "./AuditLogDiff";
import type { AuditLogRecord } from "@/hooks/useAuditLogs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  log: AuditLogRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogDetail({ log, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{log?.action}</Badge>
            <span className="font-mono text-sm">{log?.table_name}</span>
          </SheetTitle>
          <SheetDescription>
            {log
              ? `Registrado em ${format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {log && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Usuário</p>
                <p className="font-medium">{log.user_name || log.user_email || "Sistema"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Registro</p>
                <p className="font-mono text-xs break-all">{log.record_id || "—"}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Alterações</h3>
              <AuditLogDiff oldData={log.old_data} newData={log.new_data} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
