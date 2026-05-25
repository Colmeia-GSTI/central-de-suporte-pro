import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getSignedUrl, openStorageFileSafe } from "@/lib/storage-utils";
import type { AttachmentInfo } from "@/hooks/useTicketAttachments";

/** Miniatura de imagem que resolve a signed URL on-demand (bucket privado). */
function ImageThumb({ att }: { att: AttachmentInfo }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSignedUrl(att.path, 3600)
      .then((u) => active && setUrl(u))
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [att.path]);

  if (!url) {
    return <div className="h-24 w-24 rounded border bg-muted animate-pulse" aria-label={att.name} />;
  }
  return (
    <button type="button" onClick={() => openStorageFileSafe(att.path, att.name)} className="block" title={att.name}>
      <img src={url} alt={att.name} className="max-h-32 rounded border object-cover" />
    </button>
  );
}

/** Lista de anexos reutilizável (operador + portal). Imagens viram thumbnail; demais, chip clicável. */
export function TicketAttachmentList({ attachments }: { attachments: AttachmentInfo[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((att, i) =>
        att.type.startsWith("image/") ? (
          <ImageThumb key={i} att={att} />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => openStorageFileSafe(att.path, att.name)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-background/50 text-xs hover:underline"
          >
            <FileText className="h-3 w-3" />
            {att.name}
          </button>
        ),
      )}
    </div>
  );
}
