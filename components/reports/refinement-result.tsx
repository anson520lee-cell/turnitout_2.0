"use client";
import Link from "next/link";
import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";

export function RefinementResult({
  orderId,
  original,
  revised,
  notes,
}: {
  orderId: string;
  original: string | null;
  revised: string;
  notes: string | null;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">Original</p>
          <div className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap font-serif text-[15px] leading-[1.8] text-fg-muted">
            {original ?? "The original text has been deleted under the retention policy."}
          </div>
        </Card>
        <Card strong className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-violet">Revised</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(revised);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy revised text"}
            </Button>
          </div>
          <div className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap font-serif text-[15px] leading-[1.8]">{revised}</div>
        </Card>
      </div>
      {notes && (
        <Card className="p-5 sm:p-6">
          <p className="text-[14px] font-medium">Reviewer notes</p>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-muted">{notes}</p>
        </Card>
      )}
      <p className="text-[12.5px] text-fg-subtle">Citations were preserved as submitted. Check the revision before using it.</p>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/orders/${orderId}/revision`} className={buttonClasses("secondary", "md")}>
          <Download className="size-4" /> Download result
        </a>
        <Link href="/services/screening" className={buttonClasses("primary", "md")}>Get a report</Link>
      </div>
    </div>
  );
}
