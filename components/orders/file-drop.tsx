"use client";
import { useRef, useState } from "react";
import { FileUp, FileText, X } from "lucide-react";
import { uploads } from "@/config/app";
import { cn, formatBytes } from "@/lib/utils";

export function validateFile(f: File): string | null {
  const lower = f.name.toLowerCase();
  if (!uploads.allowedExtensions.some((e) => lower.endsWith(e))) return "Only PDF or DOCX files are accepted.";
  if (f.type && !(uploads.allowedMimeTypes as readonly string[]).includes(f.type)) return "That file type isn't supported. Export it as PDF or DOCX.";
  if (f.size === 0) return "That file is empty.";
  if (f.size > uploads.maxBytes) return `That file is ${formatBytes(f.size)}. The limit is ${formatBytes(uploads.maxBytes)}.`;
  return null;
}

export function FileDrop({
  file,
  onFile,
  error,
  disabled,
  accept = ".pdf,.docx",
  label = "PDF or DOCX",
  id = "file",
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  error?: string | null;
  disabled?: boolean;
  accept?: string;
  label?: string;
  id?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-ink-900/60 p-3.5">
          <span className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent"><FileText className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{file.name}</p>
            <p className="text-[12px] text-fg-subtle">{formatBytes(file.size)}</p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => onFile(null)} className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/5 hover:text-fg" aria-label="Remove file">
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition",
            over ? "border-accent bg-accent/[0.06]" : "border-[var(--line-strong)] hover:border-accent/50 hover:bg-white/[0.02]",
            error && "border-risk/50",
          )}
        >
          <FileUp className="size-6 text-accent" aria-hidden />
          <span className="mt-3 text-[14px] font-medium">Drop your file here or browse</span>
          <span className="mt-1 text-[12.5px] text-fg-subtle">{label} · up to {formatBytes(uploads.maxBytes)}</span>
        </button>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-[12.5px] text-risk">{error}</p>}
    </div>
  );
}

export function UploadProgress({ value }: { value: number }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Upload progress">
      <div className="flex justify-between text-[12px] text-fg-muted">
        <span>Uploading securely</span>
        <span className="font-mono">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan to-accent transition-[width] duration-200" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
