import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { type PortalTicket, statusLabels, statusColors } from "./portal-types";

interface Props {
  ticket: PortalTicket | undefined;
  currentUserId: string | undefined;
}

export function ClientTicketDetailPanel({ ticket, currentUserId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: comments = [] } = useQuery({
    queryKey: ["ticket-comments", ticket?.id],
    enabled: !!ticket?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("id, ticket_id, user_id, content, is_internal, created_at")
        .eq("ticket_id", ticket!.id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      const nameMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        profiles?.forEach((p) => nameMap.set(p.user_id, p.full_name));
      }
      return rows.map((r) => ({ ...r, user_full_name: r.user_id ? nameMap.get(r.user_id) ?? null : null }));
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        user_id: currentUserId,
        content,
        is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      toast({ title: "Comentário adicionado" });
    },
    onError: (error: Error) => {
      console.error("[AddComment] Falha:", error);
      toast({ title: "Erro ao enviar comentário", description: "Tente novamente.", variant: "destructive" });
    },
  });

  if (!ticket) {
    return (
      <Card className="h-[600px] flex flex-col">
        <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Selecione um chamado para ver os detalhes</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">#{ticket.ticket_number}</CardTitle>
            <CardDescription className="mt-1">{ticket.title}</CardDescription>
          </div>
          <Badge className={statusColors[ticket.status]}>{statusLabels[ticket.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-sm">{ticket.description}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </div>
        {comments.map((c) => {
          const isOwn = c.user_id === currentUserId;
          const sender = isOwn ? "Você" : c.user_full_name || "Equipe de Suporte";
          return (
            <div key={c.id} className={`p-3 rounded-lg ${isOwn ? "bg-primary text-primary-foreground ml-8" : "bg-muted mr-8"}`}>
              <p className="text-xs font-semibold mb-1 opacity-80">{sender}</p>
              <p className="text-sm">{c.content}</p>
              <p className="text-xs opacity-70 mt-1">{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</p>
            </div>
          );
        })}
      </CardContent>
      {!["resolved", "closed"].includes(ticket.status) && (
        <div className="border-t p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const content = (fd.get("content") as string)?.trim();
              if (!content) return;
              addComment.mutate({ ticketId: ticket.id, content });
              e.currentTarget.reset();
            }}
            className="flex gap-2"
          >
            <Input name="content" placeholder="Digite sua mensagem..." required />
            <Button type="submit" size="icon" disabled={addComment.isPending} aria-label="Enviar comentário">
              <MessageSquare className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
