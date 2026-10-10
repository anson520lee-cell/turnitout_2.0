"use client";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
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

/** Three-band gauge. Shows a level, deliberately not a percentage. */
export function RiskGauge({ level }: { level: RiskLevel }) {
  const reduce = usePrefersReducedMotion();
  const idx = LEVELS.findIndex((l) => l.id === level);
  const angle = -60 + idx * 60; // centre of each band
  const current = LEVELS[idx];
  const ticks = Array.from({ length: 37 }, (_, i) => i * 5);
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[48%] size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: `${current.color}26` }} />
      <svg viewBox="0 0 200 118" className="relative overflow-visible" role="img" aria-label={`Preliminary risk level: ${current.label}`}>
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
            return <line key={d} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#9fb4ff" strokeOpacity={d % 30 === 0 ? 0.9 : 0.4} strokeWidth={d % 30 === 0 ? 1 : 0.6} />;
          })}
        </g>
        <path d={arc(0, 180, 84)} fill="none" stroke="rgb(148 163 255 / 0.1)" strokeWidth="0.8" strokeDasharray="1 3" />
        {/* band tracks */}
        {LEVELS.map((l, i) => {
          const active = i === idx;
          return (
            <g key={l.id}>
              <path d={arc(i * 60 + 3, (i + 1) * 60 - 3)} fill="none" stroke="#0a0f1e" strokeWidth="15" strokeLinecap="round" />
              <path
                d={arc(i * 60 + 3, (i + 1) * 60 - 3)}
                fill="none"
                stroke={l.color}
                strokeOpacity={active ? 1 : 0.2}
                strokeWidth={active ? 11 : 9}
                strokeLinecap="round"
                style={active ? { filter: `drop-shadow(0 0 7px ${l.color}) drop-shadow(0 0 16px ${l.color}88)` } : undefined}
              />
              {active && <path d={arc(i * 60 + 3, (i + 1) * 60 - 3)} fill="none" stroke="url(#gauge-shine)" strokeWidth="3" strokeLinecap="round" />}
            </g>
          );
        })}
        {/* inner halo ring */}
        <path d={arc(0, 180, 60)} fill="none" stroke="rgb(148 163 255 / 0.18)" strokeWidth="0.7" />
        <motion.g
          initial={{ rotate: reduce ? angle : -90 }}
          animate={{ rotate: angle }}
          transition={{ type: "spring", stiffness: 60, damping: 12, delay: 0.2 }}
          style={{ originX: "100px", originY: "100px" }}
        >
          <polygon points="100,28 103.2,100 96.8,100" fill="#eaf0ff" className="gauge-needle-glow" />
          <line x1="100" y1="100" x2="100" y2="28" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6" />
        </motion.g>
        <circle cx="100" cy="100" r="11" fill="#0a0f1e" stroke={current.color} strokeOpacity="0.55" strokeWidth="1" />
        <circle cx="100" cy="100" r="6.5" fill="#0e1322" stroke="#e9edf7" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="2" fill={current.color} style={{ filter: `drop-shadow(0 0 4px ${current.color})` }} />
      </svg>
      <div className="relative -mt-2 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-fg-subtle">Preliminary risk</p>
        <p className="mt-1 text-[28px] font-semibold tracking-tight" style={{ color: current.color, textShadow: `0 0 24px ${current.color}77` }}>{current.label}</p>
      </div>
    </div>
  );
}
