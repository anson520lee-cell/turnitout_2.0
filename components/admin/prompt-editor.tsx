"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormMessage, Textarea } from "@/components/ui/field";
import { ReportView } from "@/components/scan/report-view";
import { parseReport } from "@/lib/report-format";
import { formatDateTime } from "@/lib/utils";
import {
  loadPromptVersion,
  resetReportPrompt,
  saveReportPrompt,
  testReportPrompt,
  type PromptTestResult,
} from "@/app/actions/admin-prompt";

type Version = { id: number; savedAt: string; preview: string };

const SAMPLE = `Urban streets deserve greater attention in planning debates. Streets carry traffic, but they are also public spaces where people meet. Some projects make money while the environment deteriorates. Control over important decisions may also remain with a small group.

So why do people still drive so much? It sounds counterintuitive, but in many new towns people have to use a car, because the bus takes forever and the MTR station is a 20 minute walk away. Indeed, only a small group of people like government, investors, are making the decisions to maximize their profits, and they don't really keep an eye on what residents need.`;

/** Edit box for the free-scan report prompt on /admin/prompt, with a test run and older versions. */
export function PromptEditor({ initial, custom, versions }: { initial: string; custom: boolean; versions: Version[] }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [sample, setSample] = useState(SAMPLE);
  const [test, setTest] = useState<PromptTestResult | null>(null);
  const [testing, startTest] = useTransition();
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

  const load = (id: number) =>
    start(async () => {
      const res = await loadPromptVersion(id);
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
        return;
      }
      setText(res.value);
      setMessage({ tone: "info", text: "Older version loaded into the editor. Press Save prompt to use it." });
    });

  return (
    <div className="space-y-6">
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
          <span className="font-mono text-[12px] text-fg-subtle">
            {text.trim().length.toLocaleString("en-HK")} characters{changed ? " · unsaved changes" : ""}
          </span>
          <div className="flex flex-wrap gap-2">
            {changed && (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setText(initial)}>
                Discard changes
              </Button>
            )}
            {custom && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Go back to the built-in prompt? Your saved prompt stays in the history below.")) return;
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

      <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <FlaskConical className="size-4 text-[#c7b8ff]" aria-hidden /> Test the prompt in the editor
        </h3>
        <p className="mt-1 text-[12.5px] text-fg-muted">
          Runs the text above (saved or not) on this sample with the model chosen above, exactly as a scan would. Nothing is saved. Costs a few cents at most.
        </p>
        <Textarea
          aria-label="Sample text"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className="mt-3 h-40 resize-y text-[13px]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[12px] text-fg-subtle">{sample.trim().length.toLocaleString("en-HK")} / 6,000 characters</span>
          <Button
            type="button"
            variant="secondary"
            disabled={testing}
            onClick={() =>
              startTest(async () => {
                setTest(null);
                setTest(await testReportPrompt({ prompt: text, text: sample }));
              })
            }
          >
            {testing ? "Running… (up to a minute)" : "Run test"}
          </Button>
        </div>
        {test && !test.ok && <div className="mt-3"><FormMessage>{test.message}</FormMessage></div>}
        {test?.ok && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
              <Badge tone="progress">{test.model}</Badge>
              <Badge>reasoning {test.effort}</Badge>
              <span>{test.seconds}s · {test.tokens.toLocaleString("en-HK")} tokens</span>
            </div>
            <ReportView blocks={parseReport(test.report)} />
          </div>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <History className="size-4 text-[#c7b8ff]" aria-hidden /> Saved versions
        </h3>
        {versions.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-fg-subtle">Every time you press Save prompt, a copy is kept here so you can go back to it.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
            {versions.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-[12.5px]">
                <div className="min-w-0">
                  <span className="text-fg">{formatDateTime(v.savedAt)}</span>
                  {i === 0 && custom && <Badge tone="success" className="ml-2">In use</Badge>}
                  <p className="truncate text-fg-subtle">{v.preview}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => load(v.id)}>
                  Load into editor
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
