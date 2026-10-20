"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { DepthLayer, DepthStage } from "./depth-stage";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The report request page's illustration: a market-style ticker for the
 * reviewer. A flagged-share line wanders and scrolls left like a price chart,
 * volume bars under it scroll in step, counters run on and a sentence feed
 * streams past. Nothing ever resets or stops: every curve is a continuous
 * function of time, so there is no loop point to see. Everything is made-up
 * sample data (labelled as such) and never a real result.
 */

type Level = "low" | "medium" | "high";

const POINTS = 60; // samples across the chart window
const PER_SECOND = 5; // samples that scroll past each second
const SENTENCES_PER_SECOND = 26;
const FEED_ROWS = 7;
const TICK = 55; // ms between frames
const START_MS = 12_000; // first frame, also what reduced-motion users see

/** Small deterministic hash → 0…1, so server and client render the same first frame. */
const rnd = (n: number) => {
  let x = Math.imul(Math.floor(n) + 1, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};

/** The flagged-share wave at sample k (0…1): slow swells, mid swings and a little noise. */
const wave = (k: number) => {
  const v =
    0.5 +
    0.14 * Math.sin(k * 0.045) +
    0.16 * Math.sin(k * 0.19 + 0.4) +
    0.1 * Math.sin(k * 0.47 + 1.7) +
    0.05 * Math.sin(k * 1.3) +
    0.14 * (rnd(k) - 0.5);
  return Math.max(0.06, Math.min(0.94, v));
};
const share = (v: number) => 14 + v * 36; // shown as a % of sentences flagged
const levelOfWave = (v: number): Level => (v > 0.62 ? "high" : v > 0.42 ? "medium" : "low");
const levelOf = (i: number): Level => {
  const r = rnd(i * 7 + 3);
  return r < 0.6 ? "low" : r < 0.85 ? "medium" : "high";
};

const LEVEL = {
  low: { label: "Low", color: "var(--color-ok)", bar: "bg-ok/55", chip: "border-ok/30 bg-ok/10 text-ok", dot: "bg-ok" },
  medium: { label: "Medium", color: "var(--color-warn)", bar: "bg-warn/80", chip: "border-warn/30 bg-warn/10 text-warn", dot: "bg-warn" },
  high: { label: "High", color: "var(--color-risk)", bar: "bg-risk/90", chip: "border-risk/35 bg-risk/10 text-risk", dot: "bg-risk" },
} as const;

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const num = (n: number) => n.toLocaleString("en-US");

function useLiveClock(reduce: boolean) {
  // Starts on a fixed frame so the server HTML (and a reduced-motion user) always match.
  const [state, setState] = useState({ t: START_MS, tick: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce) return;
    let visible = true;
    const start = performance.now() - START_MS;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    if (ref.current) io.observe(ref.current);
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return;
      const t = performance.now() - start;
      setState((s) => ({ t, tick: s.tick + 1 }));
    }, TICK);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, [reduce]);
  return { ...state, ref };
}
type Clock = ReturnType<typeof useLiveClock>;

function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-ink-900/60 px-3 py-2">
      <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-subtle">{label}</p>
      <p className={cn("mt-1 whitespace-nowrap font-mono text-[18px] font-semibold leading-none tabular-nums tracking-tight sm:text-[19px]", className)}>{children}</p>
    </div>
  );
}

/** Where the chart is at time t: whole samples scrolled, and the fraction of the next one. */
const scrollOf = (t: number) => {
  const s = (t / 1000) * PER_SECOND;
  const k0 = Math.floor(s);
  return { k0, frac: s - k0 };
};

function Chart({ t, tick, reduce }: { t: number; tick: number; reduce: boolean }) {
  const { k0, frac } = scrollOf(t);
  const W = POINTS - 1;
  const H = 100;
  const y = (v: number) => 8 + (1 - v) * 84; // keeps the line off the frame edges
  const tip = wave(k0 + W) * frac + wave(k0 + W - 1) * (1 - frac);
  // The newest sample is pulled toward the live value by a little noise, like a price still moving.
  const live = reduce ? tip : Math.max(0.04, Math.min(0.96, tip + (rnd(tick * 13 + 5) - 0.5) * 0.05));
  const pts: string[] = [];
  for (let j = 0; j < POINTS - 1; j++) pts.push(`${(j - frac).toFixed(3)},${y(wave(k0 + j)).toFixed(2)}`);
  pts.push(`${W},${y(live).toFixed(2)}`);
  const line = `M${pts.join("L")}`;
  const area = `${line}L${W},${H}L${-frac},${H}Z`;
  const prev = wave(k0 + W - 1 + (frac > 0.5 ? 0 : -1));
  const delta = share(live) - share(prev);
  const up = delta >= 0;
  const color = LEVEL[levelOfWave(live)].color;

  return (
    <div className="relative">
      <div className="relative h-[96px] overflow-hidden rounded-md border border-[var(--line)] bg-ink-900/50 sm:h-[116px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <linearGradient id="live-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.38" />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line key={g} x1="0" x2={W} y1={g} y2={g} stroke="rgb(148 163 255)" strokeOpacity="0.1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
          {Array.from({ length: 6 }, (_, i) => {
            const x = i * 12 - ((k0 + frac) % 12); // vertical grid scrolls with the data
            return <line key={i} x1={x} x2={x} y1="0" y2={H} stroke="rgb(148 163 255)" strokeOpacity="0.06" vectorEffect="non-scaling-stroke" />;
          })}
          <path d={area} fill="url(#live-area)" />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 4px rgb(91 140 255 / 0.8))" }} />
        </svg>
        <span className="absolute left-2 top-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-fg-subtle">Flagged share</span>
      </div>
      {/* the live tip: a dot on the line and a price tag */}
      <span
        aria-hidden
        className="absolute right-[-3px] size-[7px] -translate-y-1/2 rounded-full"
        style={{ top: `${8 + (1 - live) * 84}%`, background: color, boxShadow: `0 0 10px 2px ${color}` }}
      />
      <span
        className="absolute right-1.5 -translate-y-1/2 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
        style={{ top: `${8 + (1 - live) * 84}%`, color, borderColor: color, background: "rgb(8 12 24 / 0.85)" }}
      >
        {share(live).toFixed(1)}% <span className="opacity-80">{up ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}</span>
      </span>
    </div>
  );
}

function Volume({ t, tick, reduce }: { t: number; tick: number; reduce: boolean }) {
  const { k0, frac } = scrollOf(t);
  const W = POINTS - 1;
  return (
    <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" className="mt-1.5 h-[40px] w-full overflow-hidden sm:h-[48px]" aria-hidden>
      {Array.from({ length: POINTS }, (_, j) => {
        const k = k0 + j;
        const newest = j >= POINTS - 2;
        let h = 0.22 + 0.78 * rnd(k * 3 + 1);
        if (newest && !reduce) h = h * 0.55 + 0.45 * rnd(k + tick * 13);
        const lv = LEVEL[levelOfWave(wave(k))];
        return <rect key={j} x={j - frac - 0.34} y={40 - h * 40} width="0.68" height={h * 40} rx="0.12" fill={lv.color} fillOpacity={0.62} />;
      })}
    </svg>
  );
}

function Live({ reduce, clock }: { reduce: boolean; clock: Clock }) {
  const { t, tick, ref } = clock;
  const sent = Math.floor((t / 1000) * SENTENCES_PER_SECOND);
  const marked = Math.floor(sent * 0.41);
  const rate = reduce ? 214 : 190 + Math.floor(rnd(tick) * 70);

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
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          Live
        </span>
      </div>

      <div className="relative grid gap-4 p-4 sm:grid-cols-[1fr_228px] sm:gap-5 sm:p-5 sm:pb-12">
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Sentences">{num(184_000 + sent)}</Tile>
            <Tile label="Marked" className="text-risk">{num(75_400 + marked)}</Tile>
          </div>
          <div className="mt-3">
            <Chart t={t} tick={tick} reduce={reduce} />
            <Volume t={t} tick={tick} reduce={reduce} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-fg-subtle">
            {(["low", "medium", "high"] as const).map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", LEVEL[l].dot)} /> {LEVEL[l].label}
              </span>
            ))}
            <span className="ml-auto font-mono tabular-nums">{pad(rate, 3)} sent/s</span>
          </div>
        </div>

        {/* sentence feed */}
        <div className="min-w-0 rounded-xl border border-[var(--line)] bg-ink-900/60 p-2.5">
          <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">Sentence feed</p>
          <ul className="mt-2 space-y-1">
            {Array.from({ length: FEED_ROWS }, (_, r) => {
              const i = sent - r + 184_000;
              const lv = levelOf(i);
              return (
                <li
                  key={r}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1 font-mono text-[10.5px] tabular-nums",
                    r === 0 ? "bg-white/[0.07] text-fg" : "text-fg-muted",
                    r > 3 && "hidden sm:flex",
                  )}
                  style={{ opacity: 1 - r * 0.1 }}
                >
                  <span className="w-[52px] text-fg-subtle">#{i}</span>
                  <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL[lv].bar)} style={{ width: `${25 + rnd(i * 11 + tick * (r === 0 ? 1 : 0)) * 75}%` }} />
                  </span>
                  <span className={cn("w-[52px] rounded-full border px-1.5 text-center text-[9.5px] leading-[16px]", LEVEL[lv].chip)}>{LEVEL[lv].label}</span>
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
  const sent = Math.floor((clock.t / 1000) * SENTENCES_PER_SECOND) + 184_000;
  let high = sent;
  while (levelOf(high) !== "high") high--;
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
          <p className="mt-1.5 font-mono text-[20px] font-semibold leading-none tabular-nums">#{high}</p>
          <p className="mt-1 text-[11px] text-fg-muted">Paragraph {Math.floor(high / 12)} · marked to look at again</p>
        </div>
      </DepthLayer>
    </DepthStage>
  );
}
