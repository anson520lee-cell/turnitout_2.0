"use client";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { lookaheadLine, quote, scanPosition, thinkingLine, type LogLine, type ScanPlan } from "@/lib/auto-report/scan-script";
import { POLISH_SLOT_MS, clearedBy, eraseLine, guardLine, jobPhase, keptLine, polishAt, polishOrder, polishPhase, queuedLine, readerAt, stillLine, writeLine, type JobPhase, type RecheckStep, type RefineJob } from "@/lib/auto-report/refine-script";
import type { RewriteCheck, RewriteItem } from "@/lib/auto-report/rewrite";
import type { ReportSentence } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";
import { Terminal, type TermLine } from "../scan/scan-panels";
import { RefineRatePanel, type RateBasis, type RefineCounts } from "./refine-rate";
import type { RefineMeter } from "./refine-meter";

/**
 * The live rewrite: the report scan's layout (the text in the middle, terminal windows, the rate on the right),
 * with the same reader and lookahead at the front. Each agent has a look of its own: A3 locks blue brackets onto
 * each flagged sentence as the reader finishes it; right behind the reader R1, an eraser bar, backspaces the
 * original and R2, a pen, types the real suggestion; R3 runs a green scan line over it; and R4 carries what it took
 * off the rate to the chart. A diff card follows the sentence being rewritten. Every sentence, suggestion and
 * reason shown is the real one.
 *
 * On a real order R4 is the re-check instead. Once the rewrite is typed out, R1 and R2 go on polishing the rewritten
 * sentences one after another while the detector reviews the text (`polishFrom`, refine-script.ts polishAt), each
 * round's real score goes to the chart and the logs, the sentences it still counts are marked, and a later round that
 * scores lower puts its suggestions in place (`recheck`).
 */

/** The re-check of a real order, as the stage shows it. */
export interface StageRecheck {
  /** The rewrite is typed out and the re-check (or a later round) is still running. */
  active: boolean;
  /** What runs now (none while the suggestions are still being saved). */
  step: RecheckStep | null;
  /** How long it has been running, in seconds. */
  stepSecs: number;
  /** The re-checked scores on screen so far, in order. */
  scores: number[];
  /** The best round's re-check and suggestions, once its score is on screen. */
  check: RewriteCheck | null;
  items?: RewriteItem[];
}

/** The scan clock as of the last render; the animation carries it on between renders. */
export interface RefineClock {
  at: number;
  wall: number;
  speed: number;
  held: boolean;
}
export const clockNow = (c: RefineClock) => (c.held ? c.at : c.at + Math.max(0, performance.now() - c.wall) * c.speed);

const KEEP = 70;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const clock = (ms: number) => `${pad(Math.floor(ms / 60_000))}:${pad(Math.floor(ms / 1000) % 60)}.${Math.floor(ms / 100) % 10}`;
/** How long the diff card stays on a finished sentence before it goes. */
const HOLD_MS = 1_600;
/** How far R1 trails the reader when it has nothing to rewrite. */
const TRAIL_MS = 900;
const pct = (v: number) => (v * 100).toFixed(1);

type TermId = "reader" | "rewriter" | "agents";
const TERMS: { id: TermId; title: string; dot: string; hint: string }[] = [
  { id: "reader", title: "reader.log", dot: "bg-cyan", hint: "Reading your text, word by word" },
  { id: "rewriter", title: "rewriter.log", dot: "bg-[#9b7bff]", hint: "Each flagged sentence, erased and rewritten" },
  { id: "agents", title: "agents.log", dot: "bg-accent", hint: "What the agents are working on" },
];
type Logs = Record<TermId, TermLine[]>;

export function RefineStage({
  plan,
  ratings,
  queue,
  jobs,
  known,
  readMs,
  frontier,
  within,
  scanMs,
  clockRef,
  meter,
  original,
  counts,
  waitedSecs,
  reduce,
  done,
  basis = "projected",
  recheck,
  polishFrom = null,
}: {
  plan: ScanPlan;
  ratings: Map<number, ReportSentence>;
  /** Sentence numbers sent to the writer (pickFlagged). */
  queue: Set<number>;
  /** The rewriter's timetable (a sentence's writing times are Infinity until its suggestion is in). */
  jobs: RefineJob[];
  /** Whether all the suggestions are in. */
  known: boolean;
  readMs: number;
  frontier: number;
  within: number;
  scanMs: number;
  clockRef: React.RefObject<RefineClock>;
  meter: RefineMeter;
  original: number;
  counts: RefineCounts;
  /** Seconds since the suggestions were asked for (shown while they are being written). */
  waitedSecs: number;
  reduce: boolean;
  done: boolean;
  /** What the rate shows (see RefineRatePanel). */
  basis?: RateBasis;
  /** A real order's re-check; absent in the design previews. */
  recheck?: StageRecheck;
  /** While a real order's re-check runs: the scan time the polish pass started, else null. */
  polishFrom?: number | null;
}) {
  const total = plan.sentences.length;
  const agents = recheck ? AGENTS_RECHECK : AGENTS;
  // The rewrite itself is over: typed out, and (on a real order) being re-checked.
  const over = done || Boolean(recheck?.active);
  const [logs, setLogs] = useState<Logs>({ reader: [], rewriter: [], agents: [] });
  const [open, setOpen] = useState<Record<TermId, boolean>>({ reader: false, rewriter: false, agents: false });
  const [mini, setMini] = useState<Record<TermId, boolean>>({ reader: false, rewriter: false, agents: false });
  const [tab, setTab] = useState<TermId>("rewriter");
  const touched = useRef(new Set<TermId>());
  const seq = useRef(0);
  const scanRef = useRef(scanMs);
  useEffect(() => {
    scanRef.current = scanMs;
  });

  const push = useCallback((id: TermId, lines: LogLine[]) => {
    if (!lines.length) return;
    const t = clock(scanRef.current);
    setLogs((l) => ({ ...l, [id]: [...l[id], ...lines.map((x) => ({ ...x, id: seq.current++, t }))].slice(-KEEP) }));
  }, []);

  // Windows open one after another as the rewrite starts, faster than the report scan's.
  useEffect(() => {
    const timers = TERMS.map((term, i) =>
      setTimeout(() => {
        if (!touched.current.has(term.id)) setOpen((o) => ({ ...o, [term.id]: true }));
      }, 300 + i * 900),
    );
    push("agents", [
      { tone: "info", text: `rewrite started · ${total} sentences · ${queue.size} to rewrite` },
      { tone: "dim", text: `${agents.length} agents deployed: ${agents.map((a) => a.name).join(" · ")}` },
      ...(plan.sentences[1] ? [lookaheadLine(plan.sentences[1])] : []),
    ]);
    return () => timers.forEach(clearTimeout);
  }, [push, total, plan, queue, agents]);

  const toggle = (id: TermId) => {
    touched.current.add(id);
    setOpen((o) => ({ ...o, [id]: !o[id] }));
    setTab(id);
  };

  // Reader: one line per finished sentence, as in the report scan; flagged ones go into the rewriter's queue.
  const prevFrontier = useRef(0);
  useEffect(() => {
    const from = prevFrontier.current;
    prevFrontier.current = frontier;
    if (frontier <= from) return;
    const start = Math.max(from, frontier - 6);
    const lines: LogLine[] = [];
    const side: LogLine[] = [];
    const queued: LogLine[] = [];
    for (let i = start; i < frontier && i < total; i++) {
      const x = plan.sentences[i];
      lines.push({ tone: "ok", text: `✓ P${x.p} S${x.s} read · ${quote(x.text, 34)}` });
      if (queue.has(x.n)) queued.push(queuedLine(x));
      const ahead = plan.sentences[i + 2];
      if (ahead) side.push(i % 3 === 1 ? thinkingLine(ahead) : lookaheadLine(ahead));
      const para = plan.paragraphs.find((p) => p.last === i);
      if (para) lines.push({ tone: "info", text: `¶${para.p} read · ${para.last - para.first + 1} sentences` });
    }
    push("reader", lines);
    push("rewriter", queued);
    push("agents", side);
  }, [frontier, plan, total, queue, push]);

  // Rewriter: each sentence's erase, write and check, as the clock passes them.
  const stage = useRef(new Map<number, number>());
  useEffect(() => {
    const out: LogLine[] = [];
    for (const j of jobs) {
      const was = stage.current.get(j.n) ?? 0;
      const now = scanMs >= j.end ? 3 : scanMs >= j.erased && j.rewrite ? 2 : scanMs >= j.start ? 1 : 0;
      if (now <= was) continue;
      stage.current.set(j.n, now);
      if (j.rewrite) {
        if (was < 1) out.push(eraseLine(j));
        if (was < 2 && now >= 2) out.push(writeLine(j));
        if (now === 3) out.push(guardLine(j));
      } else if (now === 3) out.push(keptLine(j));
    }
    push("rewriter", out);
  }, [jobs, scanMs, push]);

  // The writer's own progress: each suggestion as it comes in.
  const heard = useRef(new Set<number>());
  useEffect(() => {
    const out: LogLine[] = [];
    for (const j of jobs) {
      if (!j.known || heard.current.has(j.n)) continue;
      heard.current.add(j.n);
      out.push({ tone: j.rewrite ? "violet" : "dim", text: `writer → P${j.p} S${j.s} ${j.rewrite ? "suggestion in" : "kept as written"} · ${heard.current.size}/${jobs.length}` });
    }
    if (known && out.length) out.push({ tone: "ok", text: `writer · all ${jobs.length} in · R1 and R2 on A1's tail` });
    push("agents", out);
  }, [known, jobs, push]);
  const waited = useRef(waitedSecs);
  useEffect(() => {
    waited.current = waitedSecs;
  });
  const any = jobs.some((j) => j.known);
  useEffect(() => {
    if (any) return;
    const say = () => push("agents", [{ tone: "dim", text: `writer drafting ${queue.size} suggestion${queue.size === 1 ? "" : "s"} · ${waited.current}s` }]);
    say();
    const t = setInterval(say, 5_000);
    return () => clearInterval(t);
  }, [any, queue, push]);
  useEffect(() => {
    if (!over) return;
    const made = jobs.filter((j) => j.rewrite).length;
    push("rewriter", [{ tone: "ok", text: `all ${jobs.length} sentences done · ${made} rewritten · ${jobs.length - made} kept` }]);
  }, [over, jobs, push]);

  // R4 on a real order: when the re-check starts, a heartbeat, and the score before and after once it is in.
  // No rounds are named: the customer sees the score before and after only (Neo, 2026-10-31).
  const checkingNow = Boolean(recheck?.active && recheck.step);
  useEffect(() => {
    if (!checkingNow) return;
    push("agents", [{ tone: "info", text: "R4 RE-CHECK · your text with every suggestion in place → the same detector as your report" }]);
    const t = setInterval(() => push("agents", [{ tone: "dim", text: "R4 · the detector is reading your rewritten text" }]), 8_000);
    return () => clearInterval(t);
  }, [checkingNow, push]);
  const bestCheck = recheck?.check ?? null;
  useEffect(() => {
    if (bestCheck) push("agents", [{ tone: bestCheck.score < original ? "ok" : "warn", text: `R4 RE-CHECK · ${Math.round(original * 100)}% → ${Math.round(bestCheck.score * 100)}% on the same detector as your report` }, stillLine(bestCheck)]);
  }, [bestCheck, original, push]);

  // The polish pass: one line per sentence R2 takes up again.
  const order = useMemo(() => polishOrder(jobs), [jobs]);
  const polishing = polishFrom === null ? null : polishAt(order, scanMs - polishFrom);
  const polishK = polishing?.k ?? -1;
  const polishRef = useRef(polishing);
  useEffect(() => {
    polishRef.current = polishing;
  });
  useEffect(() => {
    const pol = polishRef.current;
    if (polishK < 0 || !pol) return;
    const j = pol.job;
    const before = polishK ? order[(polishK - 1) % order.length] : null;
    const pass = Math.floor(polishK / order.length) + 1;
    const x = plan.sentences[j.i];
    const para = plan.paragraphs.find((q) => q.first <= j.i && j.i <= q.last);
    push("rewriter", [
      ...(before ? [guardLine(before)] : []),
      { tone: "violet", text: `R2 POLISH · P${j.p} S${j.s} · reworking the last words · ${quote(j.rewrite ?? "", 30)}` },
    ]);
    const lines: LogLine[] = [];
    if (polishK % order.length === 0) lines.push({ tone: "info", text: `R1 + R2 · polish pass ${pass} · ${order.length} rewritten sentence${order.length === 1 ? "" : "s"}` });
    const prev = plan.sentences[j.i - 1];
    const next = plan.sentences[j.i + 1];
    lines.push(
      polishK % 2
        ? { tone: "info", text: `R6 VOICE · P${j.p} S${j.s} · held against your own sentences in ¶${j.p}` }
        : { tone: "info", text: `R5 FLOW · ¶${j.p} · ${prev && prev.p === j.p ? `S${prev.s} → ` : ""}S${j.s}${next && next.p === j.p ? ` → S${next.s}` : ""} read again${para ? ` · ${para.last - para.first + 1} sentences` : ""}` },
    );
    if (x) lines.push(thinkingLine(x));
    push("agents", lines);
  }, [polishK, order, plan, push]);

  // The diff card follows the sentence being rewritten, and stays a moment on the last one finished.
  const polishJob = polishing?.job ?? null;
  const card = useMemo(() => {
    if (polishJob) return polishJob;
    if (over) return null;
    let pick: RefineJob | null = null;
    for (const j of jobs) if (scanMs >= j.start && scanMs < j.end + HOLD_MS && (!pick || j.start > pick.start)) pick = j;
    return pick;
  }, [jobs, scanMs, over, polishJob]);

  const lead = plan.sentences[Math.min(frontier, total - 1)];
  const readerLive =
    lead && frontier < total ? (
      <p className="break-words text-cyan">
        <span className="mr-2 text-fg-subtle/50">{clock(scanMs)}</span>› P{lead.p} S{lead.s} {lead.words.slice(0, Math.max(1, Math.ceil(within * lead.words.length))).join(" ")}
        <span className="scan-caret" aria-hidden />
      </p>
    ) : null;

  const rateProps = { meter, ready: true, final: done, basis, original, counts, reduce };

  const terminalFor = (id: TermId, mobile = false) => {
    const meta = TERMS.find((t) => t.id === id)!;
    return (
      <Terminal
        key={id}
        title={meta.title}
        dot={meta.dot}
        lines={logs[id]}
        live={id === "reader" ? readerLive : undefined}
        onClose={mobile ? undefined : () => toggle(id)}
        onMinimise={mobile ? undefined : () => setMini((m) => ({ ...m, [id]: !m[id] }))}
        minimised={!mobile && mini[id]}
        className={cn(mobile ? "h-full" : mini[id] ? "shrink-0" : "min-h-[120px] flex-1")}
      />
    );
  };

  return (
    <div className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] xl:grid-cols-[minmax(0,1fr)_316px_288px]">
      {/* Phone and tablet: the rate on top. */}
      <div className="rounded-xl border border-[#9b7bff]/25 bg-ink-950/80 px-3.5 py-2.5 lg:hidden">
        <RefineRatePanel {...rateProps} compact />
      </div>

      <section className="relative min-h-0 overflow-hidden rounded-2xl border border-[#9b7bff]/25 bg-ink-950/70" aria-label="Your text, being rewritten">
        <RefineDocument
          plan={plan}
          ratings={ratings}
          queue={queue}
          jobs={jobs}
          meter={meter}
          readMs={readMs}
          frontier={frontier}
          within={within}
          scanMs={scanMs}
          clockRef={clockRef}
          reduce={reduce}
          done={over}
          real={Boolean(recheck)}
          check={bestCheck}
          items={recheck?.items}
          agents={agents}
          recheck={recheck}
          polishFrom={polishFrom}
        />
        <AnimatePresence>
          {card && (
            <motion.div
              key={`${card.n}:${polishK}`}
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="absolute bottom-3 right-3 z-20 w-[min(380px,calc(100%-24px))] max-sm:hidden"
            >
              <DiffCard job={card} clockRef={clockRef} polish={polishJob && polishFrom !== null ? { from: polishFrom, k: polishK } : null} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="flex min-h-0 flex-col gap-2.5" aria-label="Rewrite logs">
        <div className="hidden rounded-xl border border-[#9b7bff]/25 bg-ink-950/80 px-3.5 py-2.5 lg:block xl:hidden">
          <RefineRatePanel {...rateProps} compact />
        </div>
        <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Terminal windows">
          {TERMS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              onClick={() => toggle(t.id)}
              aria-pressed={open[t.id]}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition hover:text-fg",
                open[t.id] ? "lg:border-[#9b7bff]/50 lg:bg-[#9b7bff]/15 lg:text-fg" : "lg:border-[var(--line)] lg:text-fg-subtle",
                tab === t.id ? "max-lg:border-[#9b7bff]/60 max-lg:bg-[#9b7bff]/15 max-lg:text-fg" : "max-lg:border-[var(--line)] max-lg:text-fg-subtle",
              )}
            >
              <span className={cn("size-1.5 rounded-full", t.dot, !open[t.id] && "lg:opacity-40")} aria-hidden />
              {t.title}
            </button>
          ))}
        </div>
        {/* Phone: one window at a time, picked from the chips above. */}
        <div className="h-[30dvh] min-h-[170px] lg:hidden">{terminalFor(tab, true)}</div>
        <div className="hidden min-h-0 flex-1 flex-col gap-2.5 lg:flex">
          <AnimatePresence initial={false}>
            {TERMS.filter((t) => open[t.id]).map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, scale: 0.94, x: 24 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.94, x: -12 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={cn("flex min-h-0 flex-col", mini[t.id] ? "shrink-0" : "flex-1")}
              >
                {terminalFor(t.id)}
              </motion.div>
            ))}
          </AnimatePresence>
          {!TERMS.some((t) => open[t.id]) && <p className="px-1 font-mono text-[11px] text-fg-subtle">All windows closed. Tap a log above to open it.</p>}
        </div>
      </aside>

      <aside className="hidden min-h-0 rounded-2xl border border-[#9b7bff]/25 bg-ink-950/80 p-4 xl:block" aria-label={basis === "projected" ? "AI rate, original and projected" : "AI rate, original and re-checked"}>
        <RefineRatePanel {...rateProps} />
      </aside>
    </div>
  );
}

/**
 * The diff /**
 * The diff card: the sentence being rewritten, its original struck out as R1 erases it and the suggestion
 * appearing as R2 types it, with the reviewer's reason it answers. Once typed, R3's checks light up one by one.
 * The text is written straight to the page every frame, in step with the text itself.
 */
function DiffCard({ job, clockRef, polish }: { job: RefineJob; clockRef: React.RefObject<RefineClock>; polish: { from: number; k: number } | null }) {
  const card = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLSpanElement>(null);
  const gone = useRef<HTMLSpanElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = clockNow(clockRef.current);
      // On the polish pass: the sentence as it stands, its last words taken back and typed again.
      const ph = polish ? polishPhase(job.rewrite ?? "", job.original, job.n * 31 + polish.k, t - polish.from - polish.k * POLISH_SLOT_MS) : jobPhase(job, t);
      const left = ph.phase === "erasing" ? ph.left : ph.phase === "typing" || (ph.phase === "done" && job.rewrite) ? 0 : job.original.length;
      const shown = ph.phase === "typing" ? ph.text : ph.phase === "done" ? (job.rewrite ?? "") : "";
      const key = `${ph.phase}:${left}:${shown}`;
      if (key === last || !keep.current || !gone.current || !card.current) return;
      last = key;
      keep.current.textContent = job.original.slice(0, left);
      gone.current.textContent = job.original.slice(left);
      if (typed.current && job.rewrite) typed.current.textContent = shown;
      card.current.dataset.ph = job.rewrite ? ph.phase : ph.phase === "done" ? "kept" : "inspect";
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [job, clockRef, polish]);
  const ratio = job.rewrite ? Math.round((job.rewrite.length / Math.max(1, job.original.length)) * 100) : 0;
  return (
    <div ref={card} data-ph="waiting" className="rf-diff scan-term overflow-hidden rounded-xl border border-[#9b7bff]/40 bg-ink-950/90 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.95),0_0_40px_-12px_rgb(155_123_255/0.6)]">
      <div className="flex items-center gap-2 border-b border-[#9b7bff]/20 bg-[#9b7bff]/[0.07] px-3 py-1.5">
        <span className="size-2 rounded-full bg-[#9b7bff] shadow-[0_0_8px_#9b7bff]" aria-hidden />
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-fg-muted">
          {polish ? "polish.log" : "diff.log"} · P{job.p} S{job.s}
        </span>
        <span className="rf-diff-state ml-auto font-mono text-[9.5px] uppercase tracking-[0.18em]" />
      </div>
      <div className="space-y-1.5 px-3 py-2.5 font-mono text-[11px] leading-[1.55]">
        {polish ? <p className="line-clamp-2 text-fg-subtle max-sm:hidden">polish {polish.k + 1} · rhythm and word choice, same meaning</p> : job.why && <p className="line-clamp-2 text-fg-subtle max-sm:hidden">fixing · {job.why}</p>}
        <p className="line-clamp-2 break-words sm:line-clamp-3">
          <span className="mr-1.5 text-[#c99bff]">−</span>
          <span ref={keep} className="text-fg-muted" />
          <span ref={gone} className="rf-diff-gone" />
        </p>
        <p className="line-clamp-3 break-words text-[#e9e3ff]">
          <span className="mr-1.5 text-[#8db3ff]">+</span>
          {job.rewrite ? (
            <>
              <span ref={typed} />
              <span className="rf-diff-caret" aria-hidden />
            </>
          ) : (
            <span className="text-fg-subtle">kept as you wrote it{job.kept ? ` · ${job.kept}` : ""}</span>
          )}
        </p>
        {job.rewrite && (
          <p className="rf-guard flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-[#cdbdff]">
            <span>✓ numbers</span>
            <span>✓ names</span>
            <span>✓ citations</span>
            <span className="text-fg-subtle">length {ratio}%</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** The agents, each drawn in a look of its own on the text. */
const AGENTS = [
  { c: "cyan", name: "A1 READ", job: "Reads your text word by word (a cyan cell)" },
  { c: "violet", name: "A2 LOOKAHEAD", job: "Looks one line ahead (a lens over the next line)" },
  { c: "blue", name: "A3 FLAG", job: "Locks blue brackets onto each sentence your report flagged" },
  { c: "purple", name: "R1 ERASE", job: "An eraser bar on the reader's tail: backspaces each flagged sentence" },
  { c: "lilac", name: "R2 WRITE", job: "A pen right behind the eraser: types the suggestion, character by character" },
  { c: "accent", name: "R3 GUARD", job: "Runs a green scan line over each suggestion: numbers, names and citations kept" },
  { c: "pink", name: "R4 SCORE", job: "Carries what each rewritten sentence took off the rate to the chart" },
] as const;

/**
 * On a real order R4 is the re-check, and while it runs R5 and R6 join R1, R2 and R3 on the polish pass: R5 reads each
 * paragraph again for how its sentences join, R6 holds each rewritten sentence against the student's own.
 */
const AGENTS_RECHECK = [
  ...AGENTS.slice(0, 6),
  { c: "pink", name: "R4 RE-CHECK", job: "Runs your rewritten text through the same detector as your report and puts its real score on the chart" },
  { c: "violet", name: "R5 FLOW", job: "Reads each paragraph again for how its sentences join, while the detector works" },
  { c: "blue", name: "R6 VOICE", job: "Holds each rewritten sentence against your own sentences around it" },
] as const;
type Agent = (typeof AGENTS_RECHECK)[number] | (typeof AGENTS)[number];

/**
 * The text, with the reader and lookahead at the front exactly as in the report scan, and the rewrite right behind
 * them. States are written straight onto the spans, so the text is rendered by React only once.
 */
const RefineDocument = memo(function RefineDocument({
  plan,
  ratings,
  queue,
  jobs,
  meter,
  readMs,
  frontier,
  within,
  scanMs,
  clockRef,
  reduce,
  done,
  real,
  check,
  items,
  agents,
  recheck,
  polishFrom,
}: {
  plan: ScanPlan;
  ratings: Map<number, ReportSentence>;
  queue: Set<number>;
  jobs: RefineJob[];
  meter: RefineMeter;
  readMs: number;
  frontier: number;
  within: number;
  scanMs: number;
  clockRef: React.RefObject<RefineClock>;
  reduce: boolean;
  /** The rewrite is typed out. */
  done: boolean;
  /** A real order: R4 re-checks instead of carrying projected drops to the chart. */
  real: boolean;
  /** The best round's re-check: the sentences it still counts are marked, the cleared ones too. */
  check: RewriteCheck | null;
  /** The best round's suggestions, put in place of any the first round typed differently. */
  items?: RewriteItem[];
  agents: readonly Agent[];
  recheck?: StageRecheck;
  /** While a real order's re-check runs: the scan time the polish pass started, else null. */
  polishFrom: number | null;
}) {
  const total = plan.sentences.length;
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const words = useRef<(HTMLSpanElement | null)[][]>([]);
  const wraps = useRef<(HTMLSpanElement | null)[]>([]);
  const lives = useRef<(HTMLSpanElement | null)[]>([]);
  const read = useRef<HTMLDivElement>(null);
  const xray = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const eraser = useRef<HTMLDivElement>(null);
  const pen = useRef<HTMLDivElement>(null);
  const live = useRef({ frontier, within, done, jobs, polishFrom });
  useLayoutEffect(() => {
    live.current = { frontier, within, done, jobs, polishFrom };
  });
  const userScrolledAt = useRef(-Infinity);
  // Suggestions a later round put in place of the typed ones, by sentence number.
  const swapped = useRef(new Map<number, string>());

  // R4 RE-CHECK: what the kept round's re-check says about each rewritten sentence.
  useEffect(() => {
    const still = new Set(check?.stillCounted ?? []);
    const clear = new Set(check?.cleared ?? []);
    for (const j of jobs) {
      const el = spans.current[j.i];
      if (!el) continue;
      const rc = still.has(j.n) ? "still" : clear.has(j.n) ? "clear" : null;
      if (rc) el.dataset.rc = rc;
      else delete el.dataset.rc;
    }
  }, [check, jobs]);

  // A later round that re-checked lower: its suggestions replace the typed ones, with a flash.
  useEffect(() => {
    for (const it of items ?? []) {
      const j = jobs.find((x) => x.n === it.n);
      if (!j || !it.rewrite || it.rewrite === (swapped.current.get(j.n) ?? j.rewrite)) continue;
      const sent = spans.current[j.i];
      const wrap = wraps.current[j.i];
      const box = lives.current[j.i];
      const txt = box?.firstElementChild as HTMLElement | null;
      if (!sent || !wrap || !box || !txt) continue;
      swapped.current.set(j.n, it.rewrite);
      wrap.hidden = true;
      box.hidden = false;
      txt.textContent = it.rewrite;
      sent.dataset.rf = "done";
      if (!reduce) {
        sent.classList.remove("rf-swap");
        void sent.offsetWidth;
        sent.classList.add("rf-swap");
      }
    }
  }, [items, jobs, reduce]);

  // A3 FLAG: blue brackets lock onto a flagged sentence, line by line, as the reader finishes it.
  const lockOn = useCallback((el: HTMLElement, label: string) => {
    const box = marks.current;
    const host = content.current;
    if (!box || !host) return;
    const base = host.getBoundingClientRect();
    [...el.getClientRects()]
      .filter((r) => r.width > 2)
      .slice(0, 4)
      .forEach((r, k) => {
        const d = document.createElement("div");
        d.className = "rf-lock";
        d.style.left = `${r.left - base.left - 3}px`;
        d.style.top = `${r.top - base.top - 2}px`;
        d.style.width = `${r.width + 6}px`;
        d.style.height = `${r.height + 4}px`;
        d.style.animationDelay = `${k * 70}ms`;
        if (k === 0) {
          d.dataset.label = label;
          // Near the right edge, the label hangs leftwards so it stays on the page.
          if (r.left - base.left > base.width - 150) d.dataset.flip = "1";
        }
        d.addEventListener("animationend", () => d.remove());
        box.appendChild(d);
      });
  }, []);

  // Reader states, as in the report scan: dim until read, lit while read, marked by the report once read.
  useEffect(() => {
    const list = spans.current;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el) continue;
      const x = plan.sentences[i];
      const st = i < frontier ? (ratings.get(x.n)?.risk ?? "low") : i === frontier ? "active" : "todo";
      if (el.dataset.st !== st) {
        el.dataset.st = st;
        if ((st === "high" || st === "medium") && !reduce) {
          el.classList.remove("scan-hit");
          void el.offsetWidth;
          el.classList.add("scan-hit");
          if (queue.has(x.n)) lockOn(el, `A3 FLAG · P${x.p} S${x.s} · ${st}`);
        }
      }
    }
  }, [frontier, ratings, queue, plan, reduce, lockOn]);

  // A1 READ and A2 LOOKAHEAD, moved every few frames: the same agents, the same way, as in the report scan.
  useEffect(() => {
    if (reduce || !total) return;
    const at = (el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    const wordAt = (i: number, f: number) => {
      const ws = words.current[i];
      if (!ws?.length) return null;
      return ws[Math.max(0, Math.min(ws.length - 1, Math.floor(f * ws.length)))];
    };
    const hide = (...els: (HTMLElement | null)[]) => els.forEach((el) => el && (el.style.opacity = "0"));
    const tick = () => {
      const { frontier: f, within: wn, done: finished } = live.current;
      if (finished || f >= total) {
        hide(read.current, xray.current);
        return;
      }
      const lead = wordAt(f, wn);
      if (!lead) return;
      const r = at(lead);
      if (read.current) {
        read.current.style.transform = `translate3d(${r.x - 4}px, ${r.y - 3}px, 0)`;
        read.current.style.width = `${Math.max(18, r.w + 8)}px`;
        read.current.style.height = `${r.h + 6}px`;
        read.current.style.opacity = "1";
      }
      let next: { y: number; h: number } | null = null;
      outer: for (let i = f, j = Math.floor(wn * (words.current[f]?.length ?? 0)), seen = 0; i < total && seen < 80; i++, j = 0) {
        const ws = words.current[i] ?? [];
        for (; j < ws.length; j++, seen++) {
          const el = ws[j];
          if (el && el.offsetTop > r.y + r.h * 0.6) {
            next = { y: el.offsetTop, h: el.offsetHeight };
            break outer;
          }
        }
      }
      if (xray.current) {
        if (next) {
          xray.current.style.transform = `translate3d(0, ${next.y - 4}px, 0)`;
          xray.current.style.height = `${next.h + 8}px`;
          xray.current.style.opacity = "1";
        } else xray.current.style.opacity = "0";
      }
    };
    const t = setInterval(tick, 60);
    const ro = new ResizeObserver(tick);
    if (content.current) ro.observe(content.current);
    return () => {
      clearInterval(t);
      ro.disconnect();
    };
  }, [total, reduce, plan]);

  // The rewrite, every frame: R1 marks each flagged sentence and erases it, R2 types the suggestion, R3 runs its scan
  // line over the new ink, and R4 carries what it took off the rate to the chart.
  useEffect(() => {
    let raf = 0;
    let lastScroll = 0;
    const shown = new Map<number, string>();
    // R4 SCORE: an orb from the sentence to the chart on screen, which flashes as it lands.
    const fly = (from: HTMLElement) => {
      if (reduce) return;
      const charts = [...document.querySelectorAll<HTMLElement>("[data-refine-chart]")].filter((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
      const target = charts[charts.length - 1];
      if (!target || typeof from.animate !== "function") return;
      const a = from.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const orb = document.createElement("div");
      orb.className = "rf-orb";
      orb.textContent = meter.cur === null ? "R4" : `R4 ${pct(meter.cur)}%`;
      orb.style.left = `${a.left}px`;
      orb.style.top = `${a.top}px`;
      document.body.appendChild(orb);
      const dx = b.right - 40 - a.left;
      const dy = b.top + b.height * 0.45 - a.top;
      const anim = orb.animate(
        [
          { transform: "translate(-50%, 0) scale(0.6)", opacity: 0 },
          { transform: `translate(calc(-50% + ${dx * 0.45}px), ${dy * 0.45 - 70}px) scale(1.05)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(0.55)`, opacity: 0.35 },
        ],
        { duration: 1_000, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
      );
      anim.onfinish = () => {
        orb.remove();
        target.classList.remove("rf-chart-hit");
        void target.offsetWidth;
        target.classList.add("rf-chart-hit");
      };
    };
    const place = (el: HTMLElement | null, at: HTMLElement | null, w: number, back: number, opacity = 1) => {
      if (!el) return;
      if (!at) {
        el.style.opacity = "0";
        return;
      }
      el.style.transform = `translate3d(${at.offsetLeft - back}px, ${at.offsetTop - 3}px, 0)`;
      el.style.width = `${w}px`;
      el.style.height = `${at.offsetHeight + 6}px`;
      el.style.opacity = String(opacity);
    };
    let litPara: HTMLElement | null = null;
    // The last place the rewrite worked, so the view stays on it between sentences instead of jumping to the reader.
    let lastFocus: { el: HTMLElement; at: number } | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { jobs: list, frontier: f, done: finished, polishFrom: pf } = live.current;
      const t = clockNow(clockRef.current);
      // The polish pass while a real order is re-checked: one rewritten sentence at a time, taken up again.
      let pol: { i: number; ph: JobPhase } | null = null;
      if (pf !== null && !reduce) {
        const at = polishAt(polishOrder(list), t - pf);
        if (at) pol = { i: at.job.i, ph: polishPhase(swapped.current.get(at.job.n) ?? at.job.rewrite ?? "", at.job.original, at.job.n * 31 + at.k, at.into) };
      }
      // R5 FLOW: the paragraph being polished, lit.
      const para = pol ? (spans.current[pol.i]?.closest("p") ?? null) : null;
      if (para !== litPara) {
        if (litPara) delete litPara.dataset.polish;
        if (para) para.dataset.polish = "R5 FLOW";
        litPara = para;
      }
      const now = performance.now();
      let erasing: HTMLElement | null = null;
      let typing: HTMLElement | null = null;
      let focus: HTMLElement | null = null;
      let focusSent: HTMLElement | null = null;
      for (const j of list) {
        const sent = spans.current[j.i];
        const wrap = wraps.current[j.i];
        const box = lives.current[j.i];
        if (!sent || !wrap || !box) continue;
        const ph = pol && pol.i === j.i ? pol.ph : jobPhase(j, t);
        const caret = box.lastElementChild as HTMLElement | null;
        if (!reduce && caret && ph.phase === "erasing") erasing = caret;
        if (!reduce && caret && ph.phase === "typing") typing = caret;
        if (ph.phase === "erasing" || ph.phase === "typing") [focus, focusSent] = [!reduce && caret ? caret : sent, sent];
        if (ph.phase === "checking") [focus, focusSent] = [sent, sent];
        const key = ph.phase === "erasing" ? `e${ph.left}` : ph.phase === "typing" ? `t${ph.deleting ? "-" : "+"}${ph.text}` : ph.phase;
        const was = shown.get(j.i);
        if (was === key) continue;
        shown.set(j.i, key);
        if (ph.phase === "waiting") continue;
        if (ph.phase === "marked") {
          sent.dataset.rf = "queued";
          // R1 marks it on the reader's tail: a purple sweep along the sentence.
          if (!reduce) sent.classList.add("rf-mark");
          continue;
        }
        if (ph.phase === "checking") {
          sent.dataset.rf = "inspect";
          continue;
        }
        if (ph.phase === "done" && !j.rewrite) {
          wrap.hidden = false;
          box.hidden = true;
          sent.dataset.rf = "kept";
          continue;
        }
        if (reduce && ph.phase !== "done") continue;
        wrap.hidden = true;
        box.hidden = false;
        const txt = box.firstElementChild as HTMLElement | null;
        const draft = txt?.nextElementSibling as HTMLElement | null;
        if (draft && ph.phase !== "typing") draft.textContent = "";
        if (!txt || !j.rewrite) continue;
        if (ph.phase === "erasing") {
          sent.dataset.rf = "erase";
          txt.textContent = j.original.slice(0, ph.left);
        } else if (ph.phase === "typing") {
          // What R2 has right so far, then its second thought (if one is on screen), being typed or taken back.
          sent.dataset.rf = ph.deleting ? "revise" : "type";
          txt.textContent = ph.text.slice(0, ph.typed);
          if (draft) draft.textContent = ph.text.slice(ph.typed);
        } else {
          sent.dataset.rf = "done";
          txt.textContent = swapped.current.get(j.n) ?? j.rewrite;
          // R3 and R4 only for a sentence seen being rewritten, not one already done when the view opened. On a real
          // order nothing goes to the chart until the detector has re-checked the text.
          if (was !== undefined && !reduce) {
            // Again after each polish.
            sent.classList.remove("rf-guarded");
            void sent.offsetWidth;
            sent.classList.add("rf-guarded");
            if (j.counts && !real) fly(sent);
          }
        }
      }

      // R1's eraser bar on the caret it erases from, else on the reader's tail; R2's pen on the caret it types at.
      if (!reduce) {
        let trail: HTMLElement | null = null;
        if (!erasing && !finished && f < total) {
          const p = scanPosition(plan, readerAt(Math.max(0, t - TRAIL_MS), readMs));
          const ws = words.current[Math.min(p.index, total - 1)];
          trail = ws?.[Math.max(0, Math.min(ws.length - 1, Math.floor(p.within * ws.length)))] ?? null;
        }
        place(eraser.current, erasing ?? trail, 4, 0, erasing ? 1 : 0.55);
        if (eraser.current) eraser.current.dataset.on = erasing ? "1" : "0";
        place(pen.current, typing, 4, 0);
      }

      // Keep the work in view: the sentence being rewritten (or just rewritten), else the reader. Not while the
      // customer scrolls.
      const sc = scroller.current;
      // Remember the sentence, not the caret: the caret is hidden once the sentence is done.
      if (focusSent) lastFocus = { el: focusSent, at: now };
      else if (lastFocus && now - lastFocus.at < 900) focus = lastFocus.el;
      if (!focus && f < total) {
        const ws = words.current[f];
        focus = ws?.[Math.max(0, Math.min(ws.length - 1, Math.floor(live.current.within * ws.length)))] ?? null;
      }
      if (sc && content.current && focus?.offsetParent && now - userScrolledAt.current > 4_000 && now - lastScroll > 700) {
        const inView = content.current.offsetTop + focus.offsetTop - sc.scrollTop;
        if (inView > sc.clientHeight * 0.62 || inView < sc.clientHeight * 0.1) {
          lastScroll = now;
          sc.scrollTo({ top: Math.max(0, sc.scrollTop + inView - sc.clientHeight * 0.32), behavior: "smooth" });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (litPara) delete litPara.dataset.polish;
    };
  }, [clockRef, reduce, total, plan, meter, readMs, real]);

  return (
    <div className="flex flex-col max-lg:h-[50dvh] lg:h-full">
      <AgentBar plan={plan} queue={queue} frontier={frontier} within={within} jobs={jobs} scanMs={scanMs} done={done} agents={agents} recheck={recheck} polishFrom={polishFrom} />
      <div
        ref={scroller}
        className="scan-doc relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-10 sm:py-7"
        onWheel={() => (userScrolledAt.current = performance.now())}
        onTouchMove={() => (userScrolledAt.current = performance.now())}
      >
        <div aria-hidden className="scan-doc-grid pointer-events-none absolute inset-0" />
        <div ref={content} className="relative mx-auto max-w-[72ch]">
          <div ref={xray} aria-hidden className="scan-xray pointer-events-none absolute -inset-x-3 top-0 opacity-0" />
          <Text plan={plan} queue={queue} spans={spans} words={words} wraps={wraps} lives={lives} />
          <div ref={marks} aria-hidden className="pointer-events-none absolute inset-0" />
          <div ref={read} aria-hidden className="scan-agent pointer-events-none absolute left-0 top-0 opacity-0" data-c="cyan">
            <span className="rf-tag">A1</span>
          </div>
          <div ref={eraser} aria-hidden className="rf-eraser pointer-events-none absolute left-0 top-0 opacity-0">
            <span className="rf-tag">R1</span>
          </div>
          <div ref={pen} aria-hidden className="rf-pen pointer-events-none absolute left-0 top-0 opacity-0">
            <span className="rf-tag">R2</span>
          </div>
        </div>
      </div>
    </div>
  );
});

/** The words, rendered once. A sentence to be rewritten also gets an empty box the suggestion is typed into. */
const Text = memo(function Text({
  plan,
  queue,
  spans,
  words,
  wraps,
  lives,
}: {
  plan: ScanPlan;
  queue: Set<number>;
  spans: React.RefObject<(HTMLSpanElement | null)[]>;
  words: React.RefObject<(HTMLSpanElement | null)[][]>;
  wraps: React.RefObject<(HTMLSpanElement | null)[]>;
  lives: React.RefObject<(HTMLSpanElement | null)[]>;
}) {
  return plan.paragraphs.map((para) => (
    <p key={para.p} className="mb-5 text-[15px] leading-[1.9] sm:text-[16px]">
      {plan.sentences.slice(para.first, para.last + 1).map((x, k) => {
        const i = para.first + k;
        return (
          <span key={x.n}>
            <span ref={(el) => void (spans.current[i] = el)} data-st="todo" className="scan-sent rf-sent">
              <span ref={(el) => void (wraps.current[i] = el)}>
                {x.words.map((w, j) => (
                  <Fragment key={j}>
                    {j ? " " : null}
                    <span ref={(el) => void ((words.current[i] ??= [])[j] = el)} className="scan-w">
                      {w}
                    </span>
                  </Fragment>
                ))}
              </span>
              {queue.has(x.n) && (
                <span ref={(el) => void (lives.current[i] = el)} hidden>
                  <span className="rf-txt" />
                  <span className="rf-draft" />
                  <span className="rf-caret" aria-hidden />
                </span>
              )}
            </span>{" "}
          </span>
        );
      })}
    </p>
  ));
});

/** What each agent is on right now, in order. */
function AgentBar({
  plan,
  queue,
  frontier,
  within,
  jobs,
  scanMs,
  done,
  agents,
  recheck,
  polishFrom,
}: {
  plan: ScanPlan;
  queue: Set<number>;
  frontier: number;
  within: number;
  jobs: RefineJob[];
  scanMs: number;
  done: boolean;
  agents: readonly Agent[];
  recheck?: StageRecheck;
  polishFrom: number | null;
}) {
  const total = plan.sentences.length;
  const f = Math.min(frontier, total - 1);
  const x = plan.sentences[f];
  const ahead = plan.sentences[f + 1];
  const over = done || frontier >= total;
  const flagged = plan.sentences.slice(0, frontier).filter((s) => queue.has(s.n)).length;
  const erasing = jobs.find((j) => jobPhase(j, scanMs).phase === "erasing") ?? null;
  const er = erasing ? jobPhase(erasing, scanMs) : null;
  const typing = jobs.find((j) => jobPhase(j, scanMs).phase === "typing") ?? null;
  const ty = typing ? jobPhase(typing, scanMs) : null;
  const waiting = jobs.find((j) => !j.known && jobPhase(j, scanMs).phase === "marked") ?? null;
  const checked = jobs.filter((j) => scanMs >= j.end);
  const passed = checked.filter((j) => j.rewrite).length;
  const target = [
    x && !over ? `P${x.p} S${x.s} · w${Math.max(1, Math.ceil(within * x.words.length))}/${x.words.length}` : "done",
    ahead && !over ? `P${ahead.p} S${ahead.s}` : over ? "done" : "last line",
    `${flagged}/${queue.size} locked`,
    erasing && er?.phase === "erasing" ? `P${erasing.p} S${erasing.s} · −${erasing.original.length - er.left}` : done ? "done" : "on A1's tail",
    typing?.rewrite && ty?.phase === "typing" ? `P${typing.p} S${typing.s} · ${ty.typed}/${typing.rewrite.length}` : done ? "done" : waiting ? `waiting for P${waiting.p} S${waiting.s}` : "standing by",
    `${passed} passed${checked.length > passed ? ` · ${checked.length - passed} kept` : ""}`,
    recheck ? r4Status(recheck, done) : `${clearedBy(jobs, scanMs)} sent to the chart`,
  ];
  // The polish pass while the re-check runs: R1, R2 and R3 on the sentence taken up again, R5 and R6 with them.
  const order = polishFrom === null ? [] : polishOrder(jobs);
  const pol = polishFrom === null ? null : polishAt(order, scanMs - polishFrom);
  if (pol) {
    const j = pol.job;
    const ph = polishPhase(j.rewrite ?? "", j.original, j.n * 31 + pol.k, pol.into);
    const pass = Math.floor(pol.k / order.length) + 1;
    target[3] = ph.phase === "typing" && ph.deleting ? `P${j.p} S${j.s} · taking back` : `polish pass ${pass}`;
    target[4] = ph.phase === "typing" ? `P${j.p} S${j.s} · polishing` : `P${j.p} S${j.s} · ✓`;
    target[5] = `${passed} passed · P${j.p} S${j.s} again`;
  }
  if (recheck) target.push(pol ? `¶${pol.job.p} · pass ${Math.floor(pol.k / order.length) + 1}` : done ? "done" : "waits for the rewrite", pol ? `P${pol.job.p} S${pol.job.s} · in your voice` : done ? "done" : "waits for the rewrite");
  return (
    <div className="scan-agentbar flex shrink-0 gap-1 overflow-x-auto border-b border-[#9b7bff]/20 bg-ink-950/70 px-3 py-2" aria-label="Rewrite agents">
      {agents.map((a, k) => (
        <div key={a.name} title={a.job} className="scan-chip flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[10px]" data-c={a.c}>
          <span className="scan-chip-dot" aria-hidden />
          <span className="font-semibold tracking-wider text-fg">{a.name}</span>
          <span className="tabular-nums text-fg-subtle">{target[k]}</span>
        </div>
      ))}
    </div>
  );
}

/** R4 RE-CHECK's chip: waiting for the rewrite, at work, or the real score (no rounds named). */
function r4Status(recheck: StageRecheck, over: boolean): string {
  if (recheck.check) return `${Math.round(recheck.check.score * 100)}%`;
  if (recheck.active && recheck.step) return "re-checking";
  return over ? (recheck.active ? "saving" : "not re-checked") : "waits for the rewrite";
}
