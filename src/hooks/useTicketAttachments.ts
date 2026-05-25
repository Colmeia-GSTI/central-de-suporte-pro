import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

export type AttachmentInfo = {
  name: string;
  url: string;
  size: number;
  type: string;
  path: string;
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = "image/*,.pdf,.txt,.log,.zip,.doc,.docx,.xls,.xlsx";

/**
 * Fonte única de anexos de chamado — usada pelo operador (TicketCommentsTab)
 * e pelo portal do cliente (NewTicketDialog / ClientTicketDetailPanel).
 * Encapsula seleção, validação (10MB), colagem (Ctrl+V) e upload pro bucket
 * `ticket-attachments`. Mantém pendingFiles em estado e expõe uploadPending().
 */
export function useTicketAttachments() {
  const { toast } = useToast();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback(
    (files: File[]) => {
      const valid = files.filter((f) => {
        if (f.size > MAX_BYTES) {
          toast({ title: `"${f.name}" excede 10MB`, variant: "destructive" });
          return false;
        }
        return true;
      });
      if (valid.length) setPendingFiles((prev) => [...prev, ...valid]);
    },
    [toast],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files || []));
      e.target.value = "";
    },
    [addFiles],
  );

  /** Cola imagem do clipboard (Ctrl+V / print screen). Renomeia para nome legível. */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const images = items.filter((it) => it.type.startsWith("image/"));
      if (images.length === 0) return;
      e.preventDefault();
      const files: File[] = [];
      for (const it of images) {
        const blob = it.getAsFile();
        if (!blob) continue;
        const ext = it.type.split("/")[1] || "png";
        files.push(
          new File([blob], `colado-${Date.now()}.${ext}`, { type: it.type }),
        );
      }
      addFiles(files);
    },
    [addFiles],
  );

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setPendingFiles([]), []);

  /** Faz upload dos pendentes e retorna os metadados. Não lança em falha de 1 arquivo. */
  const uploadPending = useCallback(
    async (ticketId: string): Promise<AttachmentInfo[]> => {
      if (pendingFiles.length === 0) return [];
      setIsUploading(true);
      try {
        const attachments: AttachmentInfo[] = [];
        for (const file of pendingFiles) {
          const ext = file.name.split(".").pop();
          const path = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("ticket-attachments")
            .upload(path, file, { upsert: false });
          if (uploadError) {
            logger.warn("File upload failed", "Tickets", { error: uploadError.message, file: file.name });
            toast({ title: `Falha ao enviar "${file.name}"`, variant: "destructive" });
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
        return attachments;
      } finally {
        setIsUploading(false);
      }
    },
    [pendingFiles, toast],
  );

  return {
    pendingFiles,
    isUploading,
    accept: ACCEPT,
    addFiles,
    handleFileSelect,
    handlePaste,
    removeFile,
    clear,
    uploadPending,
  };
}
