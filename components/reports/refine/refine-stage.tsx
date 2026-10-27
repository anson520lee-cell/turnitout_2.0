"use client";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { lookaheadLine, quote, thinkingLine, type LogLine, type ScanPlan } from "@/lib/auto-report/scan-script";
import { eraseLine, guardLine, jobPhase, keptLine, queuedLine, writeLine, type RefineJob } from "@/lib/auto-report/refine-script";
import type { ReportSentence } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";
import { Terminal, type TermLine } from "../scan/scan-panels";
import { RefineRatePanel, type RefineCounts } from "./refine-rate";
import type { RefineMeter } from "./refine-meter";

/**
 * The live rewrite: the report scan's layout (the text in the middle, terminal windows, the rate on the right),
 * with the same reader and lookahead at the front. Behind them the rewrite agents take each flagged sentence:
 * R1 erases it (its letters burst off the page), R2 types the suggestion character by character, and R3 confirms
 * that it kept the facts. A diff card follows the sentence being rewritten. Every sentence, suggestion and
 * reason shown is the real one.
 */

/** The scan clock as of the last render; the animation carries it on between renders. */
export interface RefineClock {
  at: number;
  wall: number;
  speed: number;
  held: boolean;
}
const clockNow = (c: RefineClock) => (c.held ? c.at : c.at + Math.max(0, performance.now() - c.wall) * c.speed);

const KEEP = 70;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const clock = (ms: number) => `${pad(Math.floor(ms / 60_000))}:${pad(Math.floor(ms / 1000) % 60)}.${Math.floor(ms / 100) % 10}`;
/** How long the diff card stays on a finished sentence before it goes. */
const HOLD_MS = 1_600;

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
}: {
  plan: ScanPlan;
  ratings: Map<number, ReportSentence>;
  /** Sentence numbers sent to the writer (pickFlagged). */
  queue: Set<number>;
  /** The rewriter's timetable, once the suggestions are in. */
  jobs: RefineJob[] | null;
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
}) {
  const total = plan.sentences.length;
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
      { tone: "info", text: `rewrite started · ${total} sentences · ${queue.size} to rewrite · pace 1.2×` },
      { tone: "dim", text: "5 agents deployed: A1 READ · A2 LOOKAHEAD · R1 ERASE · R2 WRITE · R3 GUARD" },
      ...(plan.sentences[1] ? [lookaheadLine(plan.sentences[1])] : []),
    ]);
    return () => timers.forEach(clearTimeout);
  }, [push, total, plan, queue]);

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
    if (!jobs) return;
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

  // The writer's own progress, as the request reports it.
  useEffect(() => {
    if (!jobs) return;
    const back = jobs.filter((j) => j.rewrite).length;
    push("agents", [{ tone: "ok", text: `writer · ${back} suggestion${back === 1 ? "" : "s"} back · ${jobs.length - back} kept as written · all checked` }]);
  }, [jobs, push]);
  const waited = useRef(waitedSecs);
  useEffect(() => {
    waited.current = waitedSecs;
  });
  useEffect(() => {
    if (jobs) return;
    const say = () => push("agents", [{ tone: "dim", text: `writer drafting ${queue.size} suggestion${queue.size === 1 ? "" : "s"} · ${waited.current}s` }]);
    say();
    const t = setInterval(say, 5_000);
    return () => clearInterval(t);
  }, [jobs, queue, push]);
  useEffect(() => {
    if (!done || !jobs) return;
    const made = jobs.filter((j) => j.rewrite).length;
    push("rewriter", [{ tone: "ok", text: `all ${jobs.length} sentences done · ${made} rewritten · ${jobs.length - made} kept` }]);
  }, [done, jobs, push]);

  // The diff card follows the sentence being rewritten, and stays a moment on the last one finished.
  const card = useMemo(() => {
    if (!jobs || done) return null;
    let pick: RefineJob | null = null;
    for (const j of jobs) if (scanMs >= j.start && scanMs < j.end + HOLD_MS) pick = j;
    return pick;
  }, [jobs, scanMs, done]);

  const lead = plan.sentences[Math.min(frontier, total - 1)];
  const readerLive =
    lead && frontier < total ? (
      <p className="break-words text-cyan">
        <span className="mr-2 text-fg-subtle/50">{clock(scanMs)}</span>› P{lead.p} S{lead.s} {lead.words.slice(0, Math.max(1, Math.ceil(within * lead.words.length))).join(" ")}
        <span className="scan-caret" aria-hidden />
      </p>
    ) : null;

  const rateProps = { meter, ready: true, final: done, original, counts, reduce };

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
        <RefineDocument plan={plan} ratings={ratings} queue={queue} jobs={jobs} frontier={frontier} within={within} scanMs={scanMs} clockRef={clockRef} reduce={reduce} done={done} />
        <AnimatePresence>
          {card && (
            <motion.div
              key={card.n}
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="absolute bottom-3 right-3 z-20 w-[min(380px,calc(100%-24px))]"
            >
              <DiffCard job={card} clockRef={clockRef} />
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

      <aside className="hidden min-h-0 rounded-2xl border border-[#9b7bff]/25 bg-ink-950/80 p-4 xl:block" aria-label="AI rate, original and projected">
        <RefineRatePanel {...rateProps} />
      </aside>
    </div>
  );
}

/**
 * The diff card: the sentence being rewritten, its original struck out as R1 erases it and the suggestion
 * appearing as R2 types it, with the reviewer's reason it answers. Once typed, R3's checks light up one by one.
 * The text is written straight to the page every frame, in step with the text itself.
 */
function DiffCard({ job, clockRef }: { job: RefineJob; clockRef: React.RefObject<RefineClock> }) {
  const card = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLSpanElement>(null);
  const gone = useRef<HTMLSpanElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ph = jobPhase(job, clockNow(clockRef.current));
      const left = ph.phase === "erasing" ? ph.left : ph.phase === "waiting" || !job.rewrite ? job.original.length : 0;
      const n = ph.phase === "typing" ? ph.typed : ph.phase === "done" ? (job.rewrite?.length ?? 0) : 0;
      const key = `${ph.phase}:${left}:${n}`;
      if (key === last || !keep.current || !gone.current || !card.current) return;
      last = key;
      keep.current.textContent = job.original.slice(0, left);
      gone.current.textContent = job.original.slice(left);
      if (typed.current && job.rewrite) typed.current.textContent = job.rewrite.slice(0, n);
      card.current.dataset.ph = job.rewrite ? ph.phase : ph.phase === "done" ? "kept" : "inspect";
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [job, clockRef]);
  const ratio = job.rewrite ? Math.round((job.rewrite.length / Math.max(1, job.original.length)) * 100) : 0;
  return (
    <div ref={card} data-ph="waiting" className="rf-diff scan-term overflow-hidden rounded-xl border border-[#9b7bff]/40 bg-ink-950/90 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.95),0_0_40px_-12px_rgb(155_123_255/0.6)]">
      <div className="flex items-center gap-2 border-b border-[#9b7bff]/20 bg-[#9b7bff]/[0.07] px-3 py-1.5">
        <span className="size-2 rounded-full bg-[#9b7bff] shadow-[0_0_8px_#9b7bff]" aria-hidden />
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-fg-muted">
          diff.log · P{job.p} S{job.s}
        </span>
        <span className="rf-diff-state ml-auto font-mono text-[9.5px] uppercase tracking-[0.18em]" />
      </div>
      <div className="space-y-1.5 px-3 py-2.5 font-mono text-[11px] leading-[1.55]">
        {job.why && <p className="line-clamp-2 text-fg-subtle">fixing · {job.why}</p>}
        <p className="break-words">
          <span className="mr-1.5 text-[#c99bff]">−</span>
          <span ref={keep} className="text-fg-muted" />
          <span ref={gone} className="rf-diff-gone" />
        </p>
        <p className="break-words text-[#e9e3ff]">
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
            <span>✓ facts</span>
            <span>✓ names</span>
            <span>✓ citations</span>
            <span>✓ hedges</span>
            <span className="text-fg-subtle">length {ratio}%</span>
          </p>
        )}
      </div>
    </div>
  );
}

const AGENTS = [
  { c: "cyan", name: "A1 READ", job: "Reads your text word by word" },
  { c: "violet", name: "A2 LOOKAHEAD", job: "Looks one line ahead" },
  { c: "purple", name: "R1 ERASE", job: "Erases each flagged sentence" },
  { c: "lilac", name: "R2 WRITE", job: "Types the suggestion, character by character" },
  { c: "accent", name: "R3 GUARD", job: "Confirms each suggestion kept your facts, names, citations and hedges" },
] as const;

/**
 * The text, with the reader and lookahead at the front exactly as in the report scan, and the rewrite behind them.
 * States are written straight onto the spans, so the text is rendered by React only once.
 */
const RefineDocument = memo(function RefineDocument({
  plan,
  ratings,
  queue,
  jobs,
  frontier,
  within,
  scanMs,
  clockRef,
  reduce,
  done,
}: {
  plan: ScanPlan;
  ratings: Map<number, ReportSentence>;
  queue: Set<number>;
  jobs: RefineJob[] | null;
  frontier: number;
  within: number;
  scanMs: number;
  clockRef: React.RefObject<RefineClock>;
  reduce: boolean;
  done: boolean;
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
  const shards = useRef<HTMLDivElement>(null);
  const live = useRef({ frontier, within, done, jobs });
  useLayoutEffect(() => {
    live.current = { frontier, within, done, jobs };
  });
  const userScrolledAt = useRef(-Infinity);

  // Reader states, as in the report scan: dim until read, lit while read, marked by the report once read.
  useEffect(() => {
    const list = spans.current;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el) continue;
      const n = plan.sentences[i].n;
      const st = i < frontier ? (ratings.get(n)?.risk ?? "low") : i === frontier ? "active" : "todo";
      if (el.dataset.st !== st) {
        el.dataset.st = st;
        if ((st === "high" || st === "medium") && !reduce) {
          el.classList.remove("scan-hit");
          void el.offsetWidth;
          el.classList.add("scan-hit");
        }
      }
      if (i < frontier && queue.has(n) && !el.dataset.rf) el.dataset.rf = "queued";
    }
  }, [frontier, ratings, queue, plan, reduce]);

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

  // The rewrite, every frame: erase the original (its letters burst off), type the suggestion, let the new ink cool.
  useEffect(() => {
    let raf = 0;
    let lastScroll = 0;
    let alive = 0;
    const shown = new Map<number, string>();
    const standing = new Map<number, number>();
    const burst = (caret: HTMLElement, chars: string) => {
      const box = shards.current;
      if (reduce || !box) return;
      for (const ch of chars.replace(/\s+/g, "").slice(-4)) {
        if (alive >= 64) return;
        const s = document.createElement("span");
        s.className = "rf-shard";
        s.textContent = ch;
        s.style.left = `${caret.offsetLeft}px`;
        s.style.top = `${caret.offsetTop}px`;
        s.style.setProperty("--dx", `${(Math.random() * 1.6 - 0.4) * 90}px`);
        s.style.setProperty("--dy", `${-(24 + Math.random() * 70)}px`);
        s.style.setProperty("--r", `${(Math.random() - 0.5) * 220}deg`);
        alive += 1;
        s.addEventListener("animationend", () => {
          s.remove();
          alive -= 1;
        });
        box.appendChild(s);
      }
    };
    // The last place the rewrite worked, so the view stays on it between sentences instead of jumping to the reader.
    let lastFocus: { el: HTMLElement; at: number } | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { jobs: list, frontier: f } = live.current;
      const t = clockNow(clockRef.current);
      const now = performance.now();
      let focus: HTMLElement | null = null;
      if (list) {
        for (const j of list) {
          const sent = spans.current[j.i];
          const wrap = wraps.current[j.i];
          const box = lives.current[j.i];
          if (!sent || !wrap || !box) continue;
          const ph = jobPhase(j, t);
          const key = ph.phase === "erasing" ? `e${ph.left}` : ph.phase === "typing" ? `t${ph.typed}` : ph.phase;
          const active = ph.phase === "erasing" || ph.phase === "typing";
          if (active) focus = j.rewrite && !reduce ? (box.lastElementChild as HTMLElement | null) : sent;
          if (shown.get(j.i) === key) continue;
          shown.set(j.i, key);
          if (ph.phase === "waiting") continue;
          const txt = box.firstElementChild as HTMLElement | null;
          if (!j.rewrite) {
            sent.dataset.rf = ph.phase === "done" ? "kept" : "inspect";
            continue;
          }
          if (reduce && ph.phase !== "done") continue;
          wrap.hidden = true;
          box.hidden = false;
          if (!txt) continue;
          if (ph.phase === "erasing") {
            sent.dataset.rf = "erase";
            txt.textContent = j.original.slice(0, ph.left);
            const was = standing.get(j.i) ?? j.original.length;
            if (was > ph.left && box.lastElementChild) burst(box.lastElementChild as HTMLElement, j.original.slice(ph.left, was));
            standing.set(j.i, ph.left);
          } else if (ph.phase === "typing") {
            sent.dataset.rf = "type";
            txt.textContent = j.rewrite.slice(0, ph.typed);
          } else {
            sent.dataset.rf = "done";
            txt.textContent = j.rewrite;
          }
        }
      }
      // Keep the work in view: the sentence being rewritten (or just rewritten), else the reader. Not while the customer scrolls.
      const sc = scroller.current;
      if (focus) lastFocus = { el: focus, at: now };
      else if (lastFocus && now - lastFocus.at < 900) focus = lastFocus.el;
      if (!focus && f < total) {
        const ws = words.current[f];
        focus = ws?.[Math.max(0, Math.min(ws.length - 1, Math.floor(live.current.within * ws.length)))] ?? null;
      }
      if (sc && content.current && focus && now - userScrolledAt.current > 4_000 && now - lastScroll > 700) {
        const inView = content.current.offsetTop + focus.offsetTop - sc.scrollTop;
        if (inView > sc.clientHeight * 0.62 || inView < sc.clientHeight * 0.1) {
          lastScroll = now;
          sc.scrollTo({ top: Math.max(0, sc.scrollTop + inView - sc.clientHeight * 0.32), behavior: "smooth" });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [clockRef, reduce, total]);

  return (
    <div className="flex flex-col max-lg:h-[50dvh] lg:h-full">
      <AgentBar plan={plan} frontier={frontier} within={within} jobs={jobs} scanMs={scanMs} done={done} />
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
          <div ref={shards} aria-hidden className="pointer-events-none absolute inset-0" />
          <div ref={read} aria-hidden className="scan-agent pointer-events-none absolute left-0 top-0 opacity-0" data-c="cyan" />
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
function AgentBar({ plan, frontier, within, jobs, scanMs, done }: { plan: ScanPlan; frontier: number; within: number; jobs: RefineJob[] | null; scanMs: number; done: boolean }) {
  const total = plan.sentences.length;
  const f = Math.min(frontier, total - 1);
  const x = plan.sentences[f];
  const ahead = plan.sentences[f + 1];
  const over = done || frontier >= total;
  const active = jobs?.find((j) => scanMs >= j.start && scanMs < j.end) ?? null;
  const ph = active ? jobPhase(active, scanMs) : null;
  const checked = jobs ? jobs.filter((j) => scanMs >= j.end) : [];
  const passed = checked.filter((j) => j.rewrite).length;
  const target = [
    x && !over ? `P${x.p} S${x.s} · w${Math.max(1, Math.ceil(within * x.words.length))}/${x.words.length}` : "done",
    ahead && !over ? `P${ahead.p} S${ahead.s}` : over ? "done" : "last line",
    active && ph?.phase === "erasing" ? `P${active.p} S${active.s} · −${active.original.length - ph.left}` : done ? "done" : jobs ? "next flag" : "waiting",
    active?.rewrite && ph?.phase === "typing" ? `P${active.p} S${active.s} · ${ph.typed}/${active.rewrite.length}` : done ? "done" : jobs ? "standing by" : "drafting",
    `${passed} passed${checked.length > passed ? ` · ${checked.length - passed} kept` : ""}`,
  ];
  return (
    <div className="scan-agentbar flex shrink-0 gap-1 overflow-x-auto border-b border-[#9b7bff]/20 bg-ink-950/70 px-3 py-2" aria-label="Rewrite agents">
      {AGENTS.map((a, k) => (
        <div key={a.name} title={a.job} className="scan-chip flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[10px]" data-c={a.c}>
          <span className="scan-chip-dot" aria-hidden />
          <span className="font-semibold tracking-wider text-fg">{a.name}</span>
          <span className="tabular-nums text-fg-subtle">{target[k]}</span>
        </div>
      ))}
    </div>
  );
}
