import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Paperclip, X as XIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useTicketAttachments, type AttachmentInfo } from "@/hooks/useTicketAttachments";
import { type PortalTicket, statusLabels, statusColors } from "./portal-types";

interface Props {
  ticket: PortalTicket | undefined;
  currentUserId: string | undefined;
}

type PortalComment = {
  id: string;
  ticket_id: string;
  user_id: string | null;
  content: string;
  is_internal: boolean;
  attachments?: AttachmentInfo[] | null;
  created_at: string;
  user_full_name?: string | null;
};

export function ClientTicketDetailPanel({ ticket, currentUserId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const { pendingFiles, accept, handleFileSelect, handlePaste, removeFile, addFiles, clear: clearFiles, uploadPending } =
    useTicketAttachments();

  const { data: comments = [] } = useQuery({
    queryKey: ["ticket-comments", ticket?.id],
    enabled: !!ticket?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("id, ticket_id, user_id, content, is_internal, attachments, created_at")
        .eq("ticket_id", ticket!.id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as PortalComment[];
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
    mutationFn: async ({ ticketId, text }: { ticketId: string; text: string }) => {
      const attachments = await uploadPending(ticketId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("ticket_comments") as any).insert({
        ticket_id: ticketId,
        user_id: currentUserId,
        content: text,
        is_internal: false,
        attachments: attachments.length > 0 ? attachments : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      setContent("");
      clearFiles();
      toast({ title: "Comentário adicionado" });
    },
    onError: (error: Error) => {
      console.error("[AddComment] Falha:", error);
      toast({ title: "Erro ao enviar comentário", description: "Tente novamente.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const text = content.trim();
    if ((!text && pendingFiles.length === 0) || !ticket) return;
    addComment.mutate({ ticketId: ticket.id, text });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) addFiles(files);
  };

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

  const canReply = !["resolved", "closed"].includes(ticket.status);

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
              {c.content && <p className="text-sm whitespace-pre-wrap">{c.content}</p>}
              {c.attachments && c.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.attachments.map((att, i) =>
                    att.type.startsWith("image/") ? (
                      <a key={i} href={att.url} target="_blank" rel="noreferrer" className="block">
                        <img src={att.url} alt={att.name} className="max-h-32 rounded border object-cover" />
                      </a>
                    ) : (
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-background/50 text-xs hover:underline"
                      >
                        <FileText className="h-3 w-3" />
                        {att.name}
                      </a>
                    ),
                  )}
                </div>
              )}
              <p className="text-xs opacity-70 mt-1">{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</p>
            </div>
          );
        })}
      </CardContent>
      {canReply && (
        <div
          className={`border-t p-4 space-y-2 transition-colors ${isDragging ? "ring-2 ring-primary ring-inset bg-primary/5" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded border bg-muted text-xs">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive ml-0.5" aria-label="Remover arquivo">
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Digite sua mensagem... (cole uma imagem com Ctrl+V ou arraste arquivos)"
            rows={2}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="cursor-pointer">
              <input type="file" multiple accept={accept} className="hidden" onChange={handleFileSelect} />
              <span className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent transition-colors" title="Anexar arquivo (máx. 10MB)">
                <Paperclip className="h-3 w-3" />
                Anexar
                {pendingFiles.length > 0 && (
                  <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                    {pendingFiles.length}
                  </span>
                )}
              </span>
            </label>
            <Button onClick={handleSubmit} disabled={(!content.trim() && pendingFiles.length === 0) || addComment.isPending} size="sm">
              {addComment.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
