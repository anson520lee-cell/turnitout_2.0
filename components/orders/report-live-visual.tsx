"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { DepthLayer, DepthStage } from "./depth-stage";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The report request page's illustration: a report being read, fast. Counters
 * race, the text map fills in bar by bar and the sentence feed streams past.
 * Everything is made-up sample data (labelled as such) that loops forever, so
 * it shows the pace and shape of a report and never a real result.
 */

type Level = "low" | "medium" | "high";

const TOTAL = { chars: 18_420, sentences: 214, paragraphs: 17 };
const BARS = 40;
const FEED_ROWS = 7;
const CYCLE = 7200; // ms for one full read
const READ_SHARE = 0.86; // the rest of the cycle holds the finished state
const TICK = 55; // ms between frames

/** Small deterministic hash → 0…1, so server and client render the same first frame. */
const rnd = (n: number) => {
  let x = Math.imul(n + 1, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};
const levelOf = (i: number): Level => {
  const r = rnd(i * 7 + 3);
  return r < 0.6 ? "low" : r < 0.85 ? "medium" : "high";
};
const paragraphOf = (s: number) => Math.min(TOTAL.paragraphs, Math.floor((s / TOTAL.sentences) * TOTAL.paragraphs) + 1);

// Marked (medium or high) sentences up to and including each sentence.
const MARKED: number[] = [];
const HIGH_AT: number[] = [];
{
  let m = 0;
  for (let i = 0; i < TOTAL.sentences; i++) {
    if (levelOf(i) !== "low") m++;
    MARKED.push(m);
    HIGH_AT.push(levelOf(i) === "high" ? i : (HIGH_AT[i - 1] ?? 0));
  }
}

const LEVEL = {
  low: { label: "Low", bar: "bg-ok/55", chip: "border-ok/30 bg-ok/10 text-ok", dot: "bg-ok" },
  medium: { label: "Medium", bar: "bg-warn/80", chip: "border-warn/30 bg-warn/10 text-warn", dot: "bg-warn" },
  high: { label: "High", bar: "bg-risk/90", chip: "border-risk/35 bg-risk/10 text-risk", dot: "bg-risk" },
} as const;

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const num = (n: number) => n.toLocaleString("en-US");

function useLiveClock(reduce: boolean) {
  // Start on a finished frame so the server HTML, and a reduced-motion user, see a full report.
  const [state, setState] = useState({ t: CYCLE * READ_SHARE, tick: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce) return;
    let visible = true;
    const start = performance.now() - CYCLE * 0.1;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    if (ref.current) io.observe(ref.current);
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return;
      const now = performance.now();
      setState((s) => ({ t: (now - start) % CYCLE, tick: s.tick + 1 }));
    }, TICK);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, [reduce]);
  return { ...state, ref };
}

function Tile({ label, value, of, hot }: { label: string; value: string; of?: string; hot?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 px-3 py-2">
      <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-subtle">{label}</p>
      <p className={cn("mt-1 whitespace-nowrap font-mono text-[18px] font-semibold leading-none tabular-nums tracking-tight sm:text-[19px]", hot && "text-risk")}>
        {value}
        {of && <span className="ml-1 text-[10px] font-normal text-fg-subtle">/ {of}</span>}
      </p>
    </div>
  );
}

type Clock = ReturnType<typeof useLiveClock>;

const progress = (t: number) => (t < CYCLE * READ_SHARE ? t / (CYCLE * READ_SHARE) : 1);
const sentencesRead = (p: number) => Math.min(TOTAL.sentences, Math.floor(p * TOTAL.sentences));

function Live({ reduce, clock }: { reduce: boolean; clock: Clock }) {
  const { t, tick, ref } = clock;
  const reading = t < CYCLE * READ_SHARE;
  const p = progress(t);
  const sent = sentencesRead(p);
  const chars = Math.floor(p * TOTAL.chars);
  const paras = Math.min(TOTAL.paragraphs, Math.floor(p * TOTAL.paragraphs));
  const marked = sent > 0 ? MARKED[sent - 1] : 0;
  const rate = reduce ? 214 : 190 + Math.floor(rnd(tick) * 70);
  const edge = Math.floor(p * BARS);

  return (
    <div ref={ref} className="glass-strong noise relative overflow-hidden rounded-2xl">
      <div aria-hidden className="absolute -right-16 -top-20 size-56 rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 -left-10 size-56 rounded-full bg-violet/15 blur-3xl" />

      {/* title bar */}
      <div className="relative flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
          <FileText className="size-3.5" />
        </span>
        <span className="text-[12.5px] font-medium">AI-Writing Risk Report</span>
        <span className="rounded-full border border-violet/30 bg-violet/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#c7b8ff]">
          Sample data
        </span>
        <span className={cn("ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums", reading ? "text-accent" : "text-ok")}>
          <span className={cn("size-1.5 rounded-full", reading ? "bg-accent shadow-[0_0_8px_2px_rgb(91_140_255/0.7)]" : "bg-ok shadow-[0_0_8px_2px_rgb(79_209_165/0.6)]")} />
          {reading ? `Reading ${pad(Math.floor(p * 100), 2)}%` : "Complete"}
        </span>
      </div>
      <div className="relative h-[2px] bg-white/[0.04]">
        <div className="h-full bg-gradient-to-r from-accent via-violet to-cyan" style={{ width: `${p * 100}%` }} />
      </div>

      <div className="relative grid gap-4 p-4 sm:grid-cols-[1fr_228px] sm:gap-5 sm:p-5 sm:pb-12">
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Characters" value={num(chars)} of={num(TOTAL.chars)} />
            <Tile label="Sentences" value={pad(sent, 3)} of={String(TOTAL.sentences)} />
            <Tile label="Paragraphs" value={pad(paras, 2)} of={String(TOTAL.paragraphs)} />
            <Tile label="Marked" value={pad(marked, 3)} hot />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Text map</p>
            <p className="font-mono text-[10px] tabular-nums text-fg-subtle">{pad(rate, 3)} sentences / s</p>
          </div>
          <div className="mt-2 flex h-[72px] items-end sm:h-[88px] gap-[3px]">
            {Array.from({ length: BARS }, (_, b) => {
              const seen = b < edge;
              const front = b >= edge - 2 && b <= edge + 1 && reading;
              const base = 30 + rnd(b * 3 + 1) * 70;
              const jitter = reduce || !seen ? 0 : (rnd(b + tick * 31) - 0.5) * 16;
              const h = !seen && !front ? 14 : front ? 40 + rnd(b + tick * 17) * 60 : Math.max(18, Math.min(100, base + jitter));
              return (
                <span
                  key={b}
                  className={cn("flex-1 rounded-[3px] transition-[height] duration-[60ms]", seen ? LEVEL[levelOf(b * 5 + 1)].bar : front ? "bg-accent/70" : "bg-white/[0.07]")}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-fg-subtle">
            {(["low", "medium", "high"] as const).map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", LEVEL[l].dot)} /> {LEVEL[l].label}
              </span>
            ))}
          </div>
        </div>

        {/* sentence feed */}
        <div className="min-w-0 rounded-xl border border-[var(--line)] bg-ink-900/60 p-2.5">
          <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Sentence feed</p>
          <ul className="mt-2 space-y-1">
            {Array.from({ length: FEED_ROWS }, (_, r) => {
              const i = sent - r;
              const ok = i >= 0 && (sent > 0 || r > 0);
              const lv = ok ? levelOf(i) : "low";
              return (
                <li
                  key={r}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1 font-mono text-[10.5px] tabular-nums",
                    r === 0 ? "bg-white/[0.07] text-fg" : "text-fg-muted",
                    r > 3 && "hidden sm:flex",
                  )}
                  style={{ opacity: ok ? 1 - r * 0.1 : 0.15 }}
                >
                  <span className="w-[34px] text-fg-subtle">#{ok ? pad(i + 1, 3) : "---"}</span>
                  <span className="w-[26px] text-fg-subtle">P{ok ? pad(paragraphOf(i), 2) : "--"}</span>
                  <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL[lv].bar)} style={{ width: `${ok ? 25 + rnd(i * 11 + tick * (r === 0 ? 1 : 0)) * 75 : 0}%` }} />
                  </span>
                  <span className={cn("w-[52px] rounded-full border px-1.5 text-center text-[9.5px] leading-[16px]", ok ? LEVEL[lv].chip : "border-transparent text-transparent")}>
                    {LEVEL[lv].label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ReportLiveVisual({ className }: { className?: string }) {
  const reduce = usePrefersReducedMotion();
  const clock = useLiveClock(reduce);
  const sent = sentencesRead(progress(clock.t));
  const high = sent > 0 ? HIGH_AT[sent - 1] : 0;
  return (
    <DepthStage className={cn("relative w-full", className)} tilt={9}>
      <DepthLayer depth={0} className="inset-x-0 top-0 sm:inset-x-[2%]">
        <Live reduce={reduce} clock={clock} />
      </DepthLayer>
      <DepthLayer depth={60} drift={8} className="-bottom-1 left-6 hidden sm:block">
        <div className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-medium">
          <Download className="size-3.5 text-accent" /> PDF download
        </div>
      </DepthLayer>
      <DepthLayer depth={75} drift={10} className="-bottom-2 right-1 hidden sm:block">
        <div className="glass-strong rounded-xl p-3 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.8),0_0_30px_-8px_rgb(255_122_138/0.35)]">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-risk">
            <span className="size-1.5 rounded-full bg-risk shadow-[0_0_8px_2px_rgb(255_122_138/0.6)]" /> Latest high-risk sentence
          </p>
          <p className="mt-1.5 font-mono text-[20px] font-semibold leading-none tabular-nums">#{pad(high + 1, 3)}</p>
          <p className="mt-1 text-[11px] text-fg-muted">Paragraph {pad(paragraphOf(high), 2)} · marked to look at again</p>
        </div>
      </DepthLayer>
    </DepthStage>
  );
}
