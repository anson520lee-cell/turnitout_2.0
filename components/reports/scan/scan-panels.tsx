"use client";
import { useEffect, useRef } from "react";
import { Minus, X } from "lucide-react";
import { OVERALL_BANDS, bandFor, type LogLine, type LogTone } from "@/lib/auto-report/scan-script";
import type { Overall } from "@/lib/auto-report/stitch";
import { METER_POINT_MS, type RateMeter } from "./rate-meter";
import { cn } from "@/lib/utils";

export interface TermLine extends LogLine {
  id: number;
  t: string;
}

const TONE: Record<LogTone, string> = {
  dim: "text-fg-subtle",
  ok: "text-ok",
  warn: "text-warn",
  risk: "text-risk",
  info: "text-[#a9c1ff]",
  violet: "text-violet",
};

export type TermId = "reader" | "reviewer" | "agents";
export const TERMS: { id: TermId; title: string; dot: string; hint: string }[] = [
  { id: "reader", title: "reader.log", dot: "bg-cyan", hint: "Reading your text, word by word" },
  { id: "reviewer", title: "reviewer.log", dot: "bg-violet", hint: "The reviewer's ratings and reasons, sentence by sentence" },
  { id: "agents", title: "agents.log", dot: "bg-accent", hint: "Scan agents cross-checking sentences" },
];

/** One terminal window: title bar with minimise/close, a log that keeps to the newest lines, and an optional live last line. */
export function Terminal({
  title,
  dot,
  lines,
  live,
  onClose,
  onMinimise,
  minimised,
  className,
  bodyClassName,
}: {
  title: string;
  dot: string;
  lines: TermLine[];
  live?: React.ReactNode;
  onClose?: () => void;
  onMinimise?: () => void;
  minimised?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, live]);
  return (
    <div className={cn("scan-term flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--line-strong)] bg-ink-950/85 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.9)]", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-white/[0.03] px-3 py-1.5">
        <span className={cn("size-2 rounded-full shadow-[0_0_8px_currentColor]", dot)} aria-hidden />
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-fg-muted">{title}</span>
        <span className="scan-term-activity ml-1" aria-hidden />
        <span className="ml-auto flex items-center gap-1">
          {onMinimise && (
            <button type="button" onClick={onMinimise} className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-fg" aria-label={minimised ? `Expand ${title}` : `Minimise ${title}`}>
              <Minus className="size-3" />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-fg" aria-label={`Close ${title}`}>
              <X className="size-3" />
            </button>
          )}
        </span>
      </div>
      {!minimised && (
        <div ref={body} className={cn("scan-term-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 font-mono text-[11px] leading-[1.55]", bodyClassName)}>
          {lines.map((l, i) => (
            <p key={l.id} className={cn("break-words", TONE[l.tone], i === lines.length - 1 && !live && "scan-type")}>
              <span className="mr-2 text-fg-subtle/50">{l.t}</span>
              {l.text}
            </p>
          ))}
          {live}
        </div>
      )}
    </div>
  );
}

const bandText: Record<Overall, { label: string; cls: string }> = {
  low: { label: "Low", cls: "text-ok border-ok/40 bg-ok/10" },
  moderate: { label: "Moderate", cls: "text-warn border-warn/40 bg-warn/10" },
  elevated: { label: "Elevated", cls: "text-risk border-risk/40 bg-risk/10" },
};

/**
 * The live AI rate: a ticking number and a share-price style chart. The level
 * is the real running share of sentences flagged so far (see RateMeter); it
 * settles on the report's own figure at the end. Before the reviewer has
 * answered it shows that it is still waiting, not a number.
 */
export function RatePanel({
  meter,
  ready,
  final,
  estimate,
  scanned,
  total,
  high,
  medium,
  uncertain,
  compact,
}: {
  meter: RateMeter;
  ready: boolean;
  final: boolean;
  /** The real estimate now, for the band label. */
  estimate: number;
  scanned: number;
  total: number;
  high: number;
  medium: number;
  uncertain: number;
  compact?: boolean;
}) {
  const band = bandFor(estimate);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-fg-subtle">AI rate</p>
          <Readout meter={meter} final={final} className="text-[26px]" unit="text-[14px]" deltaClass="text-[10px]" />
        </div>
        <div className="relative h-12 min-w-0 flex-1">
          <TickChart meter={meter} compact className="absolute inset-0" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {ready && <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", bandText[band].cls)}>{bandText[band].label}</span>}
          <p className="font-mono text-[10px] tabular-nums text-fg-subtle">
            {scanned}/{total} · <span className="text-risk">{high}H</span> <span className="text-warn">{medium}M</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
          <span className="scan-live-dot" aria-hidden /> AI rate · {final ? "final" : "live"}
          {ready && <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px] tracking-wider", bandText[band].cls)}>{bandText[band].label}</span>}
        </p>
        <Readout meter={meter} final={final} className="mt-2 text-[50px] tracking-tight" unit="ml-0.5 text-[22px]" deltaClass="text-[12px]" />
        <p className="mt-1 text-[11.5px] leading-snug text-fg-subtle">
          {final ? "share of sentences flagged · the report's figure" : ready ? "live estimate · share of sentences flagged so far" : "waiting for the reviewer's first ratings"}
        </p>
      </div>

      <div className="relative min-h-[190px] flex-1 overflow-hidden rounded-xl border border-[var(--line)] bg-ink-950/60">
        <TickChart meter={meter} className="absolute inset-0" />
        {!ready && <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[10.5px] text-fg-subtle">awaiting first ratings<span className="scan-ellipsis" /></p>}
      </div>
      <Ohl meter={meter} />

      <dl className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
        <Cell k="Scanned" v={`${scanned}/${total}`} />
        <Cell k="High" v={String(high)} tone="text-risk" />
        <Cell k="Medium" v={String(medium)} tone="text-warn" />
        <Cell k="Uncertain" v={String(uncertain)} tone="text-violet" />
        <Cell k="Clear" v={String(Math.max(0, scanned - high - medium - uncertain))} tone="text-ok" />
        <Cell k="Progress" v={`${total ? Math.round((scanned / total) * 100) : 0}%`} />
      </dl>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-2 py-1.5">
      <dt className="text-[9px] uppercase tracking-[0.14em] text-fg-subtle">{k}</dt>
      <dd className={cn("mt-0.5 text-[13.5px] tabular-nums text-fg", tone)}>{v}</dd>
    </div>
  );
}

/** The number, written straight to the page as the meter ticks, with its change over the last 3 seconds. */
function Readout({ meter, final, className, unit, deltaClass }: { meter: RateMeter; final: boolean; className?: string; unit?: string; deltaClass?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const delta = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let last = 0;
    let lastDir = "flat";
    const paint = () => {
      const now = performance.now();
      if (!meter.settled && now - last < 120) return;
      last = now;
      if (meter.cur === null || !num.current || !delta.current || !wrap.current) return;
      if (meter.settled) {
        num.current.textContent = String(Math.round(meter.cur * 100));
        delta.current.textContent = "";
        wrap.current.dataset.dir = "flat";
        return;
      }
      num.current.textContent = (meter.cur * 100).toFixed(1);
      const before = meter.ago(3_000, now);
      const d = before === null ? 0 : (meter.cur - before) * 100;
      const dir = d > 0.05 ? "up" : d < -0.05 ? "down" : "flat";
      delta.current.textContent = `${d >= 0 ? "▲" : "▼"}${Math.abs(d).toFixed(1)}`;
      if (dir !== lastDir) {
        wrap.current.dataset.dir = dir;
        lastDir = dir;
      }
    };
    paint();
    return meter.subscribe(paint);
  }, [meter]);
  return (
    <div ref={wrap} data-dir="flat" className={cn("scan-readout flex items-baseline gap-2", final && "scan-rate-land")}>
      <p className={cn("scan-rate-num font-mono font-semibold leading-none tabular-nums text-fg", className)}>
        <span ref={num}>--.-</span>
        <span className={cn("text-fg-subtle", unit)}>%</span>
      </p>
      <span ref={delta} className={cn("scan-delta font-mono tabular-nums", deltaClass)} />
    </div>
  );
}

/** Open, high and low of the real estimate so far, like a share price's day range. */
function Ohl({ meter }: { meter: RateMeter }) {
  const el = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let last = 0;
    const paint = () => {
      const now = performance.now();
      if (!el.current || meter.open === null || (now - last < 400 && !meter.settled)) return;
      last = now;
      const f = (v: number) => (v * 100).toFixed(1);
      el.current.textContent = `O ${f(meter.open)}  H ${f(meter.hi)}  L ${f(meter.lo)}`;
    };
    paint();
    return meter.subscribe(paint);
  }, [meter]);
  return <p ref={el} className="-mt-1 font-mono text-[10px] tracking-wide text-fg-subtle tabular-nums" aria-hidden>O --  H --  L --</p>;
}

const C = { accent: "91,140,255", cyan: "95,216,245", ok: "79,209,165", warn: "245,195,91", risk: "255,122,138", label: "154,163,184" };
const rgba = (c: string, a: number) => `rgba(${c},${a})`;
const STEPS = [0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2];

/**
 * A share-price style tick chart of the live AI rate: a line that scrolls left
 * as it ticks, its last value tagged on the right axis, and volume bars for how
 * much it moved. Drawn on a canvas, crisp on high-density screens.
 */
export function TickChart({ meter, compact, className }: { meter: RateMeter; compact?: boolean; className?: string }) {
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
    const scale = { lo: 0, hi: 1, set: false };
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!w || !h || cv.offsetParent === null) return;
      const now = meter.settledAt ?? performance.now();
      const axis = compact ? 0 : 44;
      const volH = compact ? 0 : Math.round(h * 0.16);
      const x0 = compact ? 0 : 6;
      const x1 = w - axis - (compact ? 6 : 10);
      const y0 = compact ? 6 : 12;
      const y1 = h - volH - (compact ? 6 : 16);
      const dx = compact ? 2.2 : 3.2;
      const xAt = (t: number) => x1 - ((now - t) / METER_POINT_MS) * dx;
      ctx.clearRect(0, 0, w, h);

      const pts = meter.points.filter((p) => xAt(p.t) >= x0 - dx);
      const cur = meter.cur;

      // Scale follows the visible values, eased so it doesn't jump.
      let lo = cur ?? 0.3;
      let hi = cur ?? 0.4;
      for (const p of pts) {
        lo = Math.min(lo, p.v);
        hi = Math.max(hi, p.v);
      }
      const minRange = compact ? 0.06 : 0.04;
      if (hi - lo < minRange) {
        const mid = (hi + lo) / 2;
        lo = mid - minRange / 2;
        hi = mid + minRange / 2;
      }
      const pad = (hi - lo) * 0.18;
      lo = Math.max(-0.02, lo - pad);
      hi = Math.min(1.02, hi + pad);
      if (!scale.set) Object.assign(scale, { lo, hi, set: cur !== null });
      else {
        scale.lo += (lo - scale.lo) * 0.08;
        scale.hi += (hi - scale.hi) * 0.08;
      }
      const yAt = (v: number) => y1 - ((v - scale.lo) / Math.max(1e-6, scale.hi - scale.lo)) * (y1 - y0);

      // Grid: price levels on the right, time lines every 5 s scrolling with the chart.
      const range = scale.hi - scale.lo;
      const step = STEPS.find((s) => range / s <= (compact ? 3 : 5)) ?? 0.25;
      ctx.lineWidth = 1;
      ctx.font = `10px ${font}`;
      ctx.textBaseline = "middle";
      for (let v = Math.ceil(scale.lo / step) * step; v <= scale.hi; v += step) {
        const y = Math.round(yAt(v)) + 0.5;
        ctx.strokeStyle = rgba(C.accent, compact ? 0.06 : 0.09);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        if (!compact) {
          ctx.fillStyle = rgba(C.label, 0.7);
          ctx.fillText(`${(v * 100).toFixed(step < 0.01 ? 2 : step < 0.1 ? 1 : 0)}`, x1 + 8, y);
        }
      }
      if (!compact) {
        for (let t = Math.floor(now / 5_000) * 5_000; xAt(t) > x0; t -= 5_000) {
          const x = Math.round(xAt(t)) + 0.5;
          ctx.strokeStyle = rgba(C.accent, 0.05);
          ctx.beginPath();
          ctx.moveTo(x, y0 - 6);
          ctx.lineTo(x, h - 2);
          ctx.stroke();
        }
        // The report's band lines, when in view.
        ctx.setLineDash([3, 4]);
        for (const [v, c, label] of [
          [OVERALL_BANDS.moderate, C.warn, "moderate"],
          [OVERALL_BANDS.elevated, C.risk, "elevated"],
        ] as const) {
          if (v < scale.lo || v > scale.hi) continue;
          const y = Math.round(yAt(v)) + 0.5;
          ctx.strokeStyle = rgba(c, 0.45);
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
          ctx.fillStyle = rgba(c, 0.75);
          ctx.fillText(`${Math.round(v * 100)}% ${label}`, x0 + 4, y - 7);
        }
        ctx.setLineDash([]);
      }

      if (cur === null || !pts.length) {
        ctx.strokeStyle = rgba(C.accent, 0.25);
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(x0, (y0 + y1) / 2);
        ctx.lineTo(x1, (y0 + y1) / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }

      // Volume: how much the rate moved in each tick, red when it went up, green when down.
      if (volH) {
        const maxVol = Math.max(0.002, ...pts.map((p) => p.vol));
        const bw = Math.max(1, dx - 1);
        for (const p of pts) {
          const bh = Math.max(1, (p.vol / maxVol) * (volH - 2));
          ctx.fillStyle = rgba(p.up ? C.risk : C.ok, 0.5);
          ctx.fillRect(xAt(p.t) - bw / 2, h - 2 - bh, bw, bh);
        }
      }

      // Area and line.
      const line = new Path2D();
      pts.forEach((p, i) => (i ? line.lineTo(xAt(p.t), yAt(p.v)) : line.moveTo(xAt(p.t), yAt(p.v))));
      line.lineTo(x1, yAt(cur));
      const area = new Path2D(line);
      area.lineTo(x1, y1);
      area.lineTo(xAt(pts[0].t), y1);
      area.closePath();
      const fill = ctx.createLinearGradient(0, y0, 0, y1);
      fill.addColorStop(0, rgba(C.accent, compact ? 0.28 : 0.32));
      fill.addColorStop(1, rgba(C.accent, 0));
      ctx.fillStyle = fill;
      ctx.fill(area);
      const stroke = ctx.createLinearGradient(x0, 0, x1, 0);
      stroke.addColorStop(0, rgba(C.accent, 0.55));
      stroke.addColorStop(1, rgba(C.cyan, 1));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = compact ? 1.4 : 1.6;
      ctx.lineJoin = "round";
      ctx.shadowColor = rgba(C.cyan, 0.7);
      ctx.shadowBlur = compact ? 6 : 10;
      ctx.stroke(line);
      ctx.shadowBlur = 0;

      // Last value: dashed level, a pulsing dot, and a tag on the axis.
      const hy = yAt(cur);
      const before = meter.ago(3_000, now);
      const dir = meter.settled ? C.accent : before !== null && cur > before + 0.0005 ? C.risk : before !== null && cur < before - 0.0005 ? C.ok : C.accent;
      if (!compact) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = rgba(dir, 0.45);
        ctx.beginPath();
        ctx.moveTo(x0, Math.round(hy) + 0.5);
        ctx.lineTo(x1 + 6, Math.round(hy) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        const tag = `${(cur * 100).toFixed(meter.settled ? 0 : 1)}%`;
        const tw = ctx.measureText(tag).width + 10;
        const ty = Math.max(8, Math.min(h - volH - 8, hy));
        ctx.fillStyle = rgba(dir, 0.95);
        ctx.beginPath();
        ctx.roundRect(x1 + 4, ty - 8, Math.max(tw, axis - 2), 16, 4);
        ctx.fill();
        ctx.fillStyle = "#0a0d16";
        ctx.font = `600 10px ${font}`;
        ctx.fillText(tag, x1 + 9, ty + 0.5);
      }
      const phase = ((now % 1_400) / 1_400) * (meter.settled ? 0 : 1);
      ctx.fillStyle = rgba(C.cyan, 0.35 * (1 - phase));
      ctx.beginPath();
      ctx.arc(x1, hy, 3 + phase * 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e9fbff";
      ctx.shadowColor = rgba(C.cyan, 1);
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x1, hy, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [meter, compact]);
  return <canvas ref={canvas} aria-hidden className={cn("block h-full w-full font-mono", className)} />;
}
