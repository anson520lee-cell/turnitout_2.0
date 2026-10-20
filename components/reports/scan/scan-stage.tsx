"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  isFlagged,
  levelLabel,
  paragraphLine,
  quote,
  reviewerLines,
  sentenceFacts,
  sharedWords,
  type LogLine,
  type ScanPlan,
} from "@/lib/auto-report/scan-script";
import type { AutoReportResult, Level, ReportSentence } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";
import { RatePanel, TERMS, Terminal, type TermId, type TermLine } from "./scan-panels";
import type { ReportFeed } from "./use-report-feed";

/**
 * The live scan: the customer's own text is the main picture, with scan agents
 * jumping across its words, a set of terminal windows logging what is read and
 * found, and the AI rate on the far right. Sentences are rated only from the
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
  rate,
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
  rate: number;
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
      { tone: "dim", text: "4 agents deployed: A1 reads, A2 and A3 cross-check, A4 re-checks flagged lines" },
    ]);
    return () => timers.forEach(clearTimeout);
  }, [push, total, plan.paragraphs.length]);

  const toggle = (id: TermId) => {
    touched.current.add(id);
    setOpen((o) => ({ ...o, [id]: !o[id] }));
    setTab(id);
  };

  // Reader: one line per finished sentence, with what was counted in it.
  const prevFrontier = useRef(0);
  useEffect(() => {
    const from = prevFrontier.current;
    prevFrontier.current = frontier;
    if (frontier <= from) return;
    const start = Math.max(from, frontier - 6);
    const lines: LogLine[] = [];
    for (let i = start; i < frontier && i < total; i++) {
      const x = plan.sentences[i];
      lines.push({ tone: "ok", text: `✓ P${x.p} S${x.s} · ${sentenceFacts(x)}` });
      const para = plan.paragraphs.find((p) => p.last === i);
      if (para) {
        const lengths = plan.sentences.slice(para.first, para.last + 1).map((s) => s.words.length);
        lines.push({ tone: "info", text: `¶${para.p} read · rhythm ${lengths.join("·")} words` });
      }
    }
    push("reader", lines);
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
        if (quiet) out.push({ tone: "dim", text: `… ${quiet} sentence${quiet === 1 ? "" : "s"} → low · no signal noted` });
        quiet = 0;
        out.push(...reviewerLines(x, rated));
      }
      const issue = grammarAt.get(x.n);
      if (issue) side.push({ tone: "violet", text: `grammar · P${x.p} S${x.s} · ${issue}` });
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

  // Agents' moves, logged a few per second at most.
  const lastAgentLine = useRef(0);
  const onAgent = useCallback(
    (agent: number, index: number) => {
      const now = performance.now();
      if (now - lastAgentLine.current < 320) return;
      lastAgentLine.current = now;
      const x = plan.sentences[index];
      if (!x) return;
      const tag = `A${agent + 1} → P${x.p} S${x.s}`;
      const rated = index < prevRevealed.current ? ratings?.get(x.n) : undefined;
      if (agent === 3 && rated) {
        push("agents", [{ tone: isFlagged(rated.risk) ? "warn" : "dim", text: `${tag} re-check · stays ${levelLabel[rated.risk].toLowerCase()}` }]);
        return;
      }
      const lead = plan.sentences[Math.min(prevFrontier.current, total - 1)];
      const shared = lead && lead.n !== x.n ? sharedWords(x.text, lead.text) : [];
      push("agents", [
        {
          tone: "dim",
          text: shared.length
            ? `${tag} cross-check with P${lead.p} S${lead.s} · shares ${shared.map((w) => `“${w}”`).join(", ")}`
            : `${tag} ${quote(x.text, 34)}`,
        },
      ]);
    },
    [plan, ratings, total, push],
  );

  const counts = useMemo(() => {
    const c: Record<Level, number> = { high: 0, medium: 0, uncertain: 0, low: 0 };
    if (ratings) for (let i = 0; i < revealed && i < total; i++) c[ratings.get(plan.sentences[i].n)?.risk ?? "low"] += 1;
    return c;
  }, [ratings, revealed, plan, total]);

  const [history, setHistory] = useState<number[]>([]);
  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  });
  useEffect(() => {
    if (!ratings) return;
    const t = setInterval(() => setHistory((h) => [...h, rateRef.current].slice(-60)), 1_000);
    return () => clearInterval(t);
  }, [ratings]);

  const lead = plan.sentences[Math.min(frontier, total - 1)];
  const readerLive =
    lead && frontier < total ? (
      <p className="break-words text-cyan">
        <span className="mr-2 text-fg-subtle/50">{clock(elapsedMs)}</span>› P{lead.p} S{lead.s} {lead.words.slice(0, Math.max(1, Math.ceil(within * lead.words.length))).join(" ")}
        <span className="scan-caret" aria-hidden />
      </p>
    ) : null;

  const rateProps = {
    rate,
    ready: Boolean(ratings),
    final: done,
    scanned: ratings ? Math.min(revealed, total) : 0,
    total,
    high: counts.high,
    medium: counts.medium,
    uncertain: counts.uncertain,
    history,
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
    <div className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_330px] xl:grid-cols-[minmax(0,1fr)_340px_236px]">
      {/* Phone and tablet: the rate on top. */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-ink-950/80 px-3.5 py-2.5 lg:hidden">
        <RatePanel {...rateProps} compact />
      </div>

      <section className="relative min-h-0 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-950/70" aria-label="Your text, being scanned">
        <Document plan={plan} frontier={frontier} within={within} revealed={revealed} ratings={ratings} reduce={reduce} done={done} onAgent={onAgent} />
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
  { c: "cyan", role: "reads" },
  { c: "accent", role: "cross-checks" },
  { c: "violet", role: "cross-checks" },
  { c: "warn", role: "re-checks" },
] as const;

/**
 * The text itself, with the scan agents over it. Sentence states are written
 * straight onto the spans (data-st), and the agents are moved with transforms,
 * so the text is rendered by React only once.
 */
const Document = memo(function Document({
  plan,
  frontier,
  within,
  revealed,
  ratings,
  reduce,
  done,
  onAgent,
}: {
  plan: ScanPlan;
  frontier: number;
  within: number;
  revealed: number;
  ratings: Map<number, ReportSentence> | null;
  reduce: boolean;
  done: boolean;
  onAgent: (agent: number, index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const agents = useRef<(HTMLDivElement | null)[]>([]);
  const beam = useRef<HTMLDivElement>(null);
  const live = useRef({ frontier, within, revealed, ratings, done });
  const onAgentRef = useRef(onAgent);
  useLayoutEffect(() => {
    live.current = { frontier, within, revealed, ratings, done };
    onAgentRef.current = onAgent;
  });
  const userScrolledAt = useRef(-Infinity);

  const offsets = useMemo(() => plan.sentences.map((s) => [...s.text.matchAll(/\S+/g)].map((m) => [m.index!, m.index! + m[0].length] as const)), [plan]);

  // Sentence states.
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
    }
  }, [frontier, revealed, ratings, plan, reduce]);

  // Agents.
  useEffect(() => {
    if (reduce) return;
    const total = plan.sentences.length;
    if (!total) return;
    const next = AGENTS.map((_, i) => performance.now() + 300 + i * 220);
    const rectOf = (i: number, w: number) => {
      const el = spans.current[i];
      const node = el?.firstChild;
      const box = content.current?.getBoundingClientRect();
      if (!el || !node || !box) return null;
      const off = offsets[i];
      const word = off[Math.max(0, Math.min(off.length - 1, w))];
      if (!word) return null;
      const range = document.createRange();
      range.setStart(node, word[0]);
      range.setEnd(node, word[1]);
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    };
    const place = (k: number, r: { x: number; y: number; w: number; h: number }) => {
      const el = agents.current[k];
      if (!el) return;
      el.style.transform = `translate3d(${r.x - 4}px, ${r.y - 3}px, 0)`;
      el.style.width = `${Math.max(18, r.w + 8)}px`;
      el.style.height = `${r.h + 6}px`;
      el.style.opacity = "1";
    };
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let lastScroll = 0;
    const tick = () => {
      const { frontier: f, within: wn, revealed: rv, ratings: rt, done: finished } = live.current;
      const now = performance.now();
      if (finished) {
        agents.current.forEach((el) => el && (el.style.opacity = "0"));
        if (beam.current) beam.current.style.opacity = "0";
        return;
      }
      const at = Math.min(f, total - 1);
      // A1 follows the reading position word by word.
      const words = offsets[at].length;
      const leadRect = rectOf(at, f >= total ? words - 1 : Math.floor(wn * words));
      if (leadRect) {
        place(0, leadRect);
        if (beam.current) {
          beam.current.style.transform = `translate3d(0, ${leadRect.y + leadRect.h / 2}px, 0)`;
          beam.current.style.opacity = "1";
        }
        // Keep the reading position in view, unless the customer is scrolling the text themselves.
        const sc = scroller.current;
        if (sc && now - userScrolledAt.current > 4_000 && now - lastScroll > 700) {
          const inView = leadRect.y + content.current!.getBoundingClientRect().top - sc.getBoundingClientRect().top;
          if (inView > sc.clientHeight * 0.62 || inView < sc.clientHeight * 0.1) {
            lastScroll = now;
            sc.scrollTo({ top: Math.max(0, sc.scrollTop + inView - sc.clientHeight * 0.32), behavior: "smooth" });
          }
        }
      }
      for (let k = 1; k < AGENTS.length; k++) {
        if (now < next[k]) continue;
        next[k] = now + rnd(170, 620);
        let target: number;
        if (k === 3 && rt && rv > 0) {
          const flagged: number[] = [];
          for (let i = Math.max(0, rv - 40); i < rv; i++) if (isFlagged(rt.get(plan.sentences[i].n)?.risk)) flagged.push(i);
          target = flagged.length && Math.random() < 0.7 ? flagged[Math.floor(Math.random() * flagged.length)] : Math.floor(Math.random() * rv);
        } else {
          target = Math.floor(rnd(Math.max(0, at - 10), Math.min(total, at + 4)));
        }
        target = Math.max(0, Math.min(total - 1, target));
        const r = rectOf(target, Math.floor(Math.random() * offsets[target].length));
        if (r) {
          place(k, r);
          onAgentRef.current(k, target);
        }
      }
    };
    const t = setInterval(tick, 70);
    const ro = new ResizeObserver(tick);
    if (content.current) ro.observe(content.current);
    return () => {
      clearInterval(t);
      ro.disconnect();
    };
  }, [plan, offsets, reduce]);

  return (
    <div
      ref={scroller}
      className="scan-doc relative h-full overflow-y-auto overscroll-contain px-4 py-5 max-lg:h-[44dvh] sm:px-8 sm:py-7"
      onWheel={() => (userScrolledAt.current = performance.now())}
      onTouchMove={() => (userScrolledAt.current = performance.now())}
    >
      <div aria-hidden className="scan-doc-grid pointer-events-none absolute inset-0" />
      <div ref={content} className="relative mx-auto max-w-[72ch]">
        <div ref={beam} aria-hidden className="scan-beam pointer-events-none absolute -inset-x-8 top-0 h-px opacity-0" />
        {plan.paragraphs.map((para) => (
          <p key={para.p} className="mb-5 text-[15px] leading-[1.9] sm:text-[16px]">
            {plan.sentences.slice(para.first, para.last + 1).map((x, k) => (
              <span key={x.n}>
                <span ref={(el) => void (spans.current[para.first + k] = el)} data-st="todo" className="scan-sent">
                  {x.text}
                </span>{" "}
              </span>
            ))}
          </p>
        ))}
        {AGENTS.map((a, k) => (
          <div key={k} ref={(el) => void (agents.current[k] = el)} aria-hidden className="scan-agent pointer-events-none absolute left-0 top-0 opacity-0" data-c={a.c}>
            <span className="scan-agent-tag">A{k + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
