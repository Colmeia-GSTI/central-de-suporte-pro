import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";

interface Props {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_LABEL: Record<string, string> = {
  invoice_created: "Criação",
  payment_reminder: "Lembrete",
  payment_resend: "Reenvio",
  batch_collection: "Cobrança em lote",
  nfse: "NFS-e",
};

export function InvoiceNotificationHistory({ invoiceId, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-notif-logs", invoiceId],
    enabled: open && !!invoiceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_notification_logs")
        .select("id, sent_at, channel, notification_type, success, error_message, recipient")
        .eq("invoice_id", invoiceId!)
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico de Notificações</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-10 w-10 mb-2" aria-hidden />
              <p>Nenhuma notificação enviada ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Destinatário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {log.sent_at ? format(new Date(log.sent_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                    </TableCell>
                    <TableCell><Badge variant="outline">{log.channel}</Badge></TableCell>
                    <TableCell className="text-xs">{TYPE_LABEL[log.notification_type] ?? log.notification_type}</TableCell>
                    <TableCell>
                      <Badge variant={log.success ? "default" : "destructive"}>
                        {log.success ? "Enviado" : "Falhou"}
                      </Badge>
                      {!log.success && log.error_message && (
                        <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={log.error_message}>{log.error_message}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[180px]">{log.recipient ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
