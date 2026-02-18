import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Resolve a stored file path into bucket + object path.
 * Returns null for external URLs (http/https) which should be opened directly.
 */
function resolveStoragePath(storedPath: string): { bucket: string; path: string } | null {
  if (storedPath.startsWith("http://") || storedPath.startsWith("https://")) {
    return null;
  }

  if (storedPath.startsWith("nfse-files/")) {
    return { bucket: "nfse-files", path: storedPath.replace("nfse-files/", "") };
  }

  if (storedPath.startsWith("nfse/")) {
    return { bucket: "nfse-files", path: storedPath };
  }

  if (storedPath.startsWith("invoice-documents/")) {
    return { bucket: "invoice-documents", path: storedPath.replace("invoice-documents/", "") };
  }

  // Default: treat as nfse-files bucket
  return { bucket: "nfse-files", path: storedPath };
}

/**
 * Download a file from Storage as a blob and open it in a new tab.
 *
 * Strategy: open a blank window IMMEDIATELY (in the click handler context)
 * so the browser doesn't block it as a popup. Then download the file and
 * replace the blank page with the blob content.
 *
 * For external URLs (http/https), falls back to window.open directly.
 */
export async function openStorageFile(storedPath: string): Promise<void> {
  const resolved = resolveStoragePath(storedPath);

  // External URL — just open it
  if (!resolved) {
    window.open(storedPath, "_blank");
    return;
  }

  // Pre-open the tab synchronously (avoids popup blocker)
  const newTab = window.open("about:blank", "_blank");

  // Show a loading message while downloading
  if (newTab) {
    newTab.document.title = "Carregando documento...";
    newTab.document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;">' +
      '<p style="font-size:18px;">⏳ Carregando documento…</p></div>';
  }

  const { bucket, path } = resolved;

  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error || !data) {
      throw new Error(error?.message || "Falha ao baixar arquivo");
    }

    const blobUrl = URL.createObjectURL(data);

    if (newTab && !newTab.closed) {
      newTab.location.href = blobUrl;
    } else {
      // Fallback: invisible anchor click
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }

    // Revoke after a delay to allow the browser to finish loading
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
  } catch (err) {
    if (newTab && !newTab.closed) {
      newTab.close();
    }
    throw err;
  }
}

/**
 * Convenience wrapper that catches errors and shows a toast.
 */
export async function openStorageFileSafe(storedPath: string, label = "arquivo"): Promise<void> {
  try {
    await openStorageFile(storedPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    toast.error(`Erro ao abrir ${label}`, { description: msg });
  }
}
