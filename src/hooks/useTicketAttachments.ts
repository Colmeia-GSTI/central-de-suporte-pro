import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

export type AttachmentInfo = {
  name: string;
  /** Caminho completo com prefixo do bucket: `ticket-attachments/{ticketId}/{file}`.
   *  Usado por src/lib/storage-utils.ts (getSignedUrl/openStorageFileSafe). */
  path: string;
  size: number;
  type: string;
};

const BUCKET = "ticket-attachments";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = "image/*,application/pdf,.txt,.log,.csv,.zip,.doc,.docx,.xls,.xlsx";

const ALLOWED_PREFIXES = ["image/", "application/pdf", "text/"];
const ALLOWED_EXACT = [
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function isAllowed(type: string): boolean {
  if (!type) return true; // alguns .log/.csv vêm sem MIME — extensão já filtra no input
  return ALLOWED_PREFIXES.some((p) => type.startsWith(p)) || ALLOWED_EXACT.includes(type);
}

/**
 * Fonte única de anexos de chamado — usada pelo operador (TicketCommentsTab)
 * e pelo portal do cliente (ClientTicketDetailPanel / ClientTicketForm).
 * Encapsula seleção, validação (10MB + tipos), colagem (Ctrl+V) e upload pro
 * bucket privado `ticket-attachments`. Armazena apenas o `path`; a exibição usa
 * signed URLs via src/lib/storage-utils.ts (bucket é privado).
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
        if (!isAllowed(f.type)) {
          toast({ title: `Tipo não permitido: "${f.name}"`, variant: "destructive" });
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

  /** Cola imagem do clipboard (Ctrl+V / print screen). */
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
        files.push(new File([blob], `colado-${Date.now()}.${ext}`, { type: it.type }));
      }
      addFiles(files);
    },
    [addFiles],
  );

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setPendingFiles([]), []);

  /** Sobe os pendentes e retorna metadados (com `path` prefixado). Não lança em falha de 1 arquivo. */
  const uploadPending = useCallback(
    async (ticketId: string): Promise<AttachmentInfo[]> => {
      if (pendingFiles.length === 0) return [];
      setIsUploading(true);
      try {
        const attachments: AttachmentInfo[] = [];
        for (const file of pendingFiles) {
          const ext = file.name.split(".").pop();
          const objectPath = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(objectPath, file, { upsert: false });
          if (uploadError) {
            logger.warn("File upload failed", "Tickets", { error: uploadError.message, file: file.name });
            toast({ title: `Falha ao enviar "${file.name}"`, variant: "destructive" });
            continue;
          }
          attachments.push({
            name: file.name,
            path: `${BUCKET}/${uploadData.path}`,
            size: file.size,
            type: file.type,
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
