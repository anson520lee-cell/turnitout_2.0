"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Download, FileText } from "lucide-react";
import { DepthLayer, DepthStage } from "@/components/orders/depth-stage";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The site's shared illustration: a market-style ticker for the reviewer. A
 * flagged-share line wanders and scrolls left like a price chart, volume bars under it scroll in step, counters run on and a sentence feed
 * streams past. Nothing ever resets or stops: every curve is a continuous
 * function of time, so there is no loop point to see. Everything is made-up
 * demo data and never a real result. Used by the home hero, the scan and
 * request pages, the sign-in backdrop and the scroll story.
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
  low: { label: "Low", color: "var(--color-chart-low)", bar: "bg-chart-low/60", chip: "border-chart-low/30 bg-chart-low/10 text-chart-low", dot: "bg-chart-low" },
  medium: { label: "Medium", color: "var(--color-chart-mid)", bar: "bg-chart-mid/80", chip: "border-chart-mid/35 bg-chart-mid/10 text-chart-mid", dot: "bg-chart-mid" },
  high: { label: "High", color: "var(--color-chart-high)", bar: "bg-chart-high/90", chip: "border-chart-high/45 bg-chart-high/15 text-[#7ea4ff]", dot: "bg-chart-high" },
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

function Tile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
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

/** The line for one series as an SVG path (plus the area under it) across the scrolling window. */
function seriesPath(k0: number, frac: number, offset: number, tipNoise: number) {
  const W = POINTS - 1;
  const y = (v: number) => 8 + (1 - v) * 84; // keeps the line off the frame edges
  const f = (k: number) => wave(k + offset);
  const tip = f(k0 + W) * frac + f(k0 + W - 1) * (1 - frac);
  const live = Math.max(0.04, Math.min(0.96, tip + tipNoise));
  const pts: string[] = [];
  for (let j = 0; j < POINTS - 1; j++) pts.push(`${(j - frac).toFixed(3)},${y(f(k0 + j)).toFixed(2)}`);
  pts.push(`${W},${y(live).toFixed(2)}`);
  const line = `M${pts.join("L")}`;
  return { line, area: `${line}L${W},100L${-frac},100Z`, live, prev: f(k0 + W - 1 + (frac > 0.5 ? 0 : -1)) };
}

function Chart({
  t,
  tick,
  reduce,
  label = "Flagged share",
  second,
  tag = true,
  className,
}: {
  t: number;
  tick: number;
  reduce: boolean;
  label?: string | null;
  /** A second line (for comparisons), drawn behind the first. */
  second?: boolean;
  /** The price tag at the live tip. */
  tag?: boolean;
  className?: string;
}) {
  const gid = useId();
  const { k0, frac } = scrollOf(t);
  const W = POINTS - 1;
  const H = 100;
  const noise = reduce ? 0 : (rnd(tick * 13 + 5) - 0.5) * 0.05;
  const main = seriesPath(k0, frac, 0, noise);
  const other = second ? seriesPath(k0, frac, 311, reduce ? 0 : (rnd(tick * 7 + 2) - 0.5) * 0.05) : null;
  const delta = share(main.live) - share(main.prev);
  const up = delta >= 0;
  const color = LEVEL[levelOfWave(main.live)].color;
  const top = `${8 + (1 - main.live) * 84}%`;

  return (
    <div className={cn("relative", className)}>
      <div className="relative size-full overflow-hidden rounded-md border border-[var(--line)] bg-ink-900/50">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.38" />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line key={g} x1="0" x2={W} y1={g} y2={g} stroke="rgb(170 176 196)" strokeOpacity="0.1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
          {Array.from({ length: 6 }, (_, i) => {
            const x = i * 12 - ((k0 + frac) % 12); // vertical grid scrolls with the data
            return <line key={i} x1={x} x2={x} y1="0" y2={H} stroke="rgb(170 176 196)" strokeOpacity="0.06" vectorEffect="non-scaling-stroke" />;
          })}
          {other && <path d={other.line} fill="none" stroke="var(--color-chart-low)" strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" />}
          <path d={main.area} fill={`url(#${gid})`} />
          <path d={main.line} fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 4px rgb(91 140 255 / 0.8))" }} />
        </svg>
        {label && <span className="absolute left-2 top-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-fg-subtle">{label}</span>}
      </div>
      {/* the live tip: a dot on the line and a price tag */}
      {tag && (
        <>
          <span aria-hidden className="absolute right-[-3px] size-[7px] -translate-y-1/2 rounded-full" style={{ top, background: color, boxShadow: `0 0 10px 2px ${color}` }} />
          <span
            className="absolute right-1.5 -translate-y-1/2 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
            style={{ top, color, borderColor: color, background: "rgb(8 12 24 / 0.85)" }}
          >
            {share(main.live).toFixed(1)}% <span className="opacity-80">{up ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}</span>
          </span>
        </>
      )}
    </div>
  );
}

function Volume({ t, tick, reduce, className }: { t: number; tick: number; reduce: boolean; className?: string }) {
  const { k0, frac } = scrollOf(t);
  const W = POINTS - 1;
  return (
    <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" className={cn("w-full overflow-hidden", className)} aria-hidden>
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

/** Just the chart and the volume bars, no text: for small spots such as the scroll story's document. */
export function LiveMini({ className }: { className?: string }) {
  const reduce = usePrefersReducedMotion();
  const { t, tick, ref } = useLiveClock(reduce);
  return (
    <div ref={ref} aria-hidden className={cn("flex size-full flex-col gap-1.5", className)}>
      <Chart t={t} tick={tick} reduce={reduce} label={null} tag={false} className="min-h-0 flex-1" />
      <Volume t={t} tick={tick} reduce={reduce} className="h-[22%] shrink-0" />
    </div>
  );
}

export type LivePanelOptions = {
  /** Title bar text. */
  title?: string;
  /** Names of the two running counters. */
  tiles?: [string, string];
  /** The sentence feed column (beside the chart on wide screens, below on phones). */
  feed?: boolean;
  /** Draw a second, independent line (e.g. a draft against its rewrite) and name both. */
  compare?: [string, string];
  /** Extra chip in the title bar. */
  note?: ReactNode;
};

function Live({ reduce, clock, title = "AI-Writing Risk Report", tiles = ["Sentences", "Marked"], feed = true, compare, note }: { reduce: boolean; clock: Clock } & LivePanelOptions) {
  const { t, tick, ref } = clock;
  const sent = Math.floor((t / 1000) * SENTENCES_PER_SECOND);
  const marked = Math.floor(sent * 0.41);
  const rate = reduce ? 214 : 190 + Math.floor(rnd(tick) * 70);

  return (
    <div ref={ref} className="glass-strong noise relative overflow-hidden rounded-2xl">
      <div aria-hidden className="absolute -right-16 -top-20 size-56 rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 -left-10 size-56 rounded-full bg-chart-low/15 blur-3xl" />

      {/* title bar */}
      <div className="relative flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
          <FileText className="size-3.5" />
        </span>
        <span className="truncate text-[12.5px] font-medium">{title}</span>
        {note}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          Live
        </span>
      </div>

      <div className={cn("relative grid gap-4 p-4 sm:gap-5 sm:p-5", feed && "sm:grid-cols-[1fr_228px] sm:pb-12")}>
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <Tile label={tiles[0]}>{num(184_000 + sent)}</Tile>
            <Tile label={tiles[1]} className="text-[#7ea4ff]">{num(75_400 + marked)}</Tile>
          </div>
          <div className="mt-3">
            <Chart t={t} tick={tick} reduce={reduce} second={!!compare} label={compare ? null : "Flagged share"} className="h-[96px] sm:h-[116px]" />
            <Volume t={t} tick={tick} reduce={reduce} className="mt-1.5 h-[40px] sm:h-[48px]" />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-fg-subtle">
            {compare ? (
              <>
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-chart-low" /> {compare[0]}</span>
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-accent" /> {compare[1]}</span>
              </>
            ) : (
              (["low", "medium", "high"] as const).map((l) => (
                <span key={l} className="flex items-center gap-1">
                  <span className={cn("size-1.5 rounded-full", LEVEL[l].dot)} /> {LEVEL[l].label}
                </span>
              ))
            )}
            <span className="ml-auto font-mono tabular-nums">{pad(rate, 3)} sent/s</span>
          </div>
        </div>

        {/* sentence feed */}
        {feed && (
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
        )}
      </div>
    </div>
  );
}

/**
 * The ticker on a stage: the report itself is flat (turning text with a 3D rig
 * makes it soft), and only the glass plates behind it lean toward the pointer.
 * `chips` adds the two floating cards beside the panel; `center` puts the
 * panel in the middle of a taller stage instead of at the top.
 */
export function LiveStage({
  className,
  chips = false,
  center = false,
  tilt = 9,
  ...panel
}: { className?: string; chips?: boolean; center?: boolean; tilt?: number } & LivePanelOptions) {
  const reduce = usePrefersReducedMotion();
  const clock = useLiveClock(reduce);
  const sent = Math.floor((clock.t / 1000) * SENTENCES_PER_SECOND) + 184_000;
  let high = sent;
  while (levelOf(high) !== "high") high--;
  return (
    <DepthStage
      className={cn("relative w-full", className)}
      tilt={tilt}
      overlay={
        <div className={cn("absolute inset-0 z-10", center && "flex flex-col justify-center")}>
          <div className="sm:mx-[2%]">
            <Live reduce={reduce} clock={clock} {...panel} />
          </div>
          {chips && (
            <>
              <div className="absolute -bottom-1 left-[calc(2%+24px)] hidden sm:block">
                <div className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-medium">
                  <Download className="size-3.5 text-accent" /> PDF download
                </div>
              </div>
              <div className="absolute -bottom-2 right-1 hidden sm:block">
                <div className="glass-strong rounded-xl p-3 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.8),0_0_30px_-8px_rgb(63_123_255/0.35)]">
                  <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#7ea4ff]">
                    <span className="size-1.5 rounded-full bg-chart-high shadow-[0_0_8px_2px_rgb(63_123_255/0.6)]" /> Latest high-risk sentence
                  </p>
                  <p className="mt-1.5 font-mono text-[20px] font-semibold leading-none tabular-nums">#{high}</p>
                  <p className="mt-1 text-[11px] text-fg-muted">Paragraph {Math.floor(high / 12)} · marked to look at again</p>
                </div>
              </div>
            </>
          )}
        </div>
      }
    >
      <DepthLayer depth={-70} className="inset-x-[-1%] bottom-[-2%] top-[4%] hidden rotate-[-3deg] sm:block">
        <div className="glass size-full rounded-3xl opacity-60" />
      </DepthLayer>
      <DepthLayer depth={-30} className="inset-x-[0.5%] inset-y-[-1%]">
        <div className="glass-strong noise relative size-full overflow-hidden rounded-3xl">
          <div aria-hidden className="absolute -right-16 -top-20 size-64 rounded-full bg-accent/25 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 -left-10 size-64 rounded-full bg-chart-low/15 blur-3xl" />
          <div aria-hidden className="absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(70%_70%_at_50%_40%,black,transparent)]" />
        </div>
      </DepthLayer>
    </DepthStage>
  );
}
