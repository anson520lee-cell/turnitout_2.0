"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { contextLine, lookaheadLine, planFromSentences, quickScanDurationMs, quote, scanPosition, thinkingLine, type LogLine } from "@/lib/auto-report/scan-script";
import { COUNTED_CURVE, SCORE_CURVE } from "@/lib/auto-report/stitch";
import { freeRange, isStandout, liveScore, rangeOf, standoutShare, type FreeRange } from "@/lib/scanning/free-range";
import type { RiskLevel, SentenceSignal } from "@/lib/scanning/types";
import { Terminal, type TermLine } from "@/components/reports/scan/scan-panels";
import { Button, buttonClasses } from "@/components/ui/button";
import { reportFromLabel } from "@/config/services";
import { reportPricing } from "@/config/pricing";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The free scan's live view: a lighter, faster cousin of the paid report's
 * scan (about 8 seconds for 2,000 characters, at a fixed rate per character). It reads the customer's own
 * text word by word, marks the sentences the scan found standing out as it
 * passes them, and shows the AI score only as a 20-point range, as the free
 * result does. The result is already in when this starts; it is replayed, and
 * the range it ends on is the result's own.
 */

const STATE: Record<RiskLevel, string> = { elevated: "high", moderate: "medium", low: "low" };
const RANGE_COLOR: Record<RiskLevel, string> = { low: "#8d96ac", moderate: "#8db3ff", elevated: "#4d83ff" };
const clock = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** The live score over the last few seconds: a small line that rises and falls as sentences are read. */
function Sparkline({ hist, ticks, color, compact }: { hist: number[]; ticks: number; color: string; compact: boolean }) {
  const h = compact ? 30 : 56;
  const w = 220;
  // Zoomed to the line, like a price chart, so its swings read clearly instead of hugging one level of a 0–100 scale.
  let lo0 = 100;
  let hi0 = 0;
  for (const v of hist) {
    lo0 = Math.min(lo0, v);
    hi0 = Math.max(hi0, v);
  }
  const span = Math.min(100, Math.max(26, hi0 - lo0 + 10));
  const lo = hist.length ? Math.max(0, Math.min(100 - span, (lo0 + hi0) / 2 - span / 2)) : 0;
  const y = (v: number) => h - 3 - ((v - lo) / span) * (h - 6);
  const gridStep = span > 50 ? 20 : 10;
  const grid: number[] = [];
  for (let g = Math.ceil(lo / gridStep) * gridStep; g < lo + span; g += gridStep) grid.push(g);
  const pts = hist.map((v, i) => `${((i / Math.max(1, ticks)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = hist.length ? hist[hist.length - 1] : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2.5 w-full" style={{ height: h }} aria-hidden>
      {grid.map((g) => (
        <line key={g} x1="0" x2={w} y1={y(g)} y2={y(g)} stroke="rgb(170 176 196 / 0.14)" strokeDasharray="2 3" />
      ))}
      {hist.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />}
      {last !== null && <circle cx={((hist.length - 1) / Math.max(1, ticks)) * w} cy={y(last)} r="2.6" fill={color} />}
    </svg>
  );
}

export function QuickScan({ sentences, level, reviewShare = null, onDone }: { sentences: SentenceSignal[]; level: RiskLevel; /** The share of sentences the reviewer marked, when known: the range ends where the result will put it. */ reviewShare?: number | null; onDone: () => void }) {
  const plan = useMemo(() => planFromSentences(sentences.map((s) => ({ p: s.paragraph + 1, text: s.text }))), [sentences]);
  const duration = quickScanDurationMs(plan.chars);
  const total = plan.sentences.length;
  const finalShare = useMemo(() => reviewShare ?? standoutShare(sentences), [reviewShare, sentences]);
  // The written review's share is read on the counted curve; the stand-out share on the older one.
  const finalCurve = reviewShare !== null ? COUNTED_CURVE : SCORE_CURVE;
  const finalRange = useMemo(() => freeRange(finalShare, level, finalCurve), [finalShare, level, finalCurve]);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  // The live score and its recent history: worked out every tick from the sentences read so far, eased so it glides.
  const [live, setLive] = useState<{ score: number | null; hist: number[] }>({ score: null, hist: [] });
  const shown = useRef<number | null>(null);
  // The drawn line carries a live tremor and swell on top of the score (see below); the score and the range label do not.
  const wobble = useRef({ fast: 0, slow: 0 });

  useEffect(() => {
    const start = performance.now();
    const t = setInterval(() => {
      const e = performance.now() - start;
      setElapsed(e);
      const pos = scanPosition(plan, Math.min(1, e / duration));
      const frontierNow = e >= duration ? total : pos.index;
      if (frontierNow >= 2) {
        // The share of sentences read so far that stand out, counting the one being read part-way, as the paid scan does.
        const k = Math.min(frontierNow, total - 1);
        const frac = e >= duration ? 0 : pos.within;
        const flagged = (i: number) => (isStandout(sentences[i].level) ? 1 : 0);
        let hits = 0;
        for (let i = 0; i < k; i++) hits += flagged(i);
        const at = e >= duration ? total : k + frac;
        const share = (e >= duration ? hits + flagged(total - 1) : hits + flagged(k) * frac) / Math.max(1, at);
        const target = liveScore(share, at / Math.max(1, total), finalShare, finalRange, finalCurve);
        // Eased a little so it glides; follows each sentence as it is read.
        shown.current = shown.current === null ? target : shown.current + (target - shown.current) * 0.4;
        const v = Math.max(0, Math.min(100, shown.current));
        // Lively to the end, calming only over the last second so the line lands smoothly on the real score.
        const w = wobble.current;
        const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
        w.fast = w.fast * 0.8 + 1.5 * gauss();
        w.slow = w.slow * 0.97 + 0.55 * gauss();
        const calm = e >= duration ? 0 : Math.min(1, (duration - e) / 1000);
        const drawn = Math.max(0, Math.min(100, v + (w.fast + w.slow) * calm));
        setLive((l) => ({ score: v, hist: [...l.hist, drawn] }));
      }
      if (e >= duration) clearInterval(t);
    }, 80);
    return () => clearInterval(t);
  }, [duration, plan, total, sentences, finalShare, finalRange, finalCurve]);

  // Lock the page behind the view while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prev);
  }, []);

  const done = finished || elapsed >= duration;
  const pos = done ? { index: total, within: 0 } : scanPosition(plan, elapsed / duration);
  const frontier = pos.index;
  const readSoFar = sentences.slice(0, frontier);
  const range: FreeRange | null = done ? finalRange : live.score !== null ? rangeOf(live.score) : null;
  const standouts = readSoFar.filter((s) => isStandout(s.level)).length;

  // The log: worked out from how far the reader is, so it needs no state of its own.
  const lines = useMemo<TermLine[]>(() => {
    const out: TermLine[] = [{ id: 0, t: "00:00", tone: "info", text: `quick scan · ${total} sentences · ${plan.paragraphs.length} paragraph${plan.paragraphs.length === 1 ? "" : "s"}` }];
    let id = 1;
    const at = (i: number) => clock((plan.sentences[i].end / Math.max(1, plan.sentences[total - 1]?.end ?? 1)) * duration);
    const add = (i: number, l: LogLine) => out.push({ ...l, id: id++, t: at(i) });
    for (let i = 0; i < Math.min(frontier, total); i++) {
      const x = plan.sentences[i];
      const para = plan.paragraphs.find((p) => p.first === i);
      if (para) add(i, contextLine(para.p, "start", plan.paragraphs.length));
      const lvl = sentences[i].level;
      add(i, isStandout(lvl) ? { tone: lvl === "elevated" ? "risk" : "warn", text: `P${x.p} S${x.s} ${quote(x.text, 34)} → stands out` } : { tone: "ok", text: `✓ P${x.p} S${x.s} read` });
      const ahead = plan.sentences[i + 1];
      if (ahead && i % 3 === 2) add(i, i % 2 ? lookaheadLine(ahead) : thinkingLine(ahead));
    }
    if (frontier >= total && total) out.push({ id: id++, t: clock(duration), tone: "info", text: `quick scan complete · range ${finalRange.lo}–${finalRange.hi}% · exact score: full report only` });
    return out.slice(-40);
  }, [frontier, plan, total, sentences, duration, finalRange.lo, finalRange.hi]);

  // Keep the word being read in view.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = scroller.current;
    const el = sc?.querySelector<HTMLElement>('[data-st="active"]');
    if (!sc || !el) return;
    const top = el.offsetTop - sc.offsetTop - sc.scrollTop;
    if (top > sc.clientHeight * 0.6 || top < 0) sc.scrollTo({ top: Math.max(0, el.offsetTop - sc.offsetTop - sc.clientHeight * 0.3), behavior: "smooth" });
  }, [frontier]);

  // The scan line sits under the line being read.
  const content = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = content.current?.querySelector<HTMLElement>("[data-aw]");
    if (!el || !beam.current) return;
    beam.current.style.transform = `translate3d(0, ${el.offsetTop + el.offsetHeight + 1}px, 0)`;
    beam.current.style.opacity = "1";
  });

  const lead = plan.sentences[frontier];
  const activeWord = lead ? Math.min(lead.words.length - 1, Math.floor(pos.within * lead.words.length)) : -1;
  const left = Math.max(0, Math.ceil((duration - elapsed) / 1000));

  const rangePanel = (compact: boolean) => (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">AI score range</p>
        <p className="font-mono text-[10.5px] tabular-nums text-fg-subtle">
          {Math.min(frontier, total)}/{total} read · {standouts} stand out
        </p>
      </div>
      <p className={cn("mt-1 font-semibold tabular-nums tracking-tight transition-colors", compact ? "text-[26px]" : "text-[40px] leading-none")} style={{ color: range ? RANGE_COLOR[range.level] : undefined }}>
        {range ? `${range.lo}–${range.hi}%` : <span className="text-fg-subtle">reading…</span>}
      </p>
      <div className="mt-2.5 grid grid-cols-5 gap-1" aria-hidden>
        {[0, 20, 40, 60, 80].map((lo) => {
          const c = RANGE_COLOR[lo >= 60 ? "elevated" : lo >= 20 ? "moderate" : "low"];
          // While reading, the light slides between the segments with the live score; at the end it settles on the final range.
          const on = done ? (range?.lo === lo ? 1 : 0) : live.score === null ? 0 : Math.max(0, 1 - Math.abs(live.score - (lo + 10)) / 24);
          return (
            <div key={lo}>
              <div className="h-2 rounded-full" style={{ background: `color-mix(in srgb, ${c} ${Math.round(15 + on * 85)}%, transparent)`, boxShadow: on > 0.15 ? `0 0 ${Math.round(on * 14)}px ${c}` : undefined, transition: done ? "all 0.5s ease" : "none" }} />
              {!compact && <p className={cn("mt-1 text-center font-mono text-[9.5px] tabular-nums", on > 0.5 ? "text-fg" : "text-fg-subtle/70")}>{lo}–{lo + 20}</p>}
            </div>
          );
        })}
      </div>
      <Sparkline hist={live.hist} ticks={Math.ceil(duration / 80)} color="#5b8cff" compact={compact} />
      <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <Lock className="size-3 text-accent" aria-hidden /> Exact score: full report only
      </p>
    </div>
  );

  const view = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Quick scan of your text"
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-ink-950 lg:overflow-hidden"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_70%_-10%,rgb(91_140_255/0.16),transparent_70%)]" />
      <header className="relative flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:px-6">
        <span className="grid size-8 place-items-center rounded-lg border border-[var(--line-strong)] bg-white/[0.04] font-mono text-[12px] font-semibold text-fg">0%</span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-accent">
            <span className="scan-live-dot" aria-hidden /> {done ? "Quick scan complete" : "Quick scan"}
          </p>
          <p className="truncate text-[13px] text-fg-muted">Free scan · {plan.chars.toLocaleString("en-US")} characters</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!done && <span className="font-mono text-[11px] tabular-nums text-fg-subtle">~{left}s left</span>}
          {!done && (
            <button type="button" onClick={() => setFinished(true)} className="whitespace-nowrap rounded-full px-2 py-1 text-[11.5px] text-fg-subtle underline-offset-2 hover:text-fg hover:underline">
              Skip
            </button>
          )}
        </div>
      </header>

      <div className="relative grid flex-1 gap-3 p-3 sm:p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-[var(--line-strong)] bg-ink-950/80 px-3.5 py-3 lg:hidden">{rangePanel(true)}</div>
        <section
          ref={scroller}
          aria-label="Your text, being scanned"
          className="scan-doc relative overflow-y-auto overscroll-contain rounded-2xl border border-[var(--line-strong)] bg-ink-950/70 px-5 py-5 max-lg:h-[46dvh] sm:px-10 sm:py-7 lg:min-h-0"
        >
          <div aria-hidden className="scan-doc-grid pointer-events-none absolute inset-0" />
          <div ref={content} className="relative mx-auto max-w-[72ch]">
            {!done && <div ref={beam} aria-hidden className="scan-beam scan-text-beam pointer-events-none absolute -inset-x-3 top-0 opacity-0" />}
            {plan.paragraphs.map((para) => (
              <p key={para.p} className="mb-5 text-[15px] leading-[1.9] sm:text-[16px]">
                {plan.sentences.slice(para.first, para.last + 1).map((x, k) => {
                  const i = para.first + k;
                  const st = i < frontier ? STATE[sentences[i].level] : i === frontier ? "active" : "todo";
                  return (
                    <span key={x.n}>
                      <span data-st={st} className={cn("scan-sent", i === frontier - 1 && "scan-swept")}>
                        {i === frontier
                          ? x.words.map((w, j) => (
                              <span key={j}>
                                {j ? " " : null}
                                <span data-aw={j === activeWord ? "" : undefined} className={cn(j === activeWord && "rounded-[4px] bg-cyan/15 shadow-[0_0_0_1px_rgb(141_179_255/0.85),0_0_14px_rgb(141_179_255/0.35)]")}>{w}</span>
                              </span>
                            ))
                          : x.text}
                      </span>{" "}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
        </section>
        <aside className="flex min-h-0 flex-col gap-3">
          <div className="hidden rounded-2xl border border-[var(--line-strong)] bg-ink-950/80 p-4 lg:block">{rangePanel(false)}</div>
          <Terminal title="scan.log" dot="bg-cyan" lines={lines} className="h-[24dvh] min-h-[150px] lg:h-auto lg:flex-1" />
          <Link
            href="/services/screening"
            onClick={() => track("screening_service_clicked", { from: "quick_scan" })}
            className="hidden rounded-2xl border border-accent/30 bg-accent/[0.07] p-4 text-[12.5px] text-fg-muted transition hover:border-accent/60 lg:block"
          >
            <span className="font-medium text-fg">The full report goes further.</span> Exact AI score, every sentence rated with a reason, whole essays up to {reportPricing.maxChars.toLocaleString("en-US")} characters.
          </Link>
        </aside>

        <AnimatePresence>
          {done && (
            <motion.div key="finale" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 grid place-items-center bg-ink-950/55 p-4 backdrop-blur-[3px]">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.1 }}
                className="glass-strong noise relative w-full max-w-md overflow-hidden rounded-3xl p-6 text-center sm:p-8"
              >
                <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
                <p className="relative flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ok">
                  <ShieldCheck className="size-4" /> Quick scan complete
                </p>
                <p className="scan-rate-land relative mt-4 text-[52px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: RANGE_COLOR[finalRange.level] }}>
                  {finalRange.lo}–{finalRange.hi}%
                </p>
                <p className="relative mt-2 text-[13.5px] text-fg-muted">AI score range · {sentences.filter((s) => isStandout(s.level)).length} of {total} sentences stand out</p>
                <p className="relative mt-3 flex items-center justify-center gap-1.5 text-[12.5px] text-fg-subtle">
                  <Lock className="size-3.5 text-accent" aria-hidden /> The exact score and the reasons are in the full report.
                </p>
                <Button className="relative mt-6 w-full" size="lg" onClick={onDone}>
                  See my result <ArrowRight className="size-4" />
                </Button>
                <Link
                  href="/services/screening"
                  onClick={() => track("screening_service_clicked", { from: "quick_scan_done" })}
                  className={buttonClasses("ghost", "md", "relative mt-2 w-full justify-center")}
                >
                  Get the exact score · {reportFromLabel}
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return createPortal(view, document.body);
}
