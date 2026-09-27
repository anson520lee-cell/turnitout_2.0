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
  return (
    <svg viewBox="-20 0 300 240" className="mx-auto w-full max-w-[380px]" role="img" aria-label="Signal overview chart">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={signals.map((_, i) => pt(i, k).join(",")).join(" ")} fill="none" stroke="rgb(148 163 255 / 0.12)" />
      ))}
      {signals.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(148 163 255 / 0.08)" />;
      })}
      <motion.polygon
        points={poly}
        fill="url(#radar-fill)"
        stroke="#7c9dff"
        strokeWidth="1.5"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{ originX: `${cx}px`, originY: `${cy}px` }}
      />
      <defs>
        <radialGradient id="radar-fill">
          <stop offset="0" stopColor="#9a7bff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#5b8cff" stopOpacity="0.4" />
        </radialGradient>
      </defs>
      {signals.map((s, i) => {
        const [x, y] = pt(i, 1.2);
        return (
          <text key={s.id} x={x} y={y} textAnchor={Math.abs(x - cx) < 5 ? "middle" : x > cx ? "start" : "end"} dominantBaseline="middle" fontSize="8.5" fill={s.score === null ? "#6b7390" : "#9aa3b8"}>
            {s.label.split(" ")[0]}{s.score === null ? " (n/a)" : ""}
          </text>
        );
      })}
    </svg>
  );
}
