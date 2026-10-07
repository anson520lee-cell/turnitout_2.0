"use client";
import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The customer's pasted text (admin only), with Copy and a .txt download
 * built in the browser from the text already on the page. The file is named
 * by order number, never by the document's title.
 */
export function SourceText({ text, fileBase }: { text: string; fileBase: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // Clipboard blocked: select the text below by hand.
            }
          }}
        >
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy text"}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${fileBase}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download className="size-3.5" /> Download .txt
        </Button>
      </div>
      <div className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-ink-900/60 p-4 font-serif text-[14px] leading-relaxed text-fg-muted">
        {text}
      </div>
    </div>
  );
}
