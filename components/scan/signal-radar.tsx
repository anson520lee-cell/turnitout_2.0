"use client";
import { motion } from "framer-motion";
import type { Signal } from "@/lib/scanning/types";

/** Hexagonal radar of the six signals (0–100). Unmeasured signals sit at 0 and are marked. */
export function SignalRadar({ signals }: { signals: Signal[] }) {
  const cx = 130, cy = 120, R = 86;
  const n = signals.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [+(cx + Math.cos(a) * R * v).toFixed(2), +(cy + Math.sin(a) * R * v).toFixed(2)] as const;
  };
  const poly = signals.map((s, i) => pt(i, (s.score ?? 0) / 100).join(",")).join(" ");
  const ring = (k: number) => signals.map((_, i) => pt(i, k).join(",")).join(" ");
  return (
    <svg viewBox="-20 0 300 240" className="mx-auto w-full max-w-[420px] overflow-visible" role="img" aria-label="Signal overview chart">
      <defs>
        <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#9a7bff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#5fd8f5" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="radar-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8feaff" />
          <stop offset="1" stopColor="#b39bff" />
        </linearGradient>
        <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#5b8cff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="radar-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8feaff" stopOpacity="0" />
          <stop offset="1" stopColor="#8feaff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R * 1.22} fill="url(#radar-bg)" />
      <circle cx={cx} cy={cy} r={R * 1.12} fill="none" stroke="rgb(148 163 255 / 0.14)" strokeDasharray="1 4" />
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={ring(k)} fill="none" stroke={`rgb(148 163 255 / ${k === 1 ? 0.34 : 0.15})`} strokeWidth={k === 1 ? 0.9 : 0.6} />
      ))}
      {[25, 50, 75].map((v) => (
        <text key={v} x={cx + 3} y={cy - R * (v / 100) + 3} fontSize="5.5" fontFamily="var(--font-mono)" fill="#6b7390">{v}</text>
      ))}
      {signals.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(148 163 255 / 0.16)" strokeDasharray="2 3" />;
      })}
      {/* rotating scan beam */}
      <g className="radar-sweep" style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}>
        <path d={`M ${cx} ${cy} L ${cx} ${cy - R * 1.1} A ${R * 1.1} ${R * 1.1} 0 0 0 ${cx - R * 1.1 * Math.sin(0.7)} ${cy - R * 1.1 * Math.cos(0.7)} Z`} fill="url(#radar-beam)" />
        <line x1={cx} y1={cy} x2={cx} y2={cy - R * 1.1} stroke="#8feaff" strokeOpacity="0.7" strokeWidth="0.8" />
      </g>
      <motion.g
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{ originX: `${cx}px`, originY: `${cy}px` }}
      >
        <polygon points={poly} fill="url(#radar-fill)" stroke="url(#radar-stroke)" strokeWidth="1.6" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgb(120 200 255 / 0.65))" }} />
        {signals.map((s, i) => {
          const [x, y] = pt(i, (s.score ?? 0) / 100);
          return (
            <g key={s.id}>
              <circle cx={x} cy={y} r="5.5" fill="rgb(143 234 255 / 0.2)" className="radar-vertex" style={{ animationDelay: `${i * 0.35}s` }} />
              <circle cx={x} cy={y} r="2.4" fill="#fff" style={{ filter: "drop-shadow(0 0 4px #8feaff)" }} />
            </g>
          );
        })}
      </motion.g>
      {signals.map((s, i) => {
        const [x, y] = pt(i, 1.2);
        const anchor = Math.abs(x - cx) < 5 ? "middle" : x > cx ? "start" : "end";
        return (
          <g key={s.id}>
            <text x={x} y={y - 3} textAnchor={anchor} dominantBaseline="middle" fontSize="8.5" fill={s.score === null ? "#6b7390" : "#c3cbe0"}>
              {s.label.split(" ")[0]}{s.score === null ? " (n/a)" : ""}
            </text>
            {s.score !== null && (
              <text x={x} y={y + 7} textAnchor={anchor} dominantBaseline="middle" fontSize="7.5" fontFamily="var(--font-mono)" fill="#8feaff">{Math.round(s.score)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
