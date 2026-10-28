"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Maximize2, Minimize2, PenLine, SkipForward, Sparkles } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { ratingsBySentence, scanPosition } from "@/lib/auto-report/scan-script";
import { REFINE_INTRO_MS, clearedBy, projectedAt, projectedScore, readerAt, refineEndMs, refineJobs, refinePlan, refineRate, refineReadMs, type Arrival } from "@/lib/auto-report/refine-script";
import { pickFlagged, type ReportRewrite, type RewriteCheck, type RewriteItem } from "@/lib/auto-report/rewrite";
import type { AutoReportResult } from "@/lib/auto-report/stitch";
import { cn } from "@/lib/utils";
import { RefineIntro } from "./refine-intro";
import { RefineMeter, type RefineMeterInput } from "./refine-meter";
import { RefineRatePanel, type RefineCounts } from "./refine-rate";
import { RefineStage, clockNow, type RefineClock } from "./refine-stage";

/**
 * What a customer watches while Writing Refinement writes their suggestions, full screen like the report scan:
 * 1. an opening sequence (20 seconds) with the same network "tunnel";
 * 2. the live rewrite over their own text, at 1.2 times the report scan's pace per character.
 *
 * The suggestions are made in the background meanwhile and come in one by one (`arrived`, streamed as the writer
 * finishes each; `rewrite` once all are in). The reader never waits: R1 marks each flagged sentence behind it, and
 * R1 and R2 erase and retype a sentence as soon as its suggestion is in. The projected rate falls as each sentence is
 * rewritten. With `verify`, the rewritten text is then re-checked by the detector and the rate ends on that real
 * score (it can rise again: rewording rarely clears text the detector reads as AI throughout); without it (design
 * previews), on the projection.
 */

const FINALE_MS = 7_000;

/** The real re-check of the rewritten text (lib/auto-report/rewrite-check.ts). */
export type RefineVerify = { state: "pending" } | { state: "failed" } | { state: "done"; check: RewriteCheck };

const NO_ITEMS: RewriteItem[] = [];
const noop = () => () => {};
/** False on the server and while hydrating, true after. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

export function RefineScan({
  result,
  rewrite,
  arrived = NO_ITEMS,
  reference,
  title,
  onFinish,
  speed = 1,
  skipIntro = false,
  canSkip = false,
  verify,
}: {
  result: AutoReportResult;
  /** All the suggestions, once the request has answered. */
  rewrite: ReportRewrite | null;
  /** The suggestions that have come in so far, as the writer finishes each. */
  arrived?: RewriteItem[];
  reference: string;
  title: string;
  /** Called when the rewrite is over: show the suggestions. */
  onFinish: () => void;
  /** Design preview only: run faster. */
  speed?: number;
  skipIntro?: boolean;
  /** One admin account (decided on the server): may skip the animation and wait for the suggestions. */
  canSkip?: boolean;
  /** The re-check of the rewritten text, once asked for. */
  verify?: RefineVerify;
}) {
  const reduce = usePrefersReducedMotion();
  const plan = useMemo(() => refinePlan(result), [result]);
  const ratings = useMemo(() => ratingsBySentence(result), [result]);
  const queue = useMemo(() => new Set(pickFlagged(result).map((s) => s.n)), [result]);
  const rate = useMemo(() => refineRate(result), [result]);
  const total = plan.sentences.length;
  const readMs = refineReadMs(plan.chars);

  const mounted = useHydrated();
  const [overlay, setOverlay] = useState(true);
  const [skipped, setSkipped] = useState(false);
  // Read on the client only; the server's render (and hydration) treat the run as just started.
  const [startedAt] = useState(() => (typeof window === "undefined" ? 0 : performance.now()));
  const [now, setNow] = useState(startedAt);
  // When each suggestion came in, on the scan clock.
  const [arrivals, setArrivals] = useState<ReadonlyMap<number, Arrival>>(() => new Map());
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const finished = useRef(false);
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });

  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);

  const end = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    finish.current();
  }, []);

  const introMs = skipIntro ? 0 : REFINE_INTRO_MS / speed;
  const elapsed = mounted ? Math.max(0, now - startedAt) : 0;
  const inIntro = elapsed < introMs;
  const scanMs = Math.max(0, elapsed - introMs) * speed;

  // A flagged sentence the finished rewrite has no item for (should not happen) is shown as kept.
  const missing = rewrite ? [...queue].filter((n) => !rewrite.items.some((it) => it.n === n)).map((n): RewriteItem => ({ n, original: plan.sentences.find((x) => x.n === n)?.text ?? "", rewrite: null, kept: "no suggestion came back" })) : [];
  const incoming = [...arrived, ...(rewrite?.items ?? []), ...missing].filter((it) => queue.has(it.n) && !arrivals.has(it.n));
  if (incoming.length) {
    const next = new Map(arrivals);
    for (const item of incoming) if (!next.has(item.n)) next.set(item.n, { at: scanMs, item });
    setArrivals(next);
  }
  const jobs = useMemo(() => refineJobs(plan, result, arrivals, readMs), [arrivals, plan, result, readMs]);
  const known = Boolean(rewrite) && jobs.every((j) => j.known);
  const endMs = refineEndMs(jobs, readMs);
  const fraction = readerAt(scanMs, readMs);
  const pos = scanPosition(plan, fraction);
  const frontier = fraction >= 1 ? total : pos.index;
  // The rewrite has been typed out; while the re-check runs the finale waits for its score.
  const typed = known && scanMs >= endMs;
  const checking = typed && verify?.state === "pending";
  const done = typed && !checking;
  if (done && doneAt === null) setDoneAt(now);
  const verified = verify?.state === "done" ? verify.check : null;

  const cleared = clearedBy(jobs, scanMs);
  const final = verified ? verified.score : known ? projectedScore(rate, clearedBy(jobs, Infinity)) : rate.original;
  const counts: RefineCounts = {
    rewritten: jobs.filter((j) => j.rewrite && scanMs >= j.end).length,
    total: queue.size,
    kept: jobs.filter((j) => j.known && !j.rewrite && scanMs >= j.end).length,
    counted: Math.max(0, rate.counted - cleared),
    progress: known ? Math.min(1, scanMs / endMs) : Math.min(fraction, jobs.filter((j) => scanMs >= j.end).length / Math.max(1, jobs.length)) * 0.95,
  };

  // The clock the animation runs on between renders.
  const clockRef = useRef<RefineClock>({ at: 0, wall: 0, speed, held: true });
  useLayoutEffect(() => {
    clockRef.current = { at: scanMs, wall: now, speed, held: inIntro || !mounted };
  });

  // The projected rate ticks on its own clock, following the rewrite as the animation shows it.
  const [meter] = useState(() => new RefineMeter());
  const live = useRef({ ready: false, jobs, final, done: false, reduce });
  useLayoutEffect(() => {
    live.current = { ready: mounted && !inIntro, jobs, final, done, reduce };
  });
  useEffect(() => {
    const t = setInterval(() => {
      const l = live.current;
      const at = clockNow(clockRef.current);
      const input: RefineMeterInput = {
        ready: l.ready,
        target: l.done ? l.final : projectedAt(rate, l.jobs, at),
        original: rate.original,
        marks: clearedBy(l.jobs, at),
        done: l.done,
        reduce: l.reduce,
      };
      meter.step(input, performance.now());
    }, 50);
    return () => clearInterval(t);
  }, [meter, rate]);

  useEffect(() => {
    // Suggestions without a sentence to show them on (should not happen): just show them.
    if (rewrite && total === 0) end();
  }, [rewrite, total, end]);
  useEffect(() => {
    if (doneAt !== null && now - doneAt > FINALE_MS) end();
  }, [doneAt, now, end]);
  // Animation skipped: show the suggestions as soon as they are in.
  useEffect(() => {
    if (skipped && rewrite) end();
  }, [skipped, rewrite, end]);
  const skip = () => {
    setSkipped(true);
    setOverlay(false);
  };

  // The page under the full-screen view doesn't scroll while it is open.
  useEffect(() => {
    if (!mounted || !overlay) return;
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = was;
    };
  }, [mounted, overlay]);

  const inline = skipped ? (
    <div className="relative">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#b9a8ff]">
        <span className="refine-live-dot" aria-hidden /> Animation skipped
      </p>
      <p className="mt-3 text-[13px] text-fg-muted">The suggestions show as soon as they are ready.</p>
    </div>
  ) : (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#b9a8ff]">
          <span className="refine-live-dot" aria-hidden /> {inIntro ? "Preparing your rewrite" : done ? "Rewrite complete" : checking ? "Re-checking the rewritten text" : "Live rewrite running"}
        </p>
        <div className="flex flex-wrap gap-2">
          {canSkip && (
            <Button size="sm" variant="ghost" onClick={skip}>
              <SkipForward className="size-3.5" /> Skip animation
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setOverlay(true)}>
            <Maximize2 className="size-3.5" /> Open live view
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <RefineRatePanel compact meter={meter} ready={!inIntro} final={done} verified={Boolean(verified)} original={rate.original} counts={counts} reduce={reduce} />
      </div>
      <p className="mt-3 text-[12px] text-fg-subtle">Your suggestions are saved as soon as they are ready, so they are here when you come back.</p>
    </div>
  );

  const secs = Math.floor(elapsed / 1000);
  const left = known && !inIntro && !typed ? Math.max(0, Math.ceil((endMs - scanMs) / speed / 1000)) : null;
  const made = jobs.filter((j) => j.rewrite).length;

  const view = (
    <motion.div
      key="refine-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Your suggestions are being written"
      className="scan-overlay fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-ink-950 lg:overflow-hidden"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_70%_-10%,rgb(124_108_255/0.22),transparent_70%),radial-gradient(40%_40%_at_0%_100%,rgb(91_140_255/0.14),transparent_70%)]" />
      <div aria-hidden className="scan-scanlines pointer-events-none fixed inset-0" />

      <header className="relative flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:px-6">
        <span className="grid size-8 place-items-center rounded-lg border border-[#9b7bff]/40 bg-[#9b7bff]/10 text-[#cdbdff]">
          <PenLine className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#b9a8ff]">
            <span className="refine-live-dot" aria-hidden /> {inIntro ? "Preparing rewrite" : done ? "Rewrite complete" : checking ? "Re-checking" : "Live rewrite"}
          </p>
          <p className="truncate text-[13px] text-fg-muted">{title}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden font-mono text-[11px] tabular-nums text-fg-subtle sm:inline">
            {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
            {left !== null && <> · ~{left}s left</>}
          </span>
          {canSkip && (
            <button
              type="button"
              onClick={skip}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[12px] text-fg-subtle hover:bg-white/[0.06] hover:text-fg"
              title="Skip the animation (admin only)"
            >
              <SkipForward className="size-3.5" /> Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => setOverlay(false)}
            className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-fg-subtle hover:bg-white/[0.06] hover:text-fg"
            aria-label="Shrink the live view"
            title="Shrink the live view"
          >
            <Minimize2 className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="refine-progress relative shrink-0" aria-hidden>
        <i style={{ width: `${(inIntro ? (elapsed / Math.max(1, introMs)) * 0.12 : 0.12 + counts.progress * 0.88) * 100}%` }} />
      </div>

      <div className="relative flex-1 lg:min-h-0">
        <AnimatePresence mode="wait">
          {inIntro ? (
            <motion.div key="intro" className="lg:h-full" exit={{ opacity: 0, x: -80, filter: "blur(10px)" }} transition={{ duration: 0.4 }}>
              <RefineIntro result={result} rewrite={rewrite} reference={reference} original={rate.original} now={elapsed * speed} />
            </motion.div>
          ) : (
            <motion.div key="scan" className="p-3 sm:p-4 lg:h-full" initial={{ opacity: 0, x: 80, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
              <RefineStage
                plan={plan}
                ratings={ratings}
                queue={queue}
                jobs={jobs}
                known={known}
                readMs={readMs}
                frontier={frontier}
                within={pos.within}
                scanMs={scanMs}
                clockRef={clockRef}
                meter={meter}
                original={rate.original}
                counts={counts}
                waitedSecs={secs}
                reduce={reduce}
                done={done}
                verified={Boolean(verified)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {checking && (
            <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-ink-950/55 p-4 backdrop-blur-[3px]">
              <div className="glass-strong noise relative w-full max-w-md overflow-hidden rounded-3xl p-6 text-center sm:p-8">
                <p className="flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#cdbdff]">
                  <Loader2 className="size-4 animate-spin" /> Re-checking the rewritten text
                </p>
                <p className="mt-4 text-[13.5px] leading-relaxed text-fg-muted">Your text with every suggestion in place is going through the same detector as your report, so the rate you see next is a real score, not an estimate.</p>
                <p className="mt-3 text-[11.5px] text-fg-subtle">This can take a few minutes.</p>
              </div>
            </motion.div>
          )}
          {done && (
            <motion.div key="finale" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 grid place-items-center bg-ink-950/55 p-4 backdrop-blur-[3px]">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.94, rotateX: 12 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.15 }}
                style={{ transformPerspective: 1200 }}
                className="glass-strong noise relative w-full max-w-md overflow-hidden rounded-3xl p-6 text-center sm:p-8"
              >
                <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#9b7bff]/25 blur-3xl" />
                <p className="relative flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#cdbdff]">
                  <Sparkles className="size-4" /> Rewrite complete
                </p>
                <div className="relative mt-5 flex items-end justify-center gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a9c1ff]">Original</p>
                    <p className="mt-1 font-mono text-[34px] font-semibold leading-none text-[#a9c1ff]/70">
                      {Math.round(rate.original * 100)}
                      <span className="text-[16px]">%</span>
                    </p>
                  </div>
                  <ArrowRight className="mb-2 size-5 text-[#b9a8ff]" />
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#cdbdff]">{verified ? "Re-checked" : "Projected"}</p>
                    <p className="refine-rate-num scan-rate-land mt-1 font-mono text-[60px] font-semibold leading-none tracking-tight">
                      {Math.round(final * 100)}
                      <span className="text-[26px]">%</span>
                    </p>
                  </div>
                </div>
                <p className="relative mt-3 text-[13.5px] text-fg-muted">
                  {made} of {jobs.length} flagged sentence{jobs.length === 1 ? "" : "s"} rewritten{jobs.length > made ? ` · ${jobs.length - made} kept as you wrote ${jobs.length - made === 1 ? "it" : "them"}` : ""}
                </p>
                {verified ? (
                  <p className="relative mt-1 text-[11.5px] leading-snug text-fg-subtle">
                    Re-checked by the same detector as your report: {verified.stillCounted.length} of {verified.stillCounted.length + verified.cleared.length} rewritten sentence{verified.stillCounted.length + verified.cleared.length === 1 ? "" : "s"} still read{verified.stillCounted.length + verified.cleared.length === 1 ? "s" : ""} as AI.
                  </p>
                ) : (
                  <p className="relative mt-1 text-[11.5px] leading-snug text-fg-subtle">
                    {verify?.state === "failed" ? "We couldn't re-check the rewritten text just now, so this is only an estimate: your report's score with the rewritten sentences no longer counted." : "Projected: your report\u2019s score with the rewritten sentences no longer counted. Run a new report on your edited text to check."}
                  </p>
                )}
                <Button className="relative mt-6 w-full" size="lg" onClick={end}>
                  <PenLine className="size-4" /> Review your suggestions <ArrowRight className="size-4" />
                </Button>
                <p className="relative mt-3 text-[11px] text-fg-subtle">Opening automatically…</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return (
    <>
      <div className={cn(overlay && "pointer-events-none opacity-60")}>{inline}</div>
      {mounted && createPortal(<AnimatePresence>{overlay && view}</AnimatePresence>, document.body)}
    </>
  );
}
