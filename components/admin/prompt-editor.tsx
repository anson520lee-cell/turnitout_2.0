"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage, Textarea } from "@/components/ui/field";
import { resetReportPrompt, saveReportPrompt } from "@/app/actions/admin-prompt";

/** Edit box for the free-scan report prompt on /admin/prompt. */
export function PromptEditor({ initial, custom }: { initial: string; custom: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = text.trim() !== initial.trim();

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) =>
    start(async () => {
      setMessage(null);
      const res = await action();
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
        return;
      }
      setMessage({ tone: "success", text: done });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <label htmlFor="report-prompt" className="sr-only">System prompt</label>
      <Textarea
        id="report-prompt"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-[60dvh] min-h-[320px] resize-y font-mono text-[13px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[12px] text-fg-subtle">{text.trim().length.toLocaleString("en-HK")} characters</span>
        <div className="flex flex-wrap gap-2">
          {custom && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Go back to the built-in prompt? Your saved prompt will be deleted.")) return;
                run(resetReportPrompt, "Back to the built-in prompt.");
              }}
            >
              Reset to built-in
            </Button>
          )}
          <Button type="button" disabled={pending || !changed} onClick={() => run(() => saveReportPrompt(text), "Saved. New scans use it within about 30 seconds.")}>
            {pending ? "Saving…" : "Save prompt"}
          </Button>
        </div>
      </div>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </div>
  );
}
