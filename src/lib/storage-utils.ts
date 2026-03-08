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

  if (storedPath.startsWith("ticket-attachments/")) {
    return { bucket: "ticket-attachments", path: storedPath.replace("ticket-attachments/", "") };
  }

  // Default: treat as nfse-files bucket
  return { bucket: "nfse-files", path: storedPath };
}

/**
 * Extract a friendly filename from a storage path.
 */
function extractFilename(storedPath: string, fallback: string): string {
  const parts = storedPath.split("/");
  const last = parts[parts.length - 1];
  return last || fallback;
}

/**
 * Generate a signed URL for a storage file.
 * Returns the signed HTTPS URL or throws on error.
 */
export async function getSignedUrl(storedPath: string, expiresIn = 3600): Promise<string> {
  const resolved = resolveStoragePath(storedPath);

  if (!resolved) {
    // Already an external URL
    return storedPath;
  }

  const { bucket, path } = resolved;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Falha ao gerar URL assinada");
  }

  return data.signedUrl;
}

/**
 * Download a file from Storage and trigger a browser download (save to disk).
 * Uses blob approach for "Save As" behavior; falls back to signed URL if blob fails.
 */
export async function downloadStorageFile(storedPath: string, friendlyName?: string): Promise<void> {
  const resolved = resolveStoragePath(storedPath);

  // External URL — just open it
  if (!resolved) {
    window.open(storedPath, "_blank");
    return;
  }

  const { bucket, path } = resolved;
  const filename = friendlyName || extractFilename(storedPath, "documento.pdf");

  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error || !data) {
      throw new Error(error?.message || "Falha ao baixar arquivo");
    }

    const blobUrl = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    // Fallback: signed URL download
    const signedUrl = await getSignedUrl(storedPath, 300);
    const anchor = document.createElement("a");
    anchor.href = signedUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}

/**
 * Convenience wrapper that catches errors and shows a toast.
 */
export async function downloadStorageFileSafe(storedPath: string, label = "arquivo", friendlyName?: string): Promise<void> {
  try {
    await downloadStorageFile(storedPath, friendlyName);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    toast.error(`Erro ao baixar ${label}`, { description: msg });
  }
}

/**
 * Open a file from Storage in a new tab for viewing.
 * Uses signed URLs (HTTPS) to avoid blob: blocking by browsers.
 */
export async function openStorageFile(storedPath: string): Promise<void> {
  const resolved = resolveStoragePath(storedPath);

  if (!resolved) {
    window.open(storedPath, "_blank");
    return;
  }

  const signedUrl = await getSignedUrl(storedPath, 3600);
  window.open(signedUrl, "_blank");
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
