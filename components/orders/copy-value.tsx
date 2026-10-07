"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { isPlaceholder } from "@/config/payments";
import { cn } from "@/lib/utils";

/** Small copy-to-clipboard button. Disabled for unset "REPLACE: …" payee values. */
export function CopyValue({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const disabled = isPlaceholder(value);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked: the value is on screen to copy by hand.
        }
      }}
      aria-label={`Copy ${label}`}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-white/[0.07] hover:text-fg disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </button>
  );
}
