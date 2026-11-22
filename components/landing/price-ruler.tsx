"use client";
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { formatCredits, reportPrice, reportPricing } from "@/config/pricing";
import { freeReport } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * Price by length, drawn as a thin line: what a report costs for every text
 * length the service takes (500 to 100,000 characters, on a log scale). The
 * pointer reads the line like a lens reads the essay: move along it and the
 * marker follows with the length and the price; press or drag to set it, and
 * it stays. It is a real range input underneath, so arrow keys, Home/End and
 * screen readers work. All numbers come from config/pricing.ts.
 */

const MIN = reportPricing.minChars;
const MAX = reportPricing.maxChars;
const STEPS = 1000;
const W = 600;
const H = 150;
const PAD = { l: 8, r: 8, t: 14, b: 26 };

const charsAt = (v: number) => {
  const c = MIN * Math.pow(MAX / MIN, v / STEPS);
  return Math.min(MAX, Math.max(MIN, Math.round(c / 100) * 100));
};
const valueOf = (chars: number) => Math.round((STEPS * Math.log(chars / MIN)) / Math.log(MAX / MIN));
const x = (v: number) => PAD.l + ((W - PAD.l - PAD.r) * v) / STEPS;
const maxPrice = reportPrice(MAX);
const y = (cents: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - cents / maxPrice);
const TICKS = [500, 2000, 4000, 8000, 20000, 50000, 100000];
// labels dropped on narrow screens, where they would touch their neighbours
const MINOR = new Set([2000, 50000]);
const fmt = (n: number) => n.toLocaleString("en-HK");
const short = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n));

export function PriceRuler({ className }: { className?: string }) {
  const [value, setValue] = useState(() => valueOf(8000));
  const [preview, setPreview] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  // the line itself: price for every step along the scale
  const path = useMemo(() => {
    let d = "";
    let prev = -1;
    for (let v = 0; v <= STEPS; v += 2) {
      const p = reportPrice(charsAt(v));
      if (prev < 0) d += `M${x(v).toFixed(1)} ${y(p).toFixed(1)}`;
      else if (p !== prev) d += `H${x(v).toFixed(1)}V${y(p).toFixed(1)}`;
      prev = p;
    }
    return `${d}H${x(STEPS).toFixed(1)}`;
  }, []);

  const shown = preview ?? value;
  const chars = charsAt(shown);
  const price = reportPrice(chars);
  const free = chars <= freeReport.maxChars;

  const readPointer = (e: PointerEvent<HTMLInputElement>) => {
    if (e.pointerType !== "mouse" || !svg.current) return;
    const b = svg.current.getBoundingClientRect();
    const f = (e.clientX - b.left - (PAD.l / W) * b.width) / (b.width * ((W - PAD.l - PAD.r) / W));
    setPreview(Math.round(Math.min(1, Math.max(0, f)) * STEPS));
  };

  return (
    <div className={cn("ruler glass rounded-[20px] p-6 sm:p-7", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">Price by length</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">1 credit = HK$1</p>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="text-[15px] text-fg-muted">
          <span className="ruler-num text-fg">{fmt(chars)}</span> characters
        </p>
        <p className="text-right">
          <span className="ruler-num text-[30px] font-semibold tracking-tight text-fg">{formatCredits(price)}</span>
          <span className="block text-[12px] text-fg-subtle">{free ? "or free, as your daily report" : `HK$${fmt(price / 100)}`}</span>
        </p>
      </div>
      <div className="ruler-plot relative mt-4" style={{ "--mx": `${(x(shown) / W) * 100}%`, "--my": `${(y(price) / H) * 100}%` } as CSSProperties}>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[150px] w-full overflow-visible" aria-hidden>
          {/* the daily free report's range */}
          <rect x={x(0)} y={PAD.t} width={x(valueOf(freeReport.maxChars)) - x(0)} height={H - PAD.t - PAD.b} className="ruler-free" />
          {TICKS.map((t) => (
            <line key={t} x1={x(valueOf(t))} x2={x(valueOf(t))} y1={H - PAD.b} y2={H - PAD.b + 5} className="ruler-tick" />
          ))}
          <line x1={x(0)} x2={x(STEPS)} y1={H - PAD.b} y2={H - PAD.b} className="ruler-axis" />
          <path d={path} pathLength={100} className="ruler-line" vectorEffect="non-scaling-stroke" />
          <line x1={x(shown)} x2={x(shown)} y1={PAD.t - 6} y2={H - PAD.b} className="ruler-cursor" vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden className="ruler-dot" />
        <div aria-hidden className="ruler-labels">
          {TICKS.map((t) => (
            <span key={t} data-minor={MINOR.has(t) || undefined} style={{ left: `${(x(valueOf(t)) / W) * 100}%` }}>
              {short(t)}
            </span>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={STEPS}
          step={1}
          value={value}
          aria-label="Text length"
          aria-valuetext={`${fmt(chars)} characters, ${formatCredits(price)}`}
          className="ruler-input"
          onChange={(e) => {
            setPreview(null);
            setValue(Number(e.target.value));
          }}
          onPointerMove={readPointer}
          onPointerLeave={() => setPreview(null)}
          onPointerDown={() => setPreview(null)}
        />
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-fg-subtle">
        {fmt(reportPricing.blockChars)} characters per credit, minimum {formatCredits(reportPricing.minimum)}. In each {fmt(reportPricing.cycleChars)} characters only the first {fmt(reportPricing.chargedChars)} are charged. Your first report each day, up to {fmt(freeReport.maxChars)} characters, is free.
      </p>
    </div>
  );
}
