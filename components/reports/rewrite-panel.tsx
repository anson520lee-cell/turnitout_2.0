"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, PenLine, RotateCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { nextStep, resumable, reviseText, type Decision, type ReportRewrite, type RewriteCheck, type RewriteItem } from "@/lib/auto-report/rewrite";
import type { RecheckStep } from "@/lib/auto-report/refine-script";
import { reportScore, type AutoReportResult } from "@/lib/auto-report/stitch";
import { track } from "@/lib/analytics";
import { cn, shortId } from "@/lib/utils";
import { RefineScan, type RefineVerify } from "./refine/refine-scan";

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
 * Writing Refinement, an add-on after a finished report: paid in credits, once per report. Rewrites each flagged
 * sentence for a lower AI score, made from the reviewer's reason; the customer is told up front that a suggestion may
 * change what a sentence says. The student sees their own sentence beside the suggestion and accepts or keeps theirs
 * one by one. Nothing changes the report above it. While the suggestions are written the customer watches them being
 * typed over their text (RefineScan); then the text with every suggestion in place is re-checked by the detector, and
 * while it still scores too high the sentences still counted are rewritten again (up to MAX_ROUNDS rounds, free), the
 * best round kept and its real score shown. The re-check starts as soon as the suggestions are saved, while they are
 * still being typed out, and the live view ends on its result: it never shows an estimate first.
 *
 * The page only drives the steps while it is open: the server finishes the run without it (the background runner,
 * lib/auto-report/sweep.ts, follows the same nextStep), so a closed or backgrounded tab no longer stops it after
 * round 2. A page opened on a run that is still going picks it up, and a step the server is already on is waited for.
 */
export function RewritePanel({ orderId, result, initial, sourceText, credits, balance, title, canSkip = false }: { orderId: string; result: AutoReportResult; initial: ReportRewrite | null; sourceText: string | null; credits: number; balance: number; title?: string; canSkip?: boolean }) {
  const [rewrite, setRewrite] = useState<ReportRewrite | null>(initial);
  // The live rewrite on screen: running until the suggestions are in and have been typed out.
  const [live, setLive] = useState<{ run: number; rewrite: ReportRewrite | null; arrived: RewriteItem[] } | null>(null);
  const runs = useRef(0);
  const [error, setError] = useState<string | null>(null);
  // The re-check of the rewritten text: saved with the rewrite once made.
  const [check, setCheck] = useState<RewriteCheck | null>(initial?.check ?? null);
  const [checking, setChecking] = useState<"idle" | "pending" | "failed">("idle");
  const [checkError, setCheckError] = useState<string | null>(null);
  // The rewrite as the re-checks left it (a later round may have replaced suggestions).
  const [latest, setLatest] = useState<ReportRewrite | null>(initial);
  // What the re-check is doing now, for the live rewrite: re-checking a round, or writing the next one. The live view
  // shows each round and its real score as part of the run, and ends on the best (Neo, 2026-10-29).
  const [step, setStep] = useState<RecheckStep | null>(null);
  // Real scores of the text with the first k suggestions in place, as they land while the suggestions are written and
  // re-checked (the server scores the text a few times on the way; Neo, 2026-10-31). Shown until a re-check is in.
  const [probes, setProbes] = useState<{ k: number; score: number }[]>([]);
  // Once a re-check of record is in, a live score still on its way is stale.
  const landed = useRef(false);
  // From the start of a live run: until the suggestions are saved the re-check is simply still to come.
  const verify: RefineVerify = {
    state: checking === "pending" ? "pending" : check ? "done" : checking === "failed" ? "failed" : "pending",
    step,
    scores: latest?.scores ?? (check ? [check.score] : []),
    check,
    items: latest?.items,
    live: probes.map((p) => p.score),
  };
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

  /**
   * Re-checks the rewritten text, then, while it still scores too high, asks for another round and re-checks that,
   * until the target or the last round. Each answer carries the whole rewrite, since a better round replaces suggestions.
   * `from` is the rewrite as it stands, to name the round being checked.
   */
  async function recheck(from: ReportRewrite | null) {
    setChecking("pending");
    setCheckError(null);
    const post = async (path: string) => {
      const res = await fetch(`/api/reports/${orderId}/rewrite/${path}`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { check?: RewriteCheck; rewrite?: ReportRewrite; error?: string } | null;
      return { busy: res.status === 409, body };
    };
    let cur = from;
    let waits = 0;
    try {
      // Step by step as the saved rewrite says (nextStep), the same as the server's background runner.
      for (;;) {
        const step = cur ? nextStep(cur) : { kind: "check" as const, round: 1 };
        if (!step) break;
        setStep({ ...step, since: performance.now() });
        const { busy, body } = await post(step.kind);
        // The server is on this step already (the background runner took it over): wait for it, then look again.
        if (busy && waits++ < 36) {
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        if (step.kind === "check") {
          if (!body?.check || !body.rewrite) {
            setStep(null);
            // A round that could not be re-checked leaves the best one so far standing.
            if (cur?.check) break;
            setCheckError(body?.error ?? "We couldn't re-check the rewritten text just now. Please try again in a little while.");
            setChecking("failed");
            return;
          }
          cur = body.rewrite;
          landed.current = true;
          setCheck(body.check);
          setLatest(body.rewrite);
          setRewrite((r) => (r ? (body.rewrite as ReportRewrite) : r));
          track("rewrite_checked");
        } else {
          // Another round could not be written: the best round so far stands.
          if (!body?.rewrite) break;
          cur = body.rewrite;
          setLatest(body.rewrite);
        }
      }
    } catch {
      if (!cur?.check) {
        setStep(null);
        setCheckError("We couldn't re-check the rewritten text just now. Please check your connection and try again.");
        setChecking("failed");
        return;
      }
    }
    setStep(null);
    setChecking("idle");
  }

  // A page opened on a run that is still going (the customer left, or the tab was in the background): carry it on, or
  // wait for the server that already has. Only for a recent run (resumable): an old one waits for the button.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !initial || !resumable(initial)) return;
    resumed.current = true;
    void recheck(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    const run = ++runs.current;
    setLive({ run, rewrite: null, arrived: [] });
    setError(null);
    track("rewrite_requested");
    const fail = (message: string) => {
      setLive(null);
      setError(message);
    };
    let made = false;
    try {
      // Streamed: each suggestion as soon as it is written, then the whole rewrite (or why there is none).
      const res = await fetch(`/api/reports/${orderId}/rewrite?stream=1`, { method: "POST" });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return fail(body?.error ?? "We couldn't write the suggestions just now. Please try again in a little while.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let failed: string | null = null;
      setProbes([]);
      landed.current = false;
      // The rewrite line starts the re-check at once; the stream goes on a while after it with the last live scores.
      const take = (msg: { item?: RewriteItem; probe?: { k: number; score: number }; rewrite?: ReportRewrite; error?: string }) => {
        const { item, probe, rewrite: done } = msg;
        if (item) setLive((l) => (l && l.run === run ? { ...l, arrived: [...l.arrived, item] } : l));
        else if (probe) {
          if (!landed.current) setProbes((all) => (all.length && all[all.length - 1].k >= probe.k ? all : [...all, { k: probe.k, score: probe.score }]));
        } else if (done) {
          made = true;
          setLive((l) => (l && l.run === run ? { ...l, rewrite: done } : l));
          setLatest(done);
          // The real score of the rewritten text (and further rounds), while the rewrite is still being typed out.
          if (!nextStep(done)) setCheck(done.check ?? null);
          else void recheck(done);
        } else failed = msg.error ?? "";
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buf += value;
        const lines = buf.split("\n");
        buf = done ? "" : (lines.pop() ?? "");
        for (const line of lines) if (line.trim()) take(JSON.parse(line));
        if (done) break;
      }
      if (!made) fail(failed || "We couldn't write the suggestions just now. Please try again in a little while.");
    } catch {
      // A stream that breaks after the rewrite is in only loses the live scores: the re-check goes on.
      if (!made) fail("We couldn't write the suggestions just now. Please check your connection and try again.");
    }
  }

  // The live rewrite is over: show the suggestions to choose from.
  function reveal() {
    if (live?.rewrite) setRewrite(latest ?? live.rewrite);
    setLive(null);
    requestAnimationFrame(() => document.getElementById("writing-refinement")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const shown = useMemo(() => rewrite?.items.filter((i) => i.rewrite) ?? [], [rewrite]);
  const still = useMemo(() => new Set(check?.stillCounted ?? []), [check]);
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

  if (flagged === 0) {
    return (
      <Card id="writing-refinement" className="scroll-mt-24 p-5 sm:p-6 print:hidden">
        <h3 className="text-[15px] font-semibold tracking-tight">Writing Refinement: lower your AI score</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">This add-on suggests rewrites for the sentences a report flags. This report has no flagged sentences, so there is nothing to rewrite and nothing to pay.</p>
      </Card>
    );
  }

  return (
    <Card id="writing-refinement" className="scroll-mt-24 p-5 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">Writing Refinement: lower your AI score</h3>
        <Badge tone="info">{rewrite ? "Done for this report" : credits === 0 ? "Add-on · free for you" : `Add-on · ${credits} ${credits === 1 ? "credit" : "credits"}`}</Badge>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
        We rewrite each flagged sentence in a plainer, more natural voice, re-check the result with the same detector and keep improving what still reads as AI. You choose, sentence by sentence.
      </p>
      <Disclaimer />

      {!rewrite && !live && (
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
          <p className="mt-2 text-[12px] text-fg-subtle">Made once for this report; with the re-checks it takes a few minutes. Credits are taken only when suggestions are ready; if none can be made, you pay nothing. By starting it you accept that suggestions may change what your sentences say.</p>
        </div>
      )}

      {live && (
        <div className="mt-5 rounded-xl border border-[#9b7bff]/25 bg-ink-950/50 p-4">
          <RefineScan key={live.run} result={result} rewrite={live.rewrite} arrived={live.arrived} reference={`Order #${shortId(orderId)}`} title={title ?? "Writing Refinement"} onFinish={reveal} canSkip={canSkip} verify={verify} />
        </div>
      )}

      {error && <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-[13px] text-warn" role="alert">{error}</p>}

      {rewrite && (
        <div className="mt-5 space-y-4">
          {shown.length === 0 ? (
            <p className="text-[13px] text-fg-muted">We couldn&rsquo;t make a safe suggestion for any of the flagged sentences, so they are left as you wrote them. Rewrite them in your own everyday words.</p>
          ) : (
            <>
              <RecheckSummary check={check} checking={checking === "pending"} canContinue={!!latest && nextStep(latest) !== null} error={checkError} original={reportScore(result.summary)} onRetry={() => void recheck(latest)} />
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
                        {still.has(i.n) && <Badge tone="warn">Still flagged on the re-check</Badge>}
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
                  {left} flagged sentence{left === 1 ? " was" : "s were"} left as you wrote {left === 1 ? "it" : "them"}, because every rewrite changed a number, name, citation or quotation. Rewrite {left === 1 ? "it" : "those"} in your own words.
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
            These suggestions put a lower AI score first, not your wording: read each one before you use it, and fix anything that no longer says what <em>you</em> mean. Your report and its score above are unchanged, and a rewrite does not guarantee any result in any checker. The re-check scores your text with every suggestion in place; if you keep some of your own sentences, run a new report on your edited text to see how it reads.
          </p>
        </div>
      )}
    </Card>
  );
}

/** The real re-check of the rewritten text: its score against the report's, and how many rewritten sentences still count. */
function RecheckSummary({ check, checking, canContinue, error, original, onRetry }: { check: RewriteCheck | null; checking: boolean; canContinue: boolean; error: string | null; original: number; onRetry: () => void }) {
  if (checking) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-[var(--line)] p-4 text-[13px] text-fg-muted">
        <Loader2 className="size-4 animate-spin" /> Re-checking your text with every suggestion in place<span className="scan-ellipsis" />
      </p>
    );
  }
  if (check) {
    const rewritten = check.stillCounted.length + check.cleared.length;
    const high = check.score >= 0.6;
    return (
      <div className={cn("rounded-xl border p-4", high ? "border-warn/30 bg-warn/[0.06]" : "border-accent/30 bg-accent/[0.06]")}>
        <p className="font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">Re-checked by the same detector</p>
        <p className="mt-1.5 text-[14px] text-fg">
          Your text with every suggestion in place scores <span className="font-mono font-semibold">{Math.round(check.score * 100)}%</span> <span className="text-fg-muted">(your report: {Math.round(original * 100)}%)</span>.
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
          {check.stillCounted.length} of {rewritten} rewritten sentence{rewritten === 1 ? "" : "s"} still read{rewritten === 1 ? "s" : ""} as AI and {check.stillCounted.length === 1 ? "is" : "are"} marked below.
          {high && " The detector still reads the whole piece as AI: rewrite the marked sentences in your own words, with what you actually think and saw."}
        </p>
        {canContinue && (
          <Button className="mt-3" variant="secondary" size="sm" onClick={onRetry}>
            <RotateCw className="size-3.5" /> Keep refining
          </Button>
        )}
      </div>
    );
  }
  if (checking) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-[var(--line)] p-4 text-[13px] text-fg-muted">
        <Loader2 className="size-4 animate-spin" /> Re-checking your text with every suggestion in place<span className="scan-ellipsis" />
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4">
      <p className="text-[13px] text-fg-muted">{error ?? "See the real score of your text with every suggestion in place, from the same detector as your report. Free, once."}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCw className="size-3.5" /> {error ? "Try again" : "Re-check the rewritten text"}
      </Button>
    </div>
  );
}

/** What the customer accepts before paying: the score comes first, so a suggestion may change what a sentence says. */
function Disclaimer() {
  return (
    <p className="mt-3 rounded-xl border border-warn/30 bg-warn/[0.07] p-3 text-[12.5px] leading-relaxed text-fg-muted">
      <span className="font-semibold text-warn">Please note:</span> to bring the AI score down, Writing Refinement may change what a sentence says: it can drop details, soften or sharpen a claim, add a personal tone, and leave in the small roughness of real writing. Numbers, names, quotations and citations are never changed. Read every suggestion before you use it; you are responsible for the text you submit.
    </p>
  );
}

/** A fixed example of the Writing Refinement add-on for the sample report: nothing here is clickable or charged. */
export function RewriteDemo() {
  return (
    <Card className="p-5 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">Writing Refinement: lower your AI score</h3>
        <Badge tone="info">Add-on · 3× the report&rsquo;s price</Badge>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
        After a finished report, you can ask for a rewrite of each flagged sentence, made to bring the AI score down and re-checked by the same detector. You choose, sentence by sentence. Credits are taken only when suggestions are ready.
      </p>
      <Disclaimer />
      <div className="mt-4 rounded-xl border border-[var(--line)] bg-ink-900/40 p-4">
        <span className="font-mono text-[11px] text-fg-subtle">Example sentence</span>
        <p className="mt-1.5 text-[12.5px] text-fg-subtle">Flagged because: stock transition and an even, polished rhythm.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--line)] p-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">Your sentence</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">Furthermore, it is important to note that urban noise has a significant impact on residents&rsquo; sleep.</p>
          </div>
          <div className="rounded-lg border border-accent/25 bg-accent/[0.05] p-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#a9c1ff]">Suggested</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-fg">Urban noise also affects how well residents sleep.</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-fg-subtle">Example only. Suggestions are not corrections, and they do not guarantee any result in any checker. You find this card at the bottom of your own finished report, above &ldquo;Paragraph by paragraph&rdquo;.</p>
    </Card>
  );
}
