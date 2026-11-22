"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileCheck2, Maximize2, Minimize2, ShieldCheck, SkipForward } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { aiScore, reportOverall, reportScore, scoreBasis } from "@/lib/auto-report/stitch";
import { INTRO_MS, flaggedPrefix, liveEstimate, ratingsBySentence, scanDurationMs, scanPlan, scanPosition } from "@/lib/auto-report/scan-script";
import { cn } from "@/lib/utils";
import { RateMeter, type MeterInput } from "./rate-meter";
import { RatePanel } from "./scan-panels";
import { ScanIntro } from "./scan-intro";
import { ScanStage } from "./scan-stage";
import type { ReportFeed } from "./use-report-feed";

/**
 * What a customer watches after paying for a report. Two parts, full screen:
 * 1. an opening sequence (about 24 seconds) with the network "tunnel";
 * 2. the live scan of their own text, about 70 seconds for 5,000 characters, at a fixed rate per character.
 *
 * The real report is made in the background meanwhile (see `feed`). The scan
 * only shows ratings from it: a sentence is marked, and the AI rate moves,
 * only once the reviewer's answer is in. If the answer is late the scan waits
 * near the end; if it comes early the scan still runs at its own pace.
 */

const FINALE_MS = 7_000;

const noop = () => () => {};
/** False on the server and while hydrating, true after. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

export function ReportScan({
  text,
  feed,
  reference,
  title,
  onFinish,
  speed = 1,
  skipIntro = false,
  canSkip = false,
}: {
  text: string;
  feed: ReportFeed;
  /** Shown in the header, for example "Order #1A2B3C4D". */
  reference: string;
  title: string;
  /** Called when the scan is over (or the report failed): show the report. */
  onFinish: () => void;
  /** Design preview only: run faster. */
  speed?: number;
  skipIntro?: boolean;
  /** One admin account (decided on the server): may skip the animation and wait for the report. */
  canSkip?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const plan = useMemo(() => scanPlan(text), [text]);
  const total = plan.sentences.length;
  const result = feed.result;
  const ratings = useMemo(() => (result ? ratingsBySentence(result) : null), [result]);
  const duration = scanDurationMs(plan.chars);

  const mounted = useHydrated();
  const [overlay, setOverlay] = useState(true);
  const [skipped, setSkipped] = useState(false);
  // Read on the client only; the server's render (and hydration) treat the scan as just started.
  const [startedAt] = useState(() => (typeof window === "undefined" ? 0 : performance.now()));
  const [now, setNow] = useState(startedAt);
  const [resultAt, setResultAt] = useState<number | null>(null);
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

  const introMs = skipIntro ? 0 : INTRO_MS / speed;
  const elapsed = mounted ? Math.max(0, now - startedAt) : 0;
  const inIntro = elapsed < introMs;
  const scanMs = Math.max(0, elapsed - introMs) * speed;
  const fraction = result ? scanMs / duration : Math.min(scanMs / duration, 0.97);
  const pos = scanPosition(plan, fraction);
  const frontier = result && fraction >= 1 ? total : pos.index;

  // Ratings are shown as the scan passes each sentence; ones it passed before the reviewer answered are filled in quickly.
  if (result && resultAt === null) setResultAt(scanMs);
  const cascade = Math.max(25, total / 4); // sentences per second while catching up
  const at = frontier >= total ? total : pos.index + pos.within;
  const revealedAt = result ? Math.min(at, (Math.max(0, scanMs - (resultAt ?? scanMs)) / 1000) * cascade) : 0;
  const revealed = Math.floor(revealedAt);

  const done = Boolean(result) && fraction >= 1 && revealed >= total;
  if (done && doneAt === null) setDoneAt(now);
  const basis = result ? scoreBasis(result.summary) : null;
  const countedOnly = result?.summary.countedShare !== undefined;
  const prefix = useMemo(() => (ratings ? flaggedPrefix(plan, ratings, countedOnly) : null), [plan, ratings, countedOnly]);
  const estimate = basis && prefix ? liveEstimate(prefix, total, basis.share, revealedAt) : null;
  const score = estimate === null || !basis ? null : aiScore(estimate, basis.curve);

  // The live rate ticks on its own clock, following the real estimate on the report's AI score scale.
  const [meter] = useState(() => new RateMeter());
  const input = useRef<MeterInput>({ ready: false, base: 0, progress: 0, done: false, final: 0, reduce });
  useLayoutEffect(() => {
    input.current = { ready: estimate !== null && !inIntro, base: score ?? 0, progress: total ? revealedAt / total : 0, done, final: result ? reportScore(result.summary) : 0, reduce };
  });
  useEffect(() => {
    const t = setInterval(() => meter.step(input.current, performance.now()), 50);
    return () => clearInterval(t);
  }, [meter]);

  useEffect(() => {
    if (feed.state === "failed") end();
    // A finished report without its data (should not happen): just show the report.
    if (feed.state === "done" && (!feed.result || total === 0)) end();
  }, [feed.state, feed.result, total, end]);
  useEffect(() => {
    if (doneAt !== null && now - doneAt > FINALE_MS) end();
  }, [doneAt, now, end]);
  // Animation skipped: show the report as soon as it is finished.
  useEffect(() => {
    if (skipped && feed.state === "done") end();
  }, [skipped, feed.state, end]);
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

  const scanned = ratings ? Math.min(revealed, total) : 0;
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, uncertain: 0 };
    if (!ratings) return c;
    for (let i = 0; i < scanned; i++) {
      const r = ratings.get(plan.sentences[i].n)?.risk;
      if (r === "high" || r === "medium" || r === "uncertain") c[r] += 1;
    }
    return c;
  }, [ratings, scanned, plan]);

  const inline = skipped ? (
    <div className="relative">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
        <span className="scan-live-dot" aria-hidden /> Animation skipped
      </p>
      <p className="mt-3 text-[13px] text-fg-muted">
        The report opens as soon as it is ready{feed.total > 0 && <> ({feed.reviewed} of {feed.total} sections reviewed)</>}.
      </p>
    </div>
  ) : (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          <span className="scan-live-dot" aria-hidden /> {inIntro ? "Preparing your scan" : done ? "Scan complete" : "Live scan running"}
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
        <RatePanel compact meter={meter} ready={estimate !== null && !inIntro} estimate={estimate ?? 0} final={done} scanned={scanned} total={total} high={counts.high} medium={counts.medium} uncertain={counts.uncertain} curve={basis?.curve} />
      </div>
      <p className="mt-3 text-[12px] text-fg-subtle">You can close this page: your report is saved and carries on when you come back.</p>
    </div>
  );

  const secs = Math.floor(elapsed / 1000);
  const left = result && !inIntro && !done ? Math.max(0, Math.ceil((duration - scanMs) / speed / 1000)) : null;

  const view = (
    <motion.div
      key="scan-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      role="dialog"
      aria-modal="true"
      aria-label="Your report is being made"
      className="scan-overlay fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-ink-950 lg:overflow-hidden"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_70%_-10%,rgb(91_140_255/0.18),transparent_70%),radial-gradient(40%_40%_at_0%_100%,rgb(141_150_172/0.12),transparent_70%)]" />
      <div aria-hidden className="scan-scanlines pointer-events-none fixed inset-0" />

      <header className="relative flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:px-6">
        <span className="grid size-8 place-items-center rounded-lg border border-[var(--line-strong)] bg-white/[0.04] font-mono text-[12px] font-semibold text-fg">0%</span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-accent">
            <span className="scan-live-dot" aria-hidden /> {inIntro ? "Preparing scan" : done ? "Scan complete" : "Live scan"}
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

      <div className="relative flex-1 lg:min-h-0">
        <AnimatePresence mode="wait">
          {inIntro ? (
            <motion.div key="intro" className="lg:h-full" exit={{ opacity: 0, scale: 1.04, filter: "blur(8px)" }} transition={{ duration: 0.5 }}>
              <ScanIntro plan={plan} text={text} feed={feed} reference={reference} startedAt={0} now={elapsed * speed} />
            </motion.div>
          ) : (
            <motion.div key="scan" className="p-3 sm:p-4 lg:h-full" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
              <ScanStage
                plan={plan}
                result={result}
                ratings={ratings}
                feed={feed}
                frontier={frontier}
                within={pos.within}
                revealed={revealed}
                meter={meter}
                estimate={estimate}
                elapsedMs={scanMs}
                reduce={reduce}
                done={done}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {done && result && (
            <motion.div
              key="finale"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-30 grid place-items-center bg-ink-950/55 p-4 backdrop-blur-[3px]"
            >
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.94, rotateX: 12 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.15 }}
                style={{ transformPerspective: 1200 }}
                className="glass-strong noise relative w-full max-w-md overflow-hidden rounded-3xl p-6 text-center sm:p-8"
              >
                <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
                <p className="relative flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ok">
                  <ShieldCheck className="size-4" /> Scan complete
                </p>
                <p className="scan-rate-land relative mt-4 font-mono text-[64px] font-semibold leading-none tracking-tight">
                  {Math.round(reportScore(result.summary) * 100)}
                  <span className="text-[28px] text-fg-subtle">%</span>
                </p>
                <p className="relative mt-2 text-[13.5px] text-fg-muted">AI score · {Math.round(result.summary.flaggedShare * 100)}% of sentences flagged</p>
                <p className="relative mt-1 text-[12.5px] text-fg-subtle">
                  {result.summary.high} high · {result.summary.medium} medium · {result.summary.sentences} sentences · overall{" "}
                  <span className="text-fg">{{ low: "Low", moderate: "Moderate", elevated: "Elevated" }[reportOverall(result.summary)]}</span>
                </p>
                <Button className="relative mt-6 w-full" size="lg" onClick={end}>
                  <FileCheck2 className="size-4" /> Open full report <ArrowRight className="size-4" />
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
