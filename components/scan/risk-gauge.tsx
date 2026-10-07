"use client";
import { motion, } from "framer-motion";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import type { RiskLevel } from "@/lib/scanning/types";

const LEVELS: { id: RiskLevel; label: string; color: string }[] = [
  { id: "low", label: "Low", color: "#4fd1a5" },
  { id: "moderate", label: "Moderate", color: "#f5c35b" },
  { id: "elevated", label: "Elevated", color: "#ff7a8a" },
];

/** Three-band gauge. Shows a level, deliberately not a percentage. */
export function RiskGauge({ level }: { level: RiskLevel }) {
  const reduce = usePrefersReducedMotion();
  const idx = LEVELS.findIndex((l) => l.id === level);
  const angle = -60 + idx * 60; // centre of each band
  const r = 80;
  const arc = (i: number) => {
    const a0 = (Math.PI * (180 - i * 60)) / 180;
    const a1 = (Math.PI * (180 - (i + 1) * 60)) / 180;
    const p = (a: number) => `${(100 + r * Math.cos(a)).toFixed(2)} ${(100 - r * Math.sin(a)).toFixed(2)}`;
    return `M ${p(a0 - 0.02)} A ${r} ${r} 0 0 1 ${p(a1 + 0.02)}`;
  };
  const current = LEVELS[idx];
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 120" role="img" aria-label={`Preliminary risk level: ${current.label}`}>
        {LEVELS.map((l, i) => (
          <path key={l.id} d={arc(i)} fill="none" stroke={l.color} strokeOpacity={i === idx ? 0.95 : 0.16} strokeWidth="12" strokeLinecap="round"
            style={i === idx ? { filter: `drop-shadow(0 0 8px ${l.color})` } : undefined} />
        ))}
        <motion.g
          initial={{ rotate: reduce ? angle : -90 }}
          animate={{ rotate: angle }}
          transition={{ type: "spring", stiffness: 60, damping: 12, delay: 0.2 }}
          style={{ originX: "100px", originY: "100px" }}
        >
          <line x1="100" y1="100" x2="100" y2="34" stroke="#e9edf7" strokeWidth="2.5" strokeLinecap="round" />
        </motion.g>
        <circle cx="100" cy="100" r="6" fill="#0e1322" stroke="#e9edf7" strokeWidth="2" />
      </svg>
      <div className="-mt-3 text-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-subtle">Preliminary risk</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: current.color }}>{current.label}</p>
      </div>
    </div>
  );
}
