"use client";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  contextLine,
  lookaheadLine,
  paragraphLine,
  quote,
  reviewerLines,
  thinkingLine,
  verifyLine,
  type LogLine,
  type ScanPlan,
} from "@/lib/auto-report/scan-script";
import type { AutoReportResult, Level, ReportSentence } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";
import { RatePanel, TERMS, Terminal, type TermId, type TermLine } from "./scan-panels";
import type { RateMeter } from "./rate-meter";
import type { ReportFeed } from "./use-report-feed";

/**
 * The live scan: the customer's own text is the main picture, with four scan
 * agents working through it in order, each with its own job, a set of terminal
 * windows logging what is read and found, and the AI rate on the far right. Sentences are rated only from the
 * finished report: the scan shows each sentence's real rating as it passes it.
 */

const KEEP = 70;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const clock = (ms: number) => `${pad(Math.floor(ms / 60_000))}:${pad(Math.floor(ms / 1000) % 60)}.${Math.floor(ms / 100) % 10}`;

type Logs = Record<TermId, TermLine[]>;
interface Verify {
  key: number;
  sentence: ReportSentence;
  p: number;
  s: number;
}

export function ScanStage({
  plan,
  result,
  ratings,
  feed,
  frontier,
  within,
  revealed,
  meter,
  estimate,
  elapsedMs,
  reduce,
  done,
}: {
  plan: ScanPlan;
  result: AutoReportResult | null;
  ratings: Map<number, ReportSentence> | null;
  feed: ReportFeed;
  /** Index of the sentence being read (equals the sentence count once all are read). */
  frontier: number;
  /** How far into that sentence, 0 to 1. */
  within: number;
  /** Sentences whose rating is shown, from the start. */
  revealed: number;
  meter: RateMeter;
  /** The real live estimate, or null before the first rating is shown. */
  estimate: number | null;
  elapsedMs: number;
  reduce: boolean;
  done: boolean;
}) {
  const total = plan.sentences.length;
  const [logs, setLogs] = useState<Logs>({ reader: [], reviewer: [], agents: [] });
  const [open, setOpen] = useState<Record<TermId, boolean>>({ reader: false, reviewer: false, agents: false });
  const [mini, setMini] = useState<Record<TermId, boolean>>({ reader: false, reviewer: false, agents: false });
  const [tab, setTab] = useState<TermId>("reviewer");
  const [verify, setVerify] = useState<Verify | null>(null);
  const touched = useRef(new Set<TermId>());
  const seq = useRef(0);
  const elapsedRef = useRef(elapsedMs);
  useEffect(() => {
    elapsedRef.current = elapsedMs;
  });

  const push = useCallback((id: TermId, lines: LogLine[]) => {
    if (!lines.length) return;
    const t = clock(elapsedRef.current);
    setLogs((l) => ({ ...l, [id]: [...l[id], ...lines.map((x) => ({ ...x, id: seq.current++, t }))].slice(-KEEP) }));
  }, []);

  // Windows open one after another as the scan starts, unless the customer has already opened or closed them.
  useEffect(() => {
    const timers = TERMS.map((term, i) =>
      setTimeout(() => {
        if (!touched.current.has(term.id)) setOpen((o) => ({ ...o, [term.id]: true }));
      }, 400 + i * 1300),
    );
    push("agents", [
      { tone: "info", text: `scan started · ${total} sentences · ${plan.paragraphs.length} paragraphs` },
      { tone: "dim", text: "4 agents deployed: A1 READ · A2 LOOKAHEAD · A3 VERIFY · A4 CONTEXT" },
      contextLine(1, "start", plan.paragraphs.length),
      ...(plan.sentences[1] ? [lookaheadLine(plan.sentences[1])] : []),
    ]);
    return () => timers.forEach(clearTimeout);
  }, [push, total, plan]);

  const toggle = (id: TermId) => {
    touched.current.add(id);
    setOpen((o) => ({ ...o, [id]: !o[id] }));
    setTab(id);
  };

  // Reader: one line per finished sentence. The other agents report in step:
  // the lookahead on the sentence ahead, verify on the one two behind, context
  // as paragraphs start and finish. None of it says how a sentence is judged.
  const prevFrontier = useRef(0);
  useEffect(() => {
    const from = prevFrontier.current;
    prevFrontier.current = frontier;
    if (frontier <= from) return;
    const start = Math.max(from, frontier - 6);
    const lines: LogLine[] = [];
    const side: LogLine[] = [];
    for (let i = start; i < frontier && i < total; i++) {
      const x = plan.sentences[i];
      lines.push({ tone: "ok", text: `✓ P${x.p} S${x.s} read · ${quote(x.text, 34)}` });
      const ahead = plan.sentences[i + 2];
      if (ahead) side.push(i % 3 === 1 ? thinkingLine(ahead) : lookaheadLine(ahead));
      if (i >= 2) side.push(verifyLine(plan.sentences[i - 2]));
      const para = plan.paragraphs.find((p) => p.last === i);
      if (para) {
        lines.push({ tone: "info", text: `¶${para.p} read · ${para.last - para.first + 1} sentences` });
        side.push(contextLine(para.p, "end", plan.paragraphs.length));
        const next = plan.paragraphs.find((p) => p.first === i + 1);
        if (next) side.push(contextLine(next.p, "start", plan.paragraphs.length));
      }
    }
    if (frontier >= total) for (let i = Math.max(0, total - 2); i < total; i++) side.push(verifyLine(plan.sentences[i]));
    push("reader", lines);
    push("agents", side);
  }, [frontier, plan, total, push]);

  // Reviewer: each sentence's real rating and reasons as the scan shows them; paragraph tallies; grammar spots.
  const prevRevealed = useRef(0);
  const lastVerify = useRef(-Infinity);
  const grammarAt = useMemo(() => new Map((result?.grammar ?? []).map((g) => [g.n, g.issue])), [result]);
  useEffect(() => {
    if (!ratings || !result) return;
    const from = prevRevealed.current;
    prevRevealed.current = revealed;
    if (revealed <= from) return;
    const burst = revealed - from > 8;
    const out: LogLine[] = [];
    const side: LogLine[] = [];
    let quiet = 0;
    for (let i = from; i < revealed && i < total; i++) {
      const x = plan.sentences[i];
      const rated = ratings.get(x.n);
      if (burst && (!rated || rated.risk === "low")) quiet += 1;
      else {
        if (quiet) out.push({ tone: "dim", text: `… ${quiet} sentence${quiet === 1 ? "" : "s"} → low` });
        quiet = 0;
        out.push(...reviewerLines(x, rated));
      }
      const issue = grammarAt.get(x.n);
      if (issue) side.push({ tone: "violet", text: `A3 VERIFY · P${x.p} S${x.s} · language note added to your report` });
      const para = plan.paragraphs.find((p) => p.last === i);
      const rp = para && result.paragraphs.find((p) => p.p === para.p);
      if (rp) out.push(paragraphLine(rp.p, rp.sentences, rp.risk));
      if (rated?.risk === "high" && !burst && elapsedRef.current - lastVerify.current > 9_000) {
        lastVerify.current = elapsedRef.current;
        setVerify({ key: x.n, sentence: rated, p: x.p, s: x.s });
      }
    }
    if (quiet) out.push({ tone: "dim", text: `… ${quiet} sentence${quiet === 1 ? "" : "s"} → low` });
    if (burst) out.unshift({ tone: "info", text: `applying ratings to ${revealed - from} sentences already read` });
    push("reviewer", out);
    push("agents", side);
  }, [revealed, ratings, result, plan, total, grammarAt, push]);

  useEffect(() => {
    if (!verify) return;
    const t = setTimeout(() => setVerify(null), 5_500);
    return () => clearTimeout(t);
  }, [verify]);

  // The real run's progress, as it reports it.
  const prevReviewed = useRef(0);
  useEffect(() => {
    if (feed.reviewed > prevReviewed.current && feed.total) {
      push("agents", [{ tone: "ok", text: `reviewer · section ${feed.reviewed}/${feed.total} returned` }]);
      if (feed.result) push("reviewer", [{ tone: "ok", text: `all ${feed.total} section${feed.total === 1 ? "" : "s"} reviewed · ${result?.summary.sentences ?? total} sentences rated` }]);
    }
    prevReviewed.current = feed.reviewed;
  }, [feed.reviewed, feed.total, feed.result, result, total, push]);
  useEffect(() => {
    if (ratings) return;
    const since = performance.now();
    const say = () => {
      const s = Math.round((performance.now() - since) / 1000);
      push("reviewer", [
        feed.paused
          ? { tone: "warn", text: "reviewer queue busy · waiting for a free slot" }
          : feed.trouble
            ? { tone: "warn", text: "connection hiccup · retrying, nothing is lost" }
            : { tone: "dim", text: `reviewer working · ${feed.reviewed}/${feed.total || plan.pieces} sections returned${s ? ` · ${s}s` : ""}` },
      ]);
    };
    say();
    const t = setInterval(say, 5_000);
    return () => clearInterval(t);
  }, [ratings, feed.paused, feed.trouble, feed.reviewed, feed.total, plan.pieces, push]);

  const counts = useMemo(() => {
    const c: Record<Level, number> = { high: 0, medium: 0, uncertain: 0, low: 0 };
    if (ratings) for (let i = 0; i < revealed && i < total; i++) c[ratings.get(plan.sentences[i].n)?.risk ?? "low"] += 1;
    return c;
  }, [ratings, revealed, plan, total]);

  const lead = plan.sentences[Math.min(frontier, total - 1)];
  const readerLive =
    lead && frontier < total ? (
      <p className="break-words text-cyan">
        <span className="mr-2 text-fg-subtle/50">{clock(elapsedMs)}</span>› P{lead.p} S{lead.s} {lead.words.slice(0, Math.max(1, Math.ceil(within * lead.words.length))).join(" ")}
        <span className="scan-caret" aria-hidden />
      </p>
    ) : null;

  const rateProps = {
    meter,
    estimate: estimate ?? 0,
    ready: estimate !== null,
    final: done,
    scanned: ratings ? Math.min(revealed, total) : 0,
    total,
    high: counts.high,
    medium: counts.medium,
    uncertain: counts.uncertain,
  };

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
      <div className="rounded-xl border border-[var(--line-strong)] bg-ink-950/80 px-3.5 py-2.5 lg:hidden">
        <RatePanel {...rateProps} compact />
      </div>

      <section className="relative min-h-0 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-950/70" aria-label="Your text, being scanned">
        <Document plan={plan} frontier={frontier} within={within} revealed={revealed} ratings={ratings} grammar={grammarAt} reduce={reduce} done={done} />
        <AnimatePresence>
          {verify && (
            <motion.div
              key={verify.key}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="absolute bottom-3 right-3 z-20 w-[min(360px,calc(100%-24px))]"
            >
              <Terminal
                title={`verify.log · P${verify.p} S${verify.s}`}
                dot="bg-risk"
                onClose={() => setVerify(null)}
                lines={[
                  { id: 1, t: "high", tone: "risk", text: quote(verify.sentence.text, 140) },
                  { id: 2, t: "    ", tone: "info", text: "rated HIGH by the reviewer" },
                  { id: 3, t: "    ", tone: "dim", text: "the reasons are in your report" },
                ]}
                bodyClassName="max-h-44"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="flex min-h-0 flex-col gap-2.5" aria-label="Scan logs">
        <div className="hidden rounded-xl border border-[var(--line-strong)] bg-ink-950/80 px-3.5 py-2.5 lg:block xl:hidden">
          <RatePanel {...rateProps} compact />
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
                open[t.id] ? "lg:border-accent/50 lg:bg-accent/15 lg:text-fg" : "lg:border-[var(--line)] lg:text-fg-subtle",
                tab === t.id ? "max-lg:border-accent/60 max-lg:bg-accent/15 max-lg:text-fg" : "max-lg:border-[var(--line)] max-lg:text-fg-subtle",
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
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -8 }}
                transition={{ type: "spring", stiffness: 340, damping: 30 }}
                className={cn("flex min-h-0 flex-col", mini[t.id] ? "shrink-0" : "flex-1")}
              >
                {terminalFor(t.id)}
              </motion.div>
            ))}
          </AnimatePresence>
          {!TERMS.some((t) => open[t.id]) && <p className="px-1 font-mono text-[11px] text-fg-subtle">All windows closed. Tap a log above to open it.</p>}
        </div>
      </aside>

      <aside className="hidden min-h-0 rounded-2xl border border-[var(--line-strong)] bg-ink-950/80 p-4 xl:block" aria-label="AI rate">
        <RatePanel {...rateProps} />
      </aside>
    </div>
  );
}

const AGENTS = [
  { c: "cyan", name: "A1 READ", job: "Reads your text word by word" },
  { c: "violet", name: "A2 LOOKAHEAD", job: "Looks one line ahead" },
  { c: "warn", name: "A3 VERIFY", job: "Follows behind, re-reading each sentence" },
  { c: "accent", name: "A4 CONTEXT", job: "Keeps the whole paragraph in view" },
] as const;

/**
 * The text itself, with the four scan agents working through it in order:
 * A1 reads the current word, A2's lens sweeps the line ahead, A3's yellow
 * bar flickers between words behind the reader, and A4 brackets the paragraph being read.
 * States are written straight onto the spans and the agents are moved with
 * transforms, so the text is rendered by React only once.
 */
const Document = memo(function Document({
  plan,
  frontier,
  within,
  revealed,
  ratings,
  grammar,
  reduce,
  done,
}: {
  plan: ScanPlan;
  frontier: number;
  within: number;
  revealed: number;
  ratings: Map<number, ReportSentence> | null;
  grammar: Map<number, string>;
  reduce: boolean;
  done: boolean;
}) {
  const total = plan.sentences.length;
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const words = useRef<(HTMLSpanElement | null)[][]>([]);
  const read = useRef<HTMLDivElement>(null);
  const xray = useRef<HTMLDivElement>(null);
  const flick = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const rulerN = useRef<HTMLSpanElement>(null);
  const live = useRef({ frontier, within, done });
  useLayoutEffect(() => {
    live.current = { frontier, within, done };
  });
  const userScrolledAt = useRef(-Infinity);
  // Sentence states; grammar notes A3 has passed.
  useEffect(() => {
    const list = spans.current;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el) continue;
      let st: string;
      if (ratings && i < revealed) st = ratings.get(plan.sentences[i].n)?.risk ?? "low";
      else if (i < frontier) st = "read";
      else if (i === frontier) st = "active";
      else st = "todo";
      if (el.dataset.st !== st) {
        const hit = st === "high" || st === "medium";
        el.dataset.st = st;
        if (hit && !reduce) {
          el.classList.remove("scan-hit");
          void el.offsetWidth;
          el.classList.add("scan-hit");
        }
      }
      el.toggleAttribute("data-gr", Boolean(ratings) && i < revealed && (i < frontier - 2 || frontier >= total) && grammar.has(plan.sentences[i].n));
    }
  }, [frontier, revealed, ratings, grammar, plan, total, reduce]);

  // The agents, moved every few frames.
  useEffect(() => {
    if (reduce || !total) return;
    const at = (el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    const wordAt = (i: number, f: number) => {
      const ws = words.current[i];
      if (!ws?.length) return null;
      return ws[Math.max(0, Math.min(ws.length - 1, Math.floor(f * ws.length)))];
    };
    const hide = (...els: (HTMLElement | null)[]) => els.forEach((el) => el && (el.style.opacity = "0"));
    let lastScroll = 0;
    const paraOf = plan.sentences.map((_, i) => plan.paragraphs.find((p) => p.first <= i && i <= p.last));
    const tick = () => {
      const { frontier: f, within: wn, done: finished } = live.current;
      if (finished || f >= total) {
        hide(read.current, xray.current, ruler.current);
        return;
      }
      const now = performance.now();
      const lead = wordAt(f, wn);
      if (!lead) return;
      const r = at(lead);
      // A1 READ: the word being read.
      if (read.current) {
        read.current.style.transform = `translate3d(${r.x - 4}px, ${r.y - 3}px, 0)`;
        read.current.style.width = `${Math.max(18, r.w + 8)}px`;
        read.current.style.height = `${r.h + 6}px`;
        read.current.style.opacity = "1";
      }
      // A2 LOOKAHEAD: the next line down.
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
      // A4 CONTEXT: a bracket down the margin over the paragraph being read.
      const para = paraOf[f];
      const first = para && words.current[para.first]?.[0];
      const lastWs = para && words.current[para.last];
      const last = lastWs?.[lastWs.length - 1];
      if (para && first && last && ruler.current) {
        const top = first.offsetTop;
        ruler.current.style.transform = `translate3d(0, ${top}px, 0)`;
        ruler.current.style.height = `${Math.max(r.h, last.offsetTop + last.offsetHeight - top)}px`;
        ruler.current.style.opacity = "1";
        if (rulerN.current) rulerN.current.textContent = `¶${para.p}`;
      }
      // Keep the reading position in view, unless the customer is scrolling the text themselves.
      const sc = scroller.current;
      if (sc && content.current && now - userScrolledAt.current > 4_000 && now - lastScroll > 700) {
        const inView = content.current.offsetTop + r.y - sc.scrollTop;
        if (inView > sc.clientHeight * 0.62 || inView < sc.clientHeight * 0.1) {
          lastScroll = now;
          sc.scrollTo({ top: Math.max(0, sc.scrollTop + inView - sc.clientHeight * 0.32), behavior: "smooth" });
        }
      }
    };
    // A3 VERIFY: a flickering yellow bar. It jumps at random between a few words behind the reader, fast and
    // never in the same rhythm twice, while its home drifts slowly after the blue cell. It stays clear of the blue cell.
    const flat: HTMLElement[] = [];
    const firstOf: number[] = [];
    words.current.forEach((ws, i) => {
      firstOf[i] = flat.length;
      ws.forEach((el) => el && flat.push(el));
    });
    let home = 0;
    let nextJump = 0;
    let lastEl: HTMLElement | null = null;
    let lastSpan = 0;
    const flickTick = () => {
      const bar = flick.current;
      const echo = ghost.current;
      if (!bar || !echo) return;
      const { frontier: f, within: wn, done: finished } = live.current;
      if (finished || f >= total) {
        bar.style.opacity = "0";
        echo.style.opacity = "0";
        return;
      }
      const now = performance.now();
      const ws = words.current[f] ?? [];
      const reader = (firstOf[f] ?? 0) + Math.min(Math.max(0, ws.length - 1), Math.floor(wn * ws.length));
      // Home follows the reader slowly, always a few words back; the bar never lands on the blue cell.
      home += (Math.max(0, reader - 9) - home) * 0.035;
      if (reader < 3) {
        bar.style.opacity = "0";
        echo.style.opacity = "0";
        return;
      }
      if (now < nextJump) {
        // Between jumps the bar shimmers.
        bar.style.opacity = String(0.55 + Math.random() * 0.45);
        return;
      }
      nextJump = now + 55 + Math.random() * Math.random() * 330;
      const target = Math.round(home + (Math.random() - 0.5) * 9);
      const idx = Math.max(0, Math.min(reader - 2, target));
      const el = flat[idx];
      if (!el || el === lastEl) return;
      // One to three words wide, kept on the line of the first.
      let end = el;
      for (let k = 1, more = Math.floor(Math.random() * 3); k <= more; k++) {
        const w = flat[idx + k];
        if (w && idx + k <= reader - 2 && w.offsetTop === el.offsetTop) end = w;
      }
      const span = end.offsetLeft + end.offsetWidth - el.offsetLeft;
      if (lastEl) {
        echo.style.transform = `translate3d(${lastEl.offsetLeft - 2}px, ${lastEl.offsetTop + lastEl.offsetHeight - 3}px, 0)`;
        echo.style.width = `${lastSpan + 4}px`;
        echo.style.transition = "none";
        echo.style.opacity = "0.7";
        void echo.offsetWidth;
        echo.style.transition = "opacity 0.28s ease-out";
        echo.style.opacity = "0";
      }
      lastEl = el;
      lastSpan = span;
      bar.style.transform = `translate3d(${el.offsetLeft - 2}px, ${el.offsetTop + el.offsetHeight - 3}px, 0)`;
      bar.style.width = `${span + 4}px`;
      bar.style.opacity = "1";
    };
    const tf = setInterval(flickTick, 45);
    const t = setInterval(tick, 60);
    const ro = new ResizeObserver(tick);
    if (content.current) ro.observe(content.current);
    return () => {
      clearInterval(t);
      clearInterval(tf);
      ro.disconnect();
    };
  }, [total, reduce, plan]);

  return (
    <div className="flex flex-col max-lg:h-[50dvh] lg:h-full">
      <AgentBar plan={plan} frontier={frontier} within={within} done={done} />
      <div
        ref={scroller}
        className="scan-doc relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-10 sm:py-7"
        onWheel={() => (userScrolledAt.current = performance.now())}
        onTouchMove={() => (userScrolledAt.current = performance.now())}
      >
        <div aria-hidden className="scan-doc-grid pointer-events-none absolute inset-0" />
        <div ref={content} className="relative mx-auto max-w-[72ch]">
          <div ref={xray} aria-hidden className="scan-xray pointer-events-none absolute -inset-x-3 top-0 opacity-0" />
          <Text plan={plan} spans={spans} words={words} />
          <div ref={ruler} aria-hidden className="scan-ruler pointer-events-none absolute top-0 opacity-0">
            <span ref={rulerN} className="scan-ruler-n" />
          </div>
          <div ref={ghost} aria-hidden className="scan-flick scan-flick-ghost pointer-events-none absolute left-0 top-0 opacity-0" />
          <div ref={flick} aria-hidden className="scan-flick pointer-events-none absolute left-0 top-0 opacity-0" />
          <div ref={read} aria-hidden className="scan-agent pointer-events-none absolute left-0 top-0 opacity-0" data-c="cyan" />
        </div>
      </div>
    </div>
  );
});

/** The words, rendered once. Each word is its own span so the agents can find it. */
const Text = memo(function Text({
  plan,
  spans,
  words,
}: {
  plan: ScanPlan;
  spans: React.RefObject<(HTMLSpanElement | null)[]>;
  words: React.RefObject<(HTMLSpanElement | null)[][]>;
}) {
  return plan.paragraphs.map((para) => (
    <p key={para.p} className="mb-5 text-[15px] leading-[1.9] sm:text-[16px]">
      {plan.sentences.slice(para.first, para.last + 1).map((x, k) => {
        const i = para.first + k;
        return (
          <span key={x.n}>
            <span ref={(el) => void (spans.current[i] = el)} data-st="todo" className="scan-sent">
              {x.words.map((w, j) => (
                <Fragment key={j}>
                  {j ? " " : null}
                  <span ref={(el) => void ((words.current[i] ??= [])[j] = el)} className="scan-w">
                    {w}
                  </span>
                </Fragment>
              ))}
            </span>{" "}
          </span>
        );
      })}
    </p>
  ));
});

/** What each agent is on right now, in order. */
function AgentBar({ plan, frontier, within, done }: { plan: ScanPlan; frontier: number; within: number; done: boolean }) {
  const total = plan.sentences.length;
  const f = Math.min(frontier, total - 1);
  const x = plan.sentences[f];
  const ahead = plan.sentences[f + 1];
  const behind = plan.sentences[f - 2];
  const para = plan.paragraphs.find((p) => p.first <= f && f <= p.last);
  const over = done || frontier >= total;
  const target = [
    x && !over ? `P${x.p} S${x.s} · w${Math.max(1, Math.ceil(within * x.words.length))}/${x.words.length}` : "done",
    ahead && !over ? `P${ahead.p} S${ahead.s}` : over ? "done" : "last line",
    over ? "done" : behind ? `P${behind.p} S${behind.s} · re-reading` : "waiting",
    null,
  ];
  return (
    <div className="scan-agentbar flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--line)] bg-ink-950/70 px-3 py-2" aria-label="Scan agents">
      {AGENTS.map((a, k) => (
        <div key={a.name} title={a.job} className="scan-chip flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[10px]" data-c={a.c}>
          <span className="scan-chip-dot" aria-hidden />
          <span className="font-semibold tracking-wider text-fg">{a.name}</span>
          {k < 3 ? (
            <span className="tabular-nums text-fg-subtle">{target[k]}</span>
          ) : para && !over ? (
            <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
              {plan.sentences.slice(para.first, para.last + 1).map((_, i) => {
                const idx = para.first + i;
                const part = idx < frontier ? 1 : idx === frontier ? within : 0;
                return (
                  <span key={idx} className="relative h-full w-[4px] rounded-[1px] bg-accent/15">
                    <span className="absolute inset-x-0 bottom-0 rounded-[1px] bg-accent" style={{ height: `${part * 100}%` }} />
                  </span>
                );
              })}
              <span className="ml-1 text-fg-subtle">¶{para.p}</span>
            </span>
          ) : (
            <span className="text-fg-subtle">{over ? "done" : "waiting"}</span>
          )}
        </div>
      ))}
    </div>
  );
}
