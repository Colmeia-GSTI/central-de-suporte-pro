import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Send, Mail, CheckCheck, Check, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MessageLog {
  id: string;
  user_id: string;
  channel: "email" | "whatsapp" | "telegram";
  recipient: string;
  message: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error_message: string | null;
  related_type: string | null;
  related_id: string | null;
  external_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

const channelIcons = {
  email: Mail,
  whatsapp: MessageCircle,
  telegram: Send,
};

const channelColors = {
  email: "text-warning",
  whatsapp: "text-success",
  telegram: "text-info",
};

const statusConfig = {
  pending: { label: "Pendente", icon: Clock, variant: "secondary" as const },
  sent: { label: "Enviado", icon: Check, variant: "default" as const },
  delivered: { label: "Entregue", icon: CheckCheck, variant: "default" as const },
  read: { label: "Lido", icon: CheckCheck, variant: "outline" as const },
  failed: { label: "Falhou", icon: X, variant: "destructive" as const },
};

export function MessageLogsTab() {
  const { user, isAdmin } = useAuth();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["message-logs", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("message_logs")
        .select("id, user_id, channel, recipient, message, status, error_message, related_type, related_id, external_message_id, sent_at, delivered_at, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as MessageLog[];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Histórico de Mensagens</h3>
        <p className="text-sm text-muted-foreground">
          Visualize o histórico de mensagens enviadas por WhatsApp, Telegram e Email
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Mensagens Enviadas
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? "Visualizando todas as mensagens do sistema"
              : "Visualizando suas mensagens"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhuma mensagem enviada ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead className="max-w-[300px]">Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const ChannelIcon = channelIcons[log.channel];
                  const status = statusConfig[log.status];
                  const StatusIcon = status.icon;

                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ChannelIcon
                            className={`h-4 w-4 ${channelColors[log.channel]}`}
                          />
                          <span className="capitalize">{log.channel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.recipient}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {log.message}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={status.variant}
                          className="flex items-center gap-1 w-fit"
                        >
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        {log.error_message && (
                          <p className="text-xs text-destructive mt-1">
                            {log.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                        {log.read_at && (
                          <div className="text-xs text-success">
                            Lido:{" "}
                            {format(new Date(log.read_at), "HH:mm", {
                              locale: ptBR,
                            })}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
