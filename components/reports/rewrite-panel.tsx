"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Copy, PenLine, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WaitingAnimation } from "@/components/ui/waiting";
import { reviseText, type Decision, type ReportRewrite } from "@/lib/auto-report/rewrite";
import type { AutoReportResult } from "@/lib/auto-report/stitch";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Decisions = Record<number, Decision | undefined>;

const storageKey = (orderId: string) => `rewrite-choices:${orderId}`;
const CHANGED = "rewrite-choices-changed";

/** The remembered choices as stored text ("" when there are none or storage is blocked). */
function readChoices(orderId: string): string {
  try {
    return window.localStorage.getItem(storageKey(orderId)) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Writing Refinement, an add-on after a finished report ("Fix flagged phrasing, keep your meaning"): paid in credits, once per report. After a finished report, suggests a rewrite for each flagged sentence,
 * made from the reviewer's reason. The student sees their own sentence beside the suggestion and accepts or keeps
 * theirs one by one. Nothing is scored again here, and nothing changes the report above it.
 */
export function RewritePanel({ orderId, result, initial, sourceText, credits, balance }: { orderId: string; result: AutoReportResult; initial: ReportRewrite | null; sourceText: string | null; credits: number; balance: number }) {
  const [rewrite, setRewrite] = useState<ReportRewrite | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = useSyncExternalStore(subscribe, () => readChoices(orderId), () => "");
  const [local, setLocal] = useState<Decisions | null>(null);
  const remembered = useMemo<Decisions>(() => {
    try {
      return stored ? (JSON.parse(stored) as Decisions) : {};
    } catch {
      return {};
    }
  }, [stored]);
  const decisions = local ?? remembered;
  const [copied, setCopied] = useState(false);
  const flagged = result.summary.high + result.summary.medium;

  const choose = (n: number | number[], d: Decision | undefined) => {
    const next = { ...decisions };
    for (const k of Array.isArray(n) ? n : [n]) next[k] = d;
    setLocal(next);
    try {
      window.localStorage.setItem(storageKey(orderId), JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGED));
    } catch {
      // Storage is blocked: the choices only last until the page is closed.
    }
  };

  async function start() {
    setBusy(true);
    setError(null);
    track("rewrite_requested");
    try {
      const res = await fetch(`/api/reports/${orderId}/rewrite`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { rewrite?: ReportRewrite; error?: string } | null;
      if (res.ok && body?.rewrite) setRewrite(body.rewrite);
      else setError(body?.error ?? "We couldn't write the suggestions just now. Please try again in a little while.");
    } catch {
      setError("We couldn't write the suggestions just now. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => rewrite?.items.filter((i) => i.rewrite) ?? [], [rewrite]);
  const left = (rewrite?.items.length ?? 0) - shown.length;
  const accepted = shown.filter((i) => decisions[i.n] === "accept").length;
  const revised = useMemo(() => (rewrite && accepted ? reviseText(sourceText, result, rewrite, decisions) : ""), [rewrite, accepted, sourceText, result, decisions]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(revised);
      track("rewrite_copied");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically. Select the text and copy it by hand.");
    }
  }

  if (flagged === 0) return null;

  return (
    <Card className="p-5 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">Writing Refinement: fix flagged phrasing, keep your meaning</h3>
        <Badge tone="info">{rewrite ? "Done for this report" : credits === 0 ? "Add-on · free for you" : `Add-on · ${credits} ${credits === 1 ? "credit" : "credits"}`}</Badge>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
        For each flagged sentence we suggest a rewrite that answers the reviewer&rsquo;s reason and keeps what you said: your facts, numbers, names, quotations and citations stay as they are. You choose, sentence by sentence.
      </p>

      {!rewrite && !busy && (
        <div className="mt-4">
          {balance < credits ? (
            <>
              <Link href="/billing" className={buttonClasses("primary", "md")}>
                Top up {credits - balance} more credit{credits - balance === 1 ? "" : "s"} to continue
              </Link>
              <p className="mt-2 text-[12px] text-fg-subtle">Writing Refinement costs {credits} credits and your balance is {balance}.</p>
            </>
          ) : (
            <Button onClick={start}>
              <PenLine className="size-4" /> Suggest rewrites for {Math.min(flagged, 60)} flagged sentence{flagged === 1 ? "" : "s"}{credits > 0 ? ` · ${credits} credit${credits === 1 ? "" : "s"}` : ""}
            </Button>
          )}
          {flagged > 60 && <p className="mt-2 text-[12px] text-fg-subtle">The 60 strongest flags are covered; rewrite the rest in your own words.</p>}
          <p className="mt-2 text-[12px] text-fg-subtle">Made once for this report, about half a minute. Credits are taken only when suggestions are ready; if none can be made safely, you pay nothing.</p>
        </div>
      )}

      {busy && (
        <WaitingAnimation
          title="Writing your suggestions"
          steps={["Reading why each sentence was flagged", "Keeping your facts, names and citations", "Checking every suggestion against your original"]}
          stepMs={2600}
        />
      )}

      {error && <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-[13px] text-warn" role="alert">{error}</p>}

      {rewrite && (
        <div className="mt-5 space-y-4">
          {shown.length === 0 ? (
            <p className="text-[13px] text-fg-muted">We couldn&rsquo;t make a safe suggestion for any of the flagged sentences, so they are left as you wrote them. Rewrite them in your own everyday words.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                <p className="text-[12.5px] text-fg-subtle">
                  <span className="font-mono text-fg-muted">{accepted}</span> of {shown.length} suggestions used
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => choose(shown.map((i) => i.n), "accept")}>Use all</Button>
                  <Button variant="ghost" size="sm" onClick={() => choose(shown.map((i) => i.n), undefined)}>Reset</Button>
                </div>
              </div>
              <ul className="space-y-4">
                {shown.map((i) => {
                  const d = decisions[i.n];
                  return (
                    <li key={i.n} className="rounded-xl border border-[var(--line)] bg-ink-900/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-fg-subtle">Sentence {i.n}</span>
                        {d === "accept" && <Badge tone="info">Using the suggestion</Badge>}
                      </div>
                      {i.why && <p className="mt-1.5 text-[12.5px] text-fg-subtle">Flagged because: {i.why}</p>}
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className={cn("rounded-lg border p-3", d === "accept" ? "border-[var(--line)] opacity-60" : "border-[var(--line)]")}>
                          <p className="font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">Your sentence</p>
                          <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{i.original}</p>
                        </div>
                        <div className={cn("rounded-lg border p-3", d === "accept" ? "border-accent/50 bg-accent/10" : "border-accent/25 bg-accent/[0.05]")}>
                          <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#a9c1ff]">Suggested</p>
                          <p className="mt-1 text-[13.5px] leading-relaxed text-fg">{i.rewrite}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {d === "accept" ? (
                          <Button variant="outline" size="sm" onClick={() => choose(i.n, undefined)}><Undo2 className="size-3.5" /> Keep mine</Button>
                        ) : (
                          <Button variant="primary" size="sm" onClick={() => choose(i.n, "accept")}><Check className="size-3.5" /> Use this</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {left > 0 && (
                <p className="text-[12.5px] text-fg-subtle">
                  {left} flagged sentence{left === 1 ? " was" : "s were"} left as you wrote {left === 1 ? "it" : "them"}, because a rewrite could not keep everything (a number, name, citation, quotation or the exact strength of the claim). Rewrite {left === 1 ? "it" : "those"} in your own words.
                </p>
              )}
              <div className="rounded-xl border border-[var(--line)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px] text-fg-muted">
                    {accepted ? `Your text with the ${accepted} suggestion${accepted === 1 ? "" : "s"} you chose.` : "Choose the suggestions you want, then copy your revised text here."}
                  </p>
                  <Button variant="secondary" size="sm" disabled={!accepted} onClick={copy}>
                    <Copy className="size-3.5" /> {copied ? "Copied" : "Copy revised text"}
                  </Button>
                </div>
                {accepted > 0 && <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-900/60 p-3 text-[13px] leading-relaxed text-fg-muted">{revised}</p>}
              </div>
            </>
          )}
          <p className="text-[12px] leading-relaxed text-fg-subtle">
            These are suggestions, not corrections: read each one and make sure it still says what <em>you</em> mean. Your report and its score above are unchanged, and a rewrite does not guarantee any result in any checker. To see how your edited text reads, run a new report on it.
          </p>
        </div>
      )}
    </Card>
  );
}
