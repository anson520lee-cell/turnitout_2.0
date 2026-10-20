"use client";
import type { CSSProperties } from "react";
import { SCORE_BANDS, aiScore, overallFor } from "@/lib/auto-report/stitch";
import { rangeLevel } from "@/lib/scanning/free-range";
import type { RiskLevel } from "@/lib/scanning/types";

const LEVELS: { id: RiskLevel; label: string; color: string }[] = [
  { id: "low", label: "Low", color: "#4fd1a5" },
  { id: "moderate", label: "Moderate", color: "#f5c35b" },
  { id: "elevated", label: "Elevated", color: "#ff7a8a" },
];

const R = 78;
const pt = (deg: number, r = R) => {
  const a = (Math.PI * (180 - deg)) / 180;
  return [100 + r * Math.cos(a), 100 - r * Math.sin(a)] as const;
};
const arc = (from: number, to: number, r = R) => {
  const [x0, y0] = pt(from, r);
  const [x1, y1] = pt(to, r);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/**
 * Three-band gauge. By default it shows a level only (the free scan). Given `share` (0 to 1, the share of sentences
 * flagged) it becomes a 0 to 100 dial of the AI score (aiScore): the needle sits at the score and the band edges are
 * the report's thresholds on the same scale, so the needle is always inside the band whose name is shown.
 * Given `range` (the free scan: lo and hi on the 0 to 100 AI score) there is no needle: the range itself lights up
 * on the dial and its label is the range, never an exact number.
 */
export function RiskGauge({ level, share, range }: { level: RiskLevel; share?: number; range?: { lo: number; hi: number } }) {
  const measured = share !== undefined || range !== undefined;
  const shown = share !== undefined ? overallFor(share) : range ? rangeLevel(range.lo, range.hi) : level;
  const idx = LEVELS.findIndex((l) => l.id === shown);
  const score = share !== undefined ? aiScore(share) : 0;
  const marks = [0, SCORE_BANDS.moderate, SCORE_BANDS.elevated, 1];
  const edges = measured ? marks.map((v) => v * 180) : [0, 60, 120, 180];
  const angle = measured ? -90 + score * 180 : -60 + idx * 60; // true score, or the centre of the band
  const current = LEVELS[idx];
  const percent = share !== undefined ? Math.round(score * 100) : null;
  const ticks = Array.from({ length: 37 }, (_, i) => i * 5);
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[48%] size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: `${current.color}26` }} />
      <svg viewBox="0 0 200 118" className="relative overflow-visible" role="img" aria-label={range ? `AI score between ${range.lo} and ${range.hi}%` : percent === null ? `Preliminary risk level: ${current.label}` : `AI score ${percent}%, ${current.label} band`}>
        <defs>
          <linearGradient id="gauge-shine" x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* outer scale: fine ticks around the dial */}
        <g className="gauge-ticks" opacity="0.55">
          {ticks.map((d) => {
            const [x0, y0] = pt(d, 97);
            const [x1, y1] = pt(d, d % 30 === 0 ? 90 : 93.5);
            return <line key={d} x1={x0.toFixed(2)} y1={y0.toFixed(2)} x2={x1.toFixed(2)} y2={y1.toFixed(2)} stroke="#9fb4ff" strokeOpacity={d % 30 === 0 ? 0.9 : 0.4} strokeWidth={d % 30 === 0 ? 1 : 0.6} />;
          })}
        </g>
        <path d={arc(0, 180, 84)} fill="none" stroke="rgb(148 163 255 / 0.1)" strokeWidth="0.8" strokeDasharray="1 3" />
        {/* band tracks */}
        {LEVELS.map((l, i) => {
          const active = i === idx && !range;
          return (
            <g key={l.id}>
              <path d={arc(edges[i] + 3, edges[i + 1] - 3)} fill="none" stroke="#0a0f1e" strokeWidth="15" strokeLinecap="round" />
              <path
                d={arc(edges[i] + 3, edges[i + 1] - 3)}
                fill="none"
                stroke={l.color}
                strokeOpacity={active ? 1 : 0.2}
                strokeWidth={active ? 11 : 9}
                strokeLinecap="round"
                style={active ? { filter: `drop-shadow(0 0 7px ${l.color}) drop-shadow(0 0 16px ${l.color}88)` } : undefined}
              />
              {active && <path d={arc(edges[i] + 3, edges[i + 1] - 3)} fill="none" stroke="url(#gauge-shine)" strokeWidth="3" strokeLinecap="round" />}
            </g>
          );
        })}
        {measured && (range ? [0, 0.2, 0.4, 0.6, 0.8, 1] : marks).map((v) => {
          const [x, y] = pt(v * 180, 108);
          return <text key={v} x={x} y={y + 2} textAnchor="middle" fontSize="6" fill="#9fb4ff" fillOpacity="0.75" fontFamily="var(--font-mono, monospace)">{Math.round(v * 100)}</text>;
        })}
        {range && (
          <g className="gauge-range">
            <path d={arc(range.lo * 1.8 + 1.5, range.hi * 1.8 - 1.5)} fill="none" stroke={current.color} strokeWidth="17" strokeLinecap="butt" strokeOpacity="0.95" style={{ filter: `drop-shadow(0 0 8px ${current.color}) drop-shadow(0 0 18px ${current.color}88)` }} />
            <path d={arc(range.lo * 1.8 + 1.5, range.hi * 1.8 - 1.5)} fill="none" stroke="url(#gauge-shine)" strokeWidth="3" />
            <path d={`M ${pt(range.lo * 1.8 + 1.5, 62).join(" ")} L ${pt(range.lo * 1.8 + 1.5, 72).join(" ")} A 72 72 0 0 1 ${pt(range.hi * 1.8 - 1.5, 72).join(" ")} L ${pt(range.hi * 1.8 - 1.5, 62).join(" ")} A 62 62 0 0 0 ${pt(range.lo * 1.8 + 1.5, 62).join(" ")} Z`} fill={current.color} fillOpacity="0.14" />
          </g>
        )}
        {/* inner halo ring */}
        <path d={arc(0, 180, 60)} fill="none" stroke="rgb(148 163 255 / 0.18)" strokeWidth="0.7" />
        {/* Swings around the hub (100,100 in the SVG's own units); see .gauge-needle in globals.css. */}
        {!range && <g className="gauge-needle" style={{ "--needle-to": `${angle}deg` } as CSSProperties}>
          <polygon points="100,28 103.2,100 96.8,100" fill="#eaf0ff" className="gauge-needle-glow" />
          <line x1="100" y1="100" x2="100" y2="28" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6" />
        </g>}
        <circle cx="100" cy="100" r="11" fill="#0a0f1e" stroke={current.color} strokeOpacity="0.55" strokeWidth="1" />
        <circle cx="100" cy="100" r="6.5" fill="#0e1322" stroke="#e9edf7" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="2" fill={current.color} style={{ filter: `drop-shadow(0 0 4px ${current.color})` }} />
      </svg>
      {range ? (
        <div className="relative mt-1 text-center">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: current.color, textShadow: `0 0 28px ${current.color}77` }}>
            {range.lo}–{range.hi}%
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">AI score range</p>
          <p className="mt-1.5 text-[12.5px] text-fg-muted">The exact score is in the full report.</p>
        </div>
      ) : percent === null ? (
        <div className="relative -mt-2 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-fg-subtle">Preliminary risk</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight" style={{ color: current.color, textShadow: `0 0 24px ${current.color}77` }}>{current.label}</p>
        </div>
      ) : (
        <div className="relative mt-1 text-center">
          <p className="text-[44px] font-semibold leading-none tracking-tight" style={{ color: current.color, textShadow: `0 0 28px ${current.color}77` }}>{percent}%</p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">AI score</p>
          <p className="mt-1.5 text-[13px] font-medium" style={{ color: current.color }}>{current.label} band</p>
        </div>
      )}
    </div>
  );
}
