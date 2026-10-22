"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { NeuralWaitVisual } from "@/components/ui/neural-wait-visual";
import { HudCorners } from "@/components/ui/hud";
import { cn } from "@/lib/utils";

/**
 * The free scan's opening sequence: the same full-screen "tunnel" as the paid
 * report's, only shorter (about 8 seconds). The scan itself is already running
 * behind it: the result and the written review are fetched meanwhile, and the
 * live scan only starts once they are in. If they are late the last step holds
 * (the bar stops just short of the end) instead of showing an empty wait. Every
 * line is counted from the visitor's own text or read from the real run.
 */

const MIN_MS = 8_000;
/** Give up waiting for the written review after this long (the result is still shown, the review keeps arriving). */
const MAX_WAIT_MS = 75_000;
const fmt = (n: number) => n.toLocaleString("en-US");

export function QuickIntro({ text, dataReady, ready, onReady }: { text: string; dataReady: boolean; ready: boolean; onReady: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const called = useRef(false);

  useEffect(() => {
    const start = performance.now();
    const t = setInterval(() => setElapsed(performance.now() - start), 100);
    return () => clearInterval(t);
  }, []);

  // Lock the page behind the view while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prev);
  }, []);

  const go = elapsed >= MIN_MS && (ready || (dataReady && elapsed >= MAX_WAIT_MS));
  useEffect(() => {
    if (!go || called.current) return;
    called.current = true;
    onReady();
  }, [go, onReady]);

  const facts = useMemo(() => {
    const t = text.trim();
    return {
      chars: t.length,
      words: t.split(/\s+/).filter(Boolean).length,
      sentences: (t.match(/[^.!?。！？]+[.!?。！？]+/g) ?? [t]).length,
      paragraphs: t.split(/\n\s*\n/).filter((x) => x.trim()).length || 1,
    };
  }, [text]);

  const steps = [
    { at: 0, title: "Establishing secure session", lines: ["encrypted connection", "private workspace allocated"] },
    { at: 1_600, title: "Loading review engine", lines: ["0% Pattern Engine · quick scan", "review model ready"] },
    { at: 3_200, title: "Handing over your text", lines: [`${fmt(facts.chars)} characters · ${fmt(facts.words)} words`, `${facts.paragraphs} paragraph${facts.paragraphs === 1 ? "" : "s"} · about ${facts.sentences} sentences`] },
    { at: 4_800, title: "Reviewer reading your text", lines: [dataReady ? "result received" : "reviewer working…", ready ? "written review received" : "written review in progress…"] },
    { at: 6_600, title: "Opening quick scan", lines: ["replaying the reviewer's findings over your text"] },
  ];
  const active = steps.reduce((i, s, k) => (elapsed >= s.at ? k : i), 0);
  // The last step holds until the real result is in.
  const shownActive = !go && active === steps.length - 1 ? steps.length - 2 : active;
  const pct = go ? 100 : Math.min(96, (elapsed / MIN_MS) * 96);
  const secs = Math.max(0, Math.ceil((MIN_MS - elapsed) / 1000));
  const waiting = elapsed >= MIN_MS && !go;

  const view = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Starting your scan"
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-ink-950"
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_70%_-10%,rgb(91_140_255/0.16),transparent_70%)]" />
      <header className="relative flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:px-6">
        <span className="grid size-8 place-items-center rounded-lg border border-[var(--line-strong)] bg-white/[0.04] font-mono text-[12px] font-semibold text-fg">0%</span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-accent">
            <span className="scan-live-dot" aria-hidden /> Quick scan
          </p>
          <p className="truncate text-[13px] text-fg-muted">Free scan · {fmt(facts.chars)} characters</p>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-4 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-ink-950/60">
          <HudCorners />
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(45%_60%_at_50%_45%,rgb(91_140_255/0.22),transparent_70%)]" />
          <div aria-hidden className="scan-intro-grid absolute inset-0 opacity-60" />
          <NeuralWaitVisual className="relative h-[34vh] min-h-[200px] w-full sm:h-[40vh]" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={shownActive}
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                transition={{ duration: 0.35 }}
                className="text-center text-[18px] font-semibold tracking-tight sm:text-[22px]"
              >
                {steps[shownActive].title}
                <span className="scan-ellipsis" aria-hidden />
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <ol className="space-y-1.5" aria-live="polite">
            {steps.map((s, i) => {
              const state = i < shownActive ? "done" : i === shownActive ? "run" : "todo";
              return (
                <li key={s.title} className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 transition", state === "run" && "bg-accent/10", state === "todo" && "opacity-35")}>
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      state === "done" ? "border-ok/50 bg-ok/15 text-ok" : state === "run" ? "border-accent/60 text-accent" : "border-[var(--line-strong)]",
                    )}
                  >
                    {state === "done" ? <Check className="size-3" /> : state === "run" ? <span className="scan-spinner" aria-hidden /> : null}
                  </span>
                  <span className={cn("text-[13.5px]", state === "run" ? "text-fg" : "text-fg-muted")}>{s.title}</span>
                  {state === "done" && <span className="ml-auto font-mono text-[10.5px] text-ok/80">OK</span>}
                </li>
              );
            })}
          </ol>
          <div className="rounded-2xl border border-[var(--line)] bg-ink-950/70 p-4 font-mono text-[11.5px] leading-relaxed">
            <p className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
              <span>handover.log</span>
              <span>{waiting ? "finishing…" : `T-${String(secs).padStart(2, "0")}s`}</span>
            </p>
            <div className="space-y-0.5">
              {steps.slice(0, shownActive + 1).flatMap((s, i) =>
                s.lines.map((l, k) => {
                  const visible = i < shownActive || elapsed - s.at > 350 + k * 420;
                  if (!visible) return null;
                  return (
                    <p key={`${i}-${k}`} className={cn("scan-type truncate", i === shownActive ? "text-cyan" : "text-fg-subtle")}>
                      <span className="text-fg-subtle/60">{k === 0 ? "›" : " "} </span>
                      {l}
                      {i < shownActive && k === s.lines.length - 1 && <span className="text-ok"> ✓</span>}
                    </p>
                  );
                }),
              )}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-accent via-cyan to-violet transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return createPortal(view, document.body);
}
