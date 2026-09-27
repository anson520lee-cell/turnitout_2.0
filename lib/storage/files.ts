import "server-only";
import { uploads } from "@/config/app";
import { createAdminClient } from "@/lib/supabase/admin";
import { countWords } from "@/lib/utils";

export type DocumentKind = "pdf" | "docx";

export function extensionOk(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return uploads.allowedExtensions.some((e) => lower.endsWith(e));
}

/** Strip anything that could affect a storage path. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").slice(0, 120) || "document";
}

/** Identify the real file type from its first bytes, not from its name or the browser. */
export function sniff(bytes: Uint8Array): DocumentKind | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx"; // ZIP (OOXML)
  return null;
}

export async function docxWordCount(buf: Buffer): Promise<number | null> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return countWords(value);
  } catch {
    return null;
  }
}

/** Short-lived download URL for a private object. */
export async function signedUrl(
  bucket: string,
  path: string,
  opts: { download?: string | boolean } = {},
): Promise<string | null> {
  const db = createAdminClient();
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, uploads.signedUrlTtl, opts.download ? { download: opts.download } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}
