import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { User, Lock, Zap, Search, Paperclip, X as XIcon, FileText, Image as ImageIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";

interface TicketCommentsTabProps {
  ticketId: string;
  ticketCreatedBy?: string | null;
}

export function TicketCommentsTab({ ticketId, ticketCreatedBy }: TicketCommentsTabProps) {
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [macroSearch, setMacroSearch] = useState("");
  const [macroPopoverOpen, setMacroPopoverOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const debouncedMacroSearch = useDebounce(macroSearch, 200);

  // Fetch macros for quick replies
  const { data: macros = [] } = useQuery({
    queryKey: ["ticket-macros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_macros")
        .select("id, name, shortcut, content, is_internal")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filteredMacros = debouncedMacroSearch
    ? macros.filter((m) =>
        m.name.toLowerCase().includes(debouncedMacroSearch.toLowerCase()) ||
        (m.shortcut && m.shortcut.toLowerCase().includes(debouncedMacroSearch.toLowerCase()))
      )
    : macros;

  const handleApplyMacro = (macro: { content: string; is_internal: boolean }) => {
    setComment(macro.content);
    setIsInternal(macro.is_internal);
    setMacroPopoverOpen(false);
    setMacroSearch("");
  };

  type AttachmentInfo = { name: string; url: string; size: number; type: string; path: string };

  type CommentWithProfile = {
    id: string;
    ticket_id: string;
    user_id: string | null;
    content: string;
    is_internal: boolean;
    attachments?: AttachmentInfo[] | null;
    created_at: string;
    user_full_name?: string | null;
  };

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["ticket-comments", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("id, ticket_id, user_id, content, is_internal, attachments, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = (data || []) as CommentWithProfile[];
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter(Boolean))
      ) as string[];

      const nameByUserId = new Map<string, string>();
      if (userIds.length) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        if (!profilesError && profilesData) {
          for (const p of profilesData as { user_id: string; full_name: string }[]) {
            nameByUserId.set(p.user_id, p.full_name);
          }
        }
      }

      return rows.map((r) => ({
        ...r,
        user_full_name: r.user_id ? nameByUserId.get(r.user_id) ?? null : null,
      }));
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ content, internal, files }: { content: string; internal: boolean; files: File[] }) => {
      // Upload files to Supabase Storage first (FALHA-05)
      const attachments: AttachmentInfo[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, file, { upsert: false });
        if (uploadError) {
          logger.warn("File upload failed", "Tickets", { error: uploadError.message, file: file.name });
          continue;
        }
        const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
        attachments.push({
          name: file.name,
          url: urlData.publicUrl,
          size: file.size,
          type: file.type,
          path: uploadData.path,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("ticket_comments") as any).insert({
        ticket_id: ticketId,
        content,
        user_id: user?.id,
        is_internal: internal,
        attachments: attachments.length > 0 ? attachments : [],
      });
      if (error) throw error;

      // Registrar no histórico
      const { error: historyError } = await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        user_id: user?.id,
        old_status: null,
        new_status: null,
        comment: internal ? "Comentário interno adicionado" : "Comentário adicionado",
      });
      if (historyError) {
        logger.warn("Failed to insert comment history", "Tickets", { error: historyError.message });
      }

      // Disparar notificação para cliente (apenas para comentários não internos)
      if (!internal) {
        supabase.functions.invoke("send-ticket-notification", {
          body: {
            ticket_id: ticketId,
            event_type: "commented",
            comment: content.substring(0, 200), // Limitar tamanho
          },
        }).catch((err) => logger.error("Failed to send notification", "Tickets", { error: String(err) }));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      setComment("");
      setIsInternal(false);
      setPendingFiles([]);
      toast({ title: "Comentário adicionado" });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar comentário", variant: "destructive" });
    },
  });

  const handleAddComment = () => {
    if (!comment.trim()) return;
    addCommentMutation.mutate({ content: comment, internal: isInternal, files: pendingFiles });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX = 10 * 1024 * 1024; // 10 MB
    const valid = files.filter((f) => {
      if (f.size > MAX) {
        toast({ title: `"${f.name}" excede 10MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-12 w-full bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comment List */}
      <div className="space-y-4 max-h-80 overflow-y-auto">
        {comments.map((c) => {
          const isRequester = ticketCreatedBy && c.user_id === ticketCreatedBy;
          return (
          <div key={c.id} className={`flex gap-3 ${isRequester ? "flex-row-reverse" : ""}`}>
            <Avatar className="h-8 w-8">
              <AvatarFallback className={isRequester ? "bg-accent" : ""}>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className={`flex-1 ${isRequester ? "text-right" : ""}`}>
              <div className={`flex items-center gap-2 ${isRequester ? "justify-end" : ""}`}>
                <span className="text-sm font-medium">
                  {c.user_full_name || "Usuário"}
                </span>
                <Badge variant={isRequester ? "outline" : "secondary"} className="text-[10px] h-4 px-1">
                  {isRequester ? "Solicitante" : "Equipe"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
                {c.is_internal && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Lock className="h-3 w-3" />
                    Interno
                  </Badge>
                )}
              </div>
              <p className={`text-sm mt-1 whitespace-pre-wrap p-3 rounded-lg ${
                isRequester
                  ? "bg-accent/50 border border-accent"
                  : "bg-muted/50"
              }`}>
                {c.content}
              </p>
              {/* Attachments display */}
              {(c as CommentWithProfile).attachments && (c as CommentWithProfile).attachments!.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(c as CommentWithProfile).attachments!.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background hover:bg-muted transition-colors text-xs"
                    >
                      {att.type.startsWith("image/") ? (
                        <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="max-w-[120px] truncate">{att.name}</span>
                      <span className="text-muted-foreground">
                        ({Math.round(att.size / 1024)}KB)
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum comentário ainda
          </p>
        )}
      </div>

      {/* Add Comment Form */}
      <div className="space-y-3 border-t pt-4">
        <Textarea
          placeholder="Adicione um comentário..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />

        {/* Pending files preview (FALHA-05) */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-1 rounded border bg-muted text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-muted-foreground hover:text-destructive ml-0.5"
                  aria-label="Remover arquivo"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="internal-comment"
                checked={isInternal}
                onCheckedChange={setIsInternal}
              />
              <Label htmlFor="internal-comment" className="text-sm flex items-center gap-1 cursor-pointer">
                <Lock className="h-3 w-3" />
                Comentário interno
              </Label>
            </div>

            {/* Attach file button (FALHA-05) */}
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.log,.zip,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <span
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Anexar arquivo (máx. 10MB por arquivo)"
              >
                <Paperclip className="h-3 w-3" />
                Anexar
                {pendingFiles.length > 0 && (
                  <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                    {pendingFiles.length}
                  </span>
                )}
              </span>
            </label>

            {/* Quick Replies / Macros */}
            {macros.length > 0 && (
              <Popover open={macroPopoverOpen} onOpenChange={setMacroPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                    <Zap className="h-3 w-3" />
                    Respostas Rápidas
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar resposta..."
                        value={macroSearch}
                        onChange={(e) => setMacroSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredMacros.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma resposta encontrada
                      </p>
                    ) : (
                      filteredMacros.map((macro) => (
                        <button
                          key={macro.id}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                          onClick={() => handleApplyMacro(macro)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{macro.name}</span>
                            {macro.shortcut && (
                              <span className="text-xs text-muted-foreground font-mono bg-muted px-1 rounded">
                                {macro.shortcut}
                              </span>
                            )}
                            {macro.is_internal && (
                              <Badge variant="secondary" className="text-[10px] h-4 gap-0.5 px-1">
                                <Lock className="h-2.5 w-2.5" />
                                Interno
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {macro.content}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <Button
            onClick={handleAddComment}
            disabled={!comment.trim() || addCommentMutation.isPending}
          >
            {addCommentMutation.isPending ? "Enviando..." : "Enviar Comentário"}
          </Button>
        </div>
      </div>
    </div>
  );
}
