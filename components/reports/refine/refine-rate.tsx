"use client";
import { useEffect, useRef } from "react";
import { SCORE_BANDS } from "@/lib/auto-report/scan-script";
import { cn } from "@/lib/utils";
import { REFINE_POINT_MS, type RefineMeter } from "./refine-meter";

/**
 * The right-hand panel of the live rewrite, in blue and purple: the report's own AI score (blue) against the rate
 * as the rewrite goes (purple), a chart of the two, and counters. On a real order the purple rate stays on the
 * report's score until the detector has re-checked the rewritten text, then steps to each round's real score
 * (`basis` "pending", then "rechecked"): no estimate is ever shown. The design previews show the projection instead
 * (the report's score with the rewritten sentences no longer counted), labelled as one.
 */

const BLUE = "91,140,255";
const INDIGO = "118,124,255";
const PURPLE = "155,123,255";
const LILAC = "205,190,255";
const GRID = "170,176,196";
const LABEL = "154,163,184";
const rgba = (c: string, a: number) => `rgba(${c},${a})`;
const pct = (v: number, digits = 1) => (v * 100).toFixed(digits);

/** What the purple rate is: the projection (design previews), the report's score until a real score is in, a live score of the text so far, or a re-checked score. */
export type RateBasis = "projected" | "pending" | "live" | "rechecked";

export interface RefineCounts {
  /** Suggestions typed so far, of all sentences being rewritten. */
  rewritten: number;
  total: number;
  kept: number;
  /** Counted sentences still in the text as written. */
  counted: number;
  /** How far through the whole run, 0 to 1. */
  progress: number;
}

export function RefineRatePanel({ meter, ready, final, basis = "projected", original, counts, compact, reduce = false }: { meter: RefineMeter; ready: boolean; final: boolean; basis?: RateBasis; original: number; counts: RefineCounts; compact?: boolean; reduce?: boolean }) {
  const real = basis === "rechecked";
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#b9a8ff]">AI rate · {real ? "re-checked" : basis === "live" ? "live check" : basis === "pending" ? "re-check pending" : "projected"}</p>
          <Readout meter={meter} original={original} final={final} className="text-[26px]" unit="text-[14px]" deltaClass="text-[10px]" />
        </div>
        <div className="relative h-12 min-w-0 flex-1">
          <RefineChart meter={meter} compact reduce={reduce} className="absolute inset-0" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-[10px] tabular-nums">
          <span className="rounded-full border border-[#5b8cff]/40 bg-[#5b8cff]/10 px-2 py-0.5 text-[#a9c1ff]">was {pct(original, 0)}%</span>
          <span className="text-fg-subtle">
            {counts.rewritten}/{counts.total} rewritten
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
          <span className="refine-live-dot" aria-hidden /> AI rate{basis === "projected" ? ` · ${final ? "projected" : "refining"}` : ""}
          <span className="ml-auto whitespace-nowrap rounded-full border border-[#9b7bff]/45 bg-[#9b7bff]/12 px-2 py-0.5 text-[10px] tracking-wider text-[#cdbdff]">{real ? "Re-checked" : basis === "live" ? "Live check" : basis === "pending" ? "Before first check" : "Projected"}</span>
        </p>
        <Readout meter={meter} original={original} final={final} className="mt-2 text-[50px] tracking-tight" unit="ml-0.5 text-[22px]" deltaClass="text-[12px]" />
        <p className="mt-1 text-[11.5px] leading-snug text-fg-subtle">
          {real
            ? "your text with every suggestion in place, run through the detector again"
            : basis === "live"
              ? "your text with the suggestions so far in place, run through the detector: a real score, and it can wobble"
              : basis === "pending"
                ? "your report's score: it moves as soon as the detector has scored the text with the first suggestions in"
                : ready
                  ? "estimate: the report's score with the rewritten sentences no longer counted"
                  : "starts on your report's AI score"}
        </p>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10.5px]">
        <span className="flex items-center gap-1.5 text-[#a9c1ff]">
          <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-[#5b8cff]" /> Original {pct(original, 0)}%
        </span>
        <span className="flex items-center gap-1.5 text-[#cdbdff]">
          <span aria-hidden className="h-[3px] w-4 rounded-full bg-gradient-to-r from-[#5b8cff] to-[#9b7bff]" /> Refined
        </span>
      </div>

      <div className="relative min-h-[190px] flex-1 overflow-hidden rounded-xl border border-[#9b7bff]/20 bg-[radial-gradient(80%_60%_at_100%_100%,rgb(155_123_255/0.10),transparent_70%)] bg-ink-950/60">
        <RefineChart meter={meter} reduce={reduce} className="absolute inset-0" />
        {!ready && <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[10.5px] text-fg-subtle">warming up<span className="scan-ellipsis" /></p>}
      </div>

      <dl className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
        <Cell k="Rewritten" v={`${counts.rewritten}/${counts.total}`} tone="text-[#cdbdff]" />
        <Cell k="Kept" v={String(counts.kept)} />
        <Cell k="Counted" v={String(counts.counted)} tone="text-[#a9c1ff]" />
        <Cell k="Change" v={<DropValue meter={meter} original={original} />} tone="text-[#cdbdff]" />
        <Cell k="Left" v={String(Math.max(0, counts.total - counts.rewritten - counts.kept))} />
        <Cell k="Progress" v={`${Math.round(counts.progress * 100)}%`} />
      </dl>
      <p className="text-[10.5px] leading-snug text-fg-subtle">
        {real
          ? "The real score of the rewritten text, from the same detector as your report."
          : basis === "live" || basis === "pending"
            ? "No estimate: every figure is a real score from the same detector, taken on the text as rewritten so far, and the last one is the full re-check."
            : "An estimate until the rewritten text is re-checked by the detector at the end."}
      </p>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-[#9b7bff]/15 bg-white/[0.02] px-2 py-1.5">
      <dt className="text-[9px] uppercase tracking-[0.14em] text-fg-subtle">{k}</dt>
      <dd className={cn("mt-0.5 text-[13.5px] tabular-nums text-fg", tone)}>{v}</dd>
    </div>
  );
}

/** Points the rate has moved from the report's score so far (− down, + up), written straight to the page. */
function DropValue({ meter, original }: { meter: RefineMeter; original: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let last = 0;
    const paint = () => {
      const now = performance.now();
      if (!el.current || meter.cur === null || (now - last < 150 && !meter.settled)) return;
      last = now;
      const d = original - meter.cur;
      el.current.textContent = `${d < -0.0005 ? "+" : "−"}${pct(Math.abs(d))}`;
    };
    paint();
    return meter.subscribe(paint);
  }, [meter, original]);
  return <span ref={el}>−0.0</span>;
}

/** The rate, with how far it is below (or above) the report's score. */
function Readout({ meter, original, final, className, unit, deltaClass }: { meter: RefineMeter; original: number; final: boolean; className?: string; unit?: string; deltaClass?: string }) {
  const num = useRef<HTMLSpanElement>(null);
  const delta = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let last = 0;
    const paint = () => {
      const now = performance.now();
      if (!meter.settled && now - last < 80) return;
      last = now;
      if (!num.current || !delta.current) return;
      const v = meter.cur ?? original;
      num.current.textContent = meter.settled ? pct(v, 0) : pct(v);
      const d = (original - v) * 100;
      delta.current.textContent = d > 0.05 ? `▼${d.toFixed(1)}` : d < -0.05 ? `▲${(-d).toFixed(1)}` : "";
    };
    paint();
    return meter.subscribe(paint);
  }, [meter, original]);
  return (
    <div className={cn("flex items-baseline gap-2", final && "scan-rate-land")}>
      <p className={cn("refine-rate-num font-mono font-semibold leading-none tabular-nums", className)}>
        <span ref={num}>{pct(original)}</span>
        <span className={cn("text-[#b9a8ff]/70", unit)}>%</span>
      </p>
      <span ref={delta} className={cn("font-mono tabular-nums text-[#b9a8ff]", deltaClass)} />
    </div>
  );
}

/**
 * The chart: the report's score as a dashed blue level, the rate as a purple line that scrolls left as it ticks and
 * steps at each rewritten sentence (projection) or each re-checked round (real order), the gap between them filled,
 * and a flash with the size of each step. The scale starts at zero so the fall is shown at its real size. With reduced motion it holds still: the two
 * levels and the gap between them, stepping down at each drop, with nothing scrolling or pulsing.
 */
export function RefineChart({ meter, compact, reduce = false, className }: { meter: RefineMeter; compact?: boolean; reduce?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const font = getComputedStyle(cv).fontFamily || "monospace";
    let w = 0;
    let h = 0;
    const size = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!w || !h || cv.offsetParent === null) return;
      const now = meter.settledAt ?? performance.now();
      const axis = compact ? 0 : 46;
      const x0 = compact ? 0 : 6;
      const x1 = w - axis - (compact ? 6 : 10);
      const y0 = compact ? 5 : 16;
      const y1 = h - (compact ? 5 : 14);
      const dx = compact ? 1.6 : 2.4;
      const xAt = (t: number) => x1 - ((now - t) / REFINE_POINT_MS) * dx;
      ctx.clearRect(0, 0, w, h);

      const original = meter.cur === null ? null : meter.original;
      // A re-check can score above the report: the scale makes room for it.
      const top = Math.min(1, Math.max(0.1, Math.max(original ?? 0.5, meter.target) * 1.18 + 0.04));
      const yAt = (v: number) => y1 - (Math.max(0, v) / top) * (y1 - y0);

      // Grid and band lines.
      ctx.lineWidth = 1;
      ctx.font = `10px ${font}`;
      ctx.textBaseline = "middle";
      const step = top > 0.6 ? 0.2 : top > 0.3 ? 0.1 : 0.05;
      for (let v = 0; v <= top + 1e-9; v += step) {
        const y = Math.round(yAt(v)) + 0.5;
        ctx.strokeStyle = rgba(GRID, compact ? 0.06 : 0.09);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        if (!compact) {
          ctx.fillStyle = rgba(LABEL, 0.65);
          ctx.fillText(`${Math.round(v * 100)}`, x1 + 8, y);
        }
      }
      if (!compact) {
        ctx.setLineDash([3, 4]);
        for (const [v, label] of [
          [SCORE_BANDS.moderate, "moderate"],
          [SCORE_BANDS.elevated, "elevated"],
        ] as const) {
          if (v > top) continue;
          const y = Math.round(yAt(v)) + 0.5;
          ctx.strokeStyle = rgba(INDIGO, 0.22);
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
          ctx.fillStyle = rgba(INDIGO, 0.55);
          if (original === null || Math.abs(yAt(original) - y) > 12) ctx.fillText(`${Math.round(v * 100)}% ${label}`, x0 + 4, y - 7);
        }
        ctx.setLineDash([]);
        // Time lines every 2 s, scrolling past fast.
        for (let t = Math.floor(now / 2_000) * 2_000; !reduce && xAt(t) > x0; t -= 2_000) {
          const x = Math.round(xAt(t)) + 0.5;
          ctx.strokeStyle = rgba(GRID, 0.05);
          ctx.beginPath();
          ctx.moveTo(x, y0 - 8);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }

      if (original === null || meter.cur === null) {
        ctx.strokeStyle = rgba(PURPLE, 0.25);
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(x0, (y0 + y1) / 2);
        ctx.lineTo(x1, (y0 + y1) / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const cur = meter.cur;
      const oy = yAt(original);
      const pts = reduce ? [] : meter.points.filter((p) => xAt(p.t) >= x0 - dx);

      // The refined line (with reduced motion, just its level), and the gap between it and the original level.
      {
        const line = new Path2D();
        pts.forEach((p, i) => (i ? line.lineTo(xAt(p.t), yAt(p.v)) : line.moveTo(Math.max(x0, xAt(p.t)), yAt(p.v))));
        if (!pts.length) line.moveTo(x0, yAt(cur));
        line.lineTo(x1, yAt(cur));
        const firstX = pts.length ? Math.max(x0, xAt(pts[0].t)) : x0;
        const gap = new Path2D(line);
        gap.lineTo(x1, oy);
        gap.lineTo(firstX, oy);
        gap.closePath();
        const gapFill = ctx.createLinearGradient(0, oy, 0, yAt(cur));
        gapFill.addColorStop(0, rgba(BLUE, 0.06));
        gapFill.addColorStop(1, rgba(PURPLE, compact ? 0.32 : 0.36));
        ctx.fillStyle = gapFill;
        ctx.fill(gap);
        const under = new Path2D(line);
        under.lineTo(x1, y1);
        under.lineTo(firstX, y1);
        under.closePath();
        const underFill = ctx.createLinearGradient(0, y0, 0, y1);
        underFill.addColorStop(0, rgba(INDIGO, 0.1));
        underFill.addColorStop(1, rgba(INDIGO, 0));
        ctx.fillStyle = underFill;
        ctx.fill(under);

        const stroke = ctx.createLinearGradient(x0, 0, x1, 0);
        stroke.addColorStop(0, rgba(BLUE, 0.7));
        stroke.addColorStop(1, rgba(PURPLE, 1));
        ctx.strokeStyle = stroke;
        ctx.lineWidth = compact ? 1.5 : 2;
        ctx.lineJoin = "round";
        ctx.shadowColor = rgba(PURPLE, 0.8);
        ctx.shadowBlur = compact ? 6 : 12;
        ctx.stroke(line);
        ctx.shadowBlur = 0;
      }

      // The report's own score: a dashed blue level right across.
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = rgba(BLUE, 0.85);
      ctx.lineWidth = compact ? 1 : 1.4;
      ctx.beginPath();
      ctx.moveTo(x0, Math.round(oy) + 0.5);
      ctx.lineTo(x1 + (compact ? 0 : 6), Math.round(oy) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      // Each drop: a flash where it happened and its size, rising and fading.
      if (!compact && !reduce) {
        for (const d of meter.drops) {
          const age = now - d.t;
          if (age > 1_600 || age < 0) continue;
          const x = xAt(d.t);
          if (x < x0) continue;
          const a = 1 - age / 1_600;
          ctx.strokeStyle = rgba(LILAC, 0.5 * a);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, yAt(Math.max(d.from, d.to)));
          ctx.lineTo(Math.round(x) + 0.5, y1);
          ctx.stroke();
          ctx.fillStyle = rgba(LILAC, a);
          ctx.font = `600 11px ${font}`;
          ctx.fillText(`${d.to <= d.from ? "▼" : "▲"}${pct(Math.abs(d.from - d.to))}`, Math.min(x1 - 42, x + 6), yAt(Math.max(d.from, d.to)) - 6 - age * 0.018);
        }
      }

      // Speed streaks behind the head while it falls.
      const hy = yAt(cur);
      const falling = meter.settled || reduce ? 0 : Math.max(0, meter.level - meter.target);
      if (falling > 0.002) {
        const s = Math.min(1, falling / 0.012);
        for (let k = 0; k < 4; k++) {
          const len = (compact ? 16 : 34) * s * (1 - k * 0.18);
          const off = (k - 1.5) * (compact ? 2.5 : 4);
          const grad = ctx.createLinearGradient(x1 - len, 0, x1, 0);
          grad.addColorStop(0, rgba(LILAC, 0));
          grad.addColorStop(1, rgba(LILAC, 0.55 * s));
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1 - len - 6, hy + off);
          ctx.lineTo(x1 - 6, hy + off);
          ctx.stroke();
        }
      }

      // Tags on the axis: the original in blue, the refined value in purple.
      if (!compact) {
        const tag = (v: number, y: number, c: string, digits: number) => {
          const text = `${pct(v, digits)}%`;
          ctx.font = `600 10px ${font}`;
          const tw = ctx.measureText(text).width + 10;
          ctx.fillStyle = rgba(c, 0.95);
          ctx.beginPath();
          ctx.roundRect(x1 + 4, y - 8, Math.max(tw, axis - 2), 16, 4);
          ctx.fill();
          ctx.fillStyle = "#0a0d16";
          ctx.fillText(text, x1 + 9, y + 0.5);
        };
        const ty = Math.max(8, Math.min(h - 8, hy));
        const oty = Math.abs(oy - ty) < 18 ? (oy < ty ? ty - 18 : ty + 18) : oy;
        tag(original, Math.max(8, Math.min(h - 8, oty)), BLUE, 0);
        tag(cur, ty, PURPLE, meter.settled ? 0 : 1);
      }

      if (!reduce && !meter.settled) {
        const phase = (now % 1_100) / 1_100;
        ctx.fillStyle = rgba(PURPLE, 0.4 * (1 - phase));
        ctx.beginPath();
        ctx.arc(x1, hy, 3 + phase * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f4f0ff";
      ctx.shadowColor = rgba(PURPLE, 1);
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x1, hy, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [meter, compact, reduce]);
  return <canvas ref={canvas} aria-hidden data-refine-chart className={cn("block h-full w-full font-mono", className)} />;
}
