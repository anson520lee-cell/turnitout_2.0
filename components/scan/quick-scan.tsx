"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { contextLine, lookaheadLine, planFromSentences, quickScanDurationMs, quote, scanPosition, thinkingLine, type LogLine } from "@/lib/auto-report/scan-script";
import { freeRange, isStandout, standoutShare, type FreeRange } from "@/lib/scanning/free-range";
import type { RiskLevel, SentenceSignal } from "@/lib/scanning/types";
import { Terminal, type TermLine } from "@/components/reports/scan/scan-panels";
import { Button, buttonClasses } from "@/components/ui/button";
import { reportFromLabel } from "@/config/services";
import { reportPricing } from "@/config/pricing";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The free scan's live view: a lighter, faster cousin of the paid report's
 * scan (about 20 seconds for 2,000 characters). It reads the customer's own
 * text word by word, marks the sentences the scan found standing out as it
 * passes them, and shows the AI score only as a 20-point range, as the free
 * result does. The result is already in when this starts; it is replayed, and
 * the range it ends on is the result's own.
 */

const STATE: Record<RiskLevel, string> = { elevated: "high", moderate: "medium", low: "low" };
const RANGE_COLOR: Record<RiskLevel, string> = { low: "#4fd1a5", moderate: "#f5c35b", elevated: "#ff7a8a" };
const clock = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function QuickScan({ sentences, level, onDone }: { sentences: SentenceSignal[]; level: RiskLevel; onDone: () => void }) {
  const plan = useMemo(() => planFromSentences(sentences.map((s) => ({ p: s.paragraph + 1, text: s.text }))), [sentences]);
  const duration = quickScanDurationMs(plan.chars);
  const total = plan.sentences.length;
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const t = setInterval(() => {
      const e = performance.now() - start;
      setElapsed(e);
      if (e >= duration) clearInterval(t);
    }, 80);
    return () => clearInterval(t);
  }, [duration]);

  // Lock the page behind the view while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prev);
  }, []);

  const done = finished || elapsed >= duration;
  const pos = done ? { index: total, within: 0 } : scanPosition(plan, elapsed / duration);
  const frontier = pos.index;
  const finalRange = freeRange(standoutShare(sentences), level);
  const readSoFar = sentences.slice(0, frontier);
  const range: FreeRange | null = done ? finalRange : frontier >= 2 ? freeRange(standoutShare(readSoFar), "low") : null;
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
          const on = range?.lo === lo;
          const c = RANGE_COLOR[lo >= 60 ? "elevated" : lo >= 20 ? "moderate" : "low"];
          return (
            <div key={lo}>
              <div className="h-2 rounded-full transition-all duration-500" style={{ background: on ? c : `${c}26`, boxShadow: on ? `0 0 14px ${c}` : undefined }} />
              {!compact && <p className={cn("mt-1 text-center font-mono text-[9.5px] tabular-nums", on ? "text-fg" : "text-fg-subtle/70")}>{lo}–{lo + 20}</p>}
            </div>
          );
        })}
      </div>
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
          <div className="relative mx-auto max-w-[72ch]">
            {plan.paragraphs.map((para) => (
              <p key={para.p} className="mb-5 text-[15px] leading-[1.9] sm:text-[16px]">
                {plan.sentences.slice(para.first, para.last + 1).map((x, k) => {
                  const i = para.first + k;
                  const st = i < frontier ? STATE[sentences[i].level] : i === frontier ? "active" : "todo";
                  return (
                    <span key={x.n}>
                      <span data-st={st} className="scan-sent">
                        {i === frontier
                          ? x.words.map((w, j) => (
                              <span key={j}>
                                {j ? " " : null}
                                <span className={cn(j === activeWord && "rounded-[4px] bg-cyan/15 shadow-[0_0_0_1px_rgb(95_216_245/0.85),0_0_14px_rgb(95_216_245/0.35)]")}>{w}</span>
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
      <footer className="relative shrink-0 px-4 pb-3 text-center text-[10.5px] text-fg-subtle sm:px-6">
        A quick preliminary estimate by this website, not a Turnitin result. No result is guaranteed.
      </footer>
    </motion.div>
  );

  return createPortal(view, document.body);
}
