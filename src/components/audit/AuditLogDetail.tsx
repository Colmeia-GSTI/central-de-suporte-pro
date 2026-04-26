import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy } from "lucide-react";
import { AuditLogDiff } from "./AuditLogDiff";
import type { AuditLogRecord } from "@/hooks/useAuditLogs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  log: AuditLogRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogDetail({ log, open, onOpenChange }: Props) {
  const handleCopy = async () => {
    if (!log?.record_id) return;
    try {
      await navigator.clipboard.writeText(log.record_id);
      toast.success("ID copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

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
                {log.record_id ? (
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="font-mono text-xs truncate flex-1 cursor-help">{log.record_id}</p>
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
                  <p className="font-mono text-xs">—</p>
                )}
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
