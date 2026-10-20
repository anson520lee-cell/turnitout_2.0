"use client";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  normWord,
  paragraphLine,
  phraseLine,
  quote,
  repeatedWords,
  reviewerLines,
  rhythmLine,
  sentenceFacts,
  transitionOpener,
  xrayLine,
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
      { tone: "dim", text: "4 agents deployed: A1 READ word by word · A2 X-RAY one line ahead · A3 PHRASE repeated wording · A4 RHYTHM sentence lengths" },
      ...(plan.sentences[1] ? [xrayLine(plan.sentences[1], plan.sentences[0])] : []),
    ]);
    return () => timers.forEach(clearTimeout);
  }, [push, total, plan]);

  const toggle = (id: TermId) => {
    touched.current.add(id);
    setOpen((o) => ({ ...o, [id]: !o[id] }));
    setTab(id);
  };

  // Reader: one line per finished sentence, with what was counted in it. The
  // other agents report in step: X-ray on the sentence ahead, the phrase pen on
  // the one it just finished behind, rhythm on each finished paragraph.
  const repeats = useMemo(() => repeatedWords(plan), [plan]);
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
      lines.push({ tone: "ok", text: `✓ P${x.p} S${x.s} · ${sentenceFacts(x)}` });
      const ahead = plan.sentences[i + 2];
      if (ahead) side.push(xrayLine(ahead, plan.sentences[i + 1]));
      if (i >= 2) side.push(phraseLine(plan.sentences[i - 2], repeats));
      const para = plan.paragraphs.find((p) => p.last === i);
      if (para) {
        const lengths = plan.sentences.slice(para.first, para.last + 1).map((s) => s.words.length);
        lines.push({ tone: "info", text: `¶${para.p} read · ${lengths.length} sentences · ${lengths.reduce((a, b) => a + b, 0)} words` });
        side.push(rhythmLine(para.p, lengths));
      }
    }
    if (frontier >= total) for (let i = Math.max(0, total - 2); i < total; i++) side.push(phraseLine(plan.sentences[i], repeats));
    push("reader", lines);
    push("agents", side);
  }, [frontier, plan, total, repeats, push]);

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
        if (quiet) out.push({ tone: "dim", text: `… ${quiet} sentence${quiet === 1 ? "" : "s"} → low · no signal noted` });
        quiet = 0;
        out.push(...reviewerLines(x, rated));
      }
      const issue = grammarAt.get(x.n);
      if (issue) side.push({ tone: "violet", text: `A3 PHRASE P${x.p} S${x.s} · reviewer's grammar note: ${issue}` });
      const para = plan.paragraphs.find((p) => p.last === i);
      const rp = para && result.paragraphs.find((p) => p.p === para.p);
      if (rp) out.push(paragraphLine(rp.p, rp.sentences, rp.risk));
      if (rated?.risk === "high" && !burst && elapsedRef.current - lastVerify.current > 9_000) {
        lastVerify.current = elapsedRef.current;
        setVerify({ key: x.n, sentence: rated, p: x.p, s: x.s });
      }
    }
    if (quiet) out.push({ tone: "dim", text: `… ${quiet} sentence${quiet === 1 ? "" : "s"} → low · no signal noted` });
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
        <Document plan={plan} frontier={frontier} within={within} revealed={revealed} ratings={ratings} grammar={grammarAt} repeats={repeats} reduce={reduce} done={done} />
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
                  ...(verify.sentence.why ? [{ id: 2, t: "why ", tone: "info" as const, text: verify.sentence.why }] : []),
                  ...(verify.sentence.ask ? [{ id: 3, t: "ask ", tone: "dim" as const, text: verify.sentence.ask }] : []),
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
  { c: "violet", name: "A2 X-RAY", job: "Looks one line ahead at how the next sentence is built" },
  { c: "silver", name: "A3 PHRASE", job: "Follows behind, marking wording your text repeats" },
  { c: "accent", name: "A4 RHYTHM", job: "Measures each sentence's length" },
] as const;

/**
 * The text itself, with the four scan agents working through it in order:
 * A1 reads the current word, A2's X-ray lens sweeps the line ahead, A3's lens
 * follows two sentences behind, and A4 measures the sentence being read.
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
  repeats,
  reduce,
  done,
}: {
  plan: ScanPlan;
  frontier: number;
  within: number;
  revealed: number;
  ratings: Map<number, ReportSentence> | null;
  grammar: Map<number, string>;
  repeats: Map<string, number>;
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
  const pen = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const rulerN = useRef<HTMLSpanElement>(null);
  const live = useRef({ frontier, within, done });
  useLayoutEffect(() => {
    live.current = { frontier, within, done };
  });
  const userScrolledAt = useRef(-Infinity);
  const openers = useMemo(() => plan.sentences.map((x) => transitionOpener(x.text)?.split(/\s+/).length ?? 0), [plan]);

  // Sentence states; openers A2 has seen; grammar notes A3 has passed.
  const marked = useRef(0);
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
    for (; marked.current < Math.min(total, frontier + 2); marked.current++) {
      const ws = words.current[marked.current] ?? [];
      for (let j = 0; j < openers[marked.current]; j++) ws[j]?.setAttribute("data-tr", "");
    }
  }, [frontier, revealed, ratings, grammar, plan, total, openers, reduce]);

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
    const pc = { i: 0, j: 0 }; // how far A3's pen has marked
    let lastScroll = 0;
    const tick = () => {
      const { frontier: f, within: wn, done: finished } = live.current;
      if (finished || f >= total) {
        hide(read.current, xray.current, pen.current, ruler.current);
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
      // A2 X-RAY: the next line down.
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
      // A3 PHRASE: a glass lens two sentences behind, word by word, marking repeated wording as it goes.
      const b = f - 2;
      if (b >= 0 && pen.current) {
        const ws = words.current[b] ?? [];
        const j = Math.min(ws.length - 1, Math.floor(wn * ws.length));
        const el = ws[j];
        if (el) {
          const p = at(el);
          pen.current.style.transform = `translate3d(${p.x - 5}px, ${p.y - 1}px, 0)`;
          pen.current.style.width = `${Math.max(14, p.w + 10)}px`;
          pen.current.style.height = `${p.h + 2}px`;
          pen.current.style.opacity = "1";
        }
        while (pc.i < b || (pc.i === b && pc.j <= j)) {
          const w = words.current[pc.i]?.[pc.j];
          if (w?.hasAttribute("data-rep")) w.setAttribute("data-ph", "");
          pc.j++;
          if (pc.j >= (words.current[pc.i]?.length ?? 0)) {
            pc.i++;
            pc.j = 0;
          }
          if (pc.i >= total) break;
        }
      } else hide(pen.current);
      // A4 RHYTHM: a ruler down the margin over the sentence being read, with its word count.
      const first = words.current[f]?.[0];
      if (first && ruler.current) {
        const top = first.offsetTop;
        ruler.current.style.transform = `translate3d(0, ${top}px, 0)`;
        ruler.current.style.height = `${Math.max(r.h, r.y + r.h - top)}px`;
        ruler.current.style.opacity = "1";
        if (rulerN.current) rulerN.current.textContent = `${Math.max(1, Math.ceil(wn * (words.current[f]?.length ?? 1)))}w`;
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
    const t = setInterval(tick, 60);
    const ro = new ResizeObserver(tick);
    if (content.current) ro.observe(content.current);
    return () => {
      clearInterval(t);
      ro.disconnect();
    };
  }, [total, reduce]);

  return (
    <div className="flex flex-col max-lg:h-[50dvh] lg:h-full">
      <AgentBar plan={plan} frontier={frontier} within={within} repeats={repeats} done={done} />
      <div
        ref={scroller}
        className="scan-doc relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-10 sm:py-7"
        onWheel={() => (userScrolledAt.current = performance.now())}
        onTouchMove={() => (userScrolledAt.current = performance.now())}
      >
        <div aria-hidden className="scan-doc-grid pointer-events-none absolute inset-0" />
        <div ref={content} className="relative mx-auto max-w-[72ch]">
          <div ref={xray} aria-hidden className="scan-xray pointer-events-none absolute -inset-x-3 top-0 opacity-0" />
          <Text plan={plan} repeats={repeats} spans={spans} words={words} />
          <div ref={ruler} aria-hidden className="scan-ruler pointer-events-none absolute top-0 opacity-0">
            <span ref={rulerN} className="scan-ruler-n" />
          </div>
          <div ref={pen} aria-hidden className="scan-pen pointer-events-none absolute left-0 top-0 opacity-0" />
          <div ref={read} aria-hidden className="scan-agent pointer-events-none absolute left-0 top-0 opacity-0" data-c="cyan" />
        </div>
      </div>
    </div>
  );
});

/** The words, rendered once. Each word is its own span so the agents can find it. */
const Text = memo(function Text({
  plan,
  repeats,
  spans,
  words,
}: {
  plan: ScanPlan;
  repeats: Map<string, number>;
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
                  <span ref={(el) => void ((words.current[i] ??= [])[j] = el)} className="scan-w" data-rep={repeats.has(normWord(w)) ? "" : undefined}>
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
function AgentBar({ plan, frontier, within, repeats, done }: { plan: ScanPlan; frontier: number; within: number; repeats: Map<string, number>; done: boolean }) {
  const total = plan.sentences.length;
  const f = Math.min(frontier, total - 1);
  const x = plan.sentences[f];
  const ahead = plan.sentences[f + 1];
  const behind = plan.sentences[f - 2];
  const marks = useMemo(() => {
    const out = [0];
    plan.sentences.forEach((s, i) => out.push(out[i] + s.words.filter((w) => repeats.has(normWord(w))).length));
    return out;
  }, [plan, repeats]);
  const marked = behind ? marks[f - 2] + behind.words.slice(0, Math.floor(within * behind.words.length) + 1).filter((w) => repeats.has(normWord(w))).length : 0;
  const para = plan.paragraphs.find((p) => p.first <= f && f <= p.last);
  const over = done || frontier >= total;
  const target = [
    x && !over ? `P${x.p} S${x.s} · w${Math.max(1, Math.ceil(within * x.words.length))}/${x.words.length}` : "done",
    ahead && !over ? `P${ahead.p} S${ahead.s}` : over ? "done" : "last line",
    over ? `${marks[total]} marked` : behind ? `P${behind.p} S${behind.s} · ${marked} marked` : "waiting",
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
              {plan.sentences.slice(para.first, para.last + 1).map((s, i) => {
                const idx = para.first + i;
                const max = Math.max(...plan.sentences.slice(para.first, para.last + 1).map((y) => y.words.length));
                const part = idx < frontier ? 1 : idx === frontier ? within : 0;
                return (
                  <span key={idx} className="relative w-[4px] rounded-[1px] bg-accent/15" style={{ height: `${Math.max(18, (s.words.length / max) * 100)}%` }}>
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
