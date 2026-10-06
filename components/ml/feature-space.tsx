"use client";
import { motion } from "framer-motion";

/**
 * A different way of showing a classifier at work: not the network, but the
 * space it sorts things in. Each dot is a text, placed by its features; texts
 * with formulaic patterns gather in one cloud, varied writing in another, and
 * a boundary runs between them. The lit point is the example on the left: it
 * is tied to its nearest neighbours, and when the example changes it travels
 * across the boundary to the other cloud.
 *
 * Illustration only (the card says so): the dots are generated, not real texts.
 */

const W = 200;
const H = 104;

/** Small seeded generator, so the server and the browser draw the same dots. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dot {
  x: number;
  y: number;
  r: number;
  delay: number;
}

function cloud(seed: number, cx: number, cy: number, sx: number, sy: number, tilt: number, n: number): Dot[] {
  const rnd = seeded(seed);
  const g = () => (rnd() + rnd() + rnd() + rnd() - 2) / 1.15;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return Array.from({ length: n }, () => {
    const u = g() * sx;
    const v = g() * sy;
    return { x: cx + u * c - v * s, y: cy + u * s + v * c, r: 0.7 + rnd() * 0.9, delay: rnd() * 4 };
  });
}

// formulaic patterns gather upper right, varied writing lower left
const FORMULAIC = cloud(11, 146, 36, 21, 11, -0.35, 46);
const VARIED = cloud(29, 56, 66, 23, 12, -0.3, 46);
const SAMPLE = { elevated: { x: 139, y: 40 }, low: { x: 62, y: 63 } };

function nearest(from: { x: number; y: number }, dots: Dot[], k: number) {
  return dots
    .map((d) => ({ d, q: (d.x - from.x) ** 2 + (d.y - from.y) ** 2 }))
    .sort((a, b) => a.q - b.q)
    .slice(3, 3 + k) // skip the few right on top of it, so the ties are long enough to see
    .map((n) => n.d);
}
const NEIGHBOURS = { elevated: nearest(SAMPLE.elevated, FORMULAIC, 6), low: nearest(SAMPLE.low, VARIED, 6) };

const BOUNDARY = "M82 0 C 92 30, 104 62, 122 104";
const spring = { type: "spring", stiffness: 60, damping: 14, mass: 1 } as const;

export function FeatureSpace({ elevated, className }: { elevated: boolean; className?: string }) {
  const at = elevated ? SAMPLE.elevated : SAMPLE.low;
  const near = elevated ? NEIGHBOURS.elevated : NEIGHBOURS.low;
  const tone = elevated ? "#ff8fa0" : "#6fe3c1";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className={className}>
      <defs>
        <linearGradient id="fs-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5fd8f5" stopOpacity="0.02" />
          <stop offset="1" stopColor="#5fd8f5" stopOpacity="0.11" />
        </linearGradient>
        <linearGradient id="fs-right" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b284ff" stopOpacity="0.13" />
          <stop offset="1" stopColor="#b284ff" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id="fs-glow">
          <stop offset="0" stopColor={tone} stopOpacity="0.55" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the two regions either side of the boundary */}
      <path d={`${BOUNDARY} L0 ${H} L0 0 Z`} fill="url(#fs-left)" />
      <path d={`${BOUNDARY} L${W} ${H} L${W} 0 Z`} fill="url(#fs-right)" />

      {/* a faint lattice and the axes */}
      {[26, 52, 78].map((y) => (
        <line key={`h${y}`} x1="0" x2={W} y1={y} y2={y} stroke="rgb(148 163 255 / 0.07)" strokeWidth="0.3" />
      ))}
      {[40, 80, 120, 160].map((x) => (
        <line key={`v${x}`} x1={x} x2={x} y1="0" y2={H} stroke="rgb(148 163 255 / 0.07)" strokeWidth="0.3" />
      ))}

      {/* density contours of each cloud */}
      {[1, 1.75, 2.5].map((k) => (
        <g key={k} fill="none" strokeWidth="0.3">
          <ellipse cx="146" cy="36" rx={15 * k} ry={8 * k} transform="rotate(-20 146 36)" stroke={`rgb(178 132 255 / ${0.26 / k})`} />
          <ellipse cx="56" cy="66" rx={16 * k} ry={8.5 * k} transform="rotate(-17 56 66)" stroke={`rgb(95 216 245 / ${0.26 / k})`} />
        </g>
      ))}

      {/* the texts */}
      {VARIED.map((d, i) => (
        <circle key={`a${i}`} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r.toFixed(2)} fill="#7de3ff" className="fs-dot" style={{ animationDelay: `${d.delay.toFixed(2)}s` }} />
      ))}
      {FORMULAIC.map((d, i) => (
        <circle key={`b${i}`} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r.toFixed(2)} fill="#c3a8ff" className="fs-dot" style={{ animationDelay: `${d.delay.toFixed(2)}s` }} />
      ))}

      {/* the decision boundary, with a signal running along it */}
      <path d={BOUNDARY} fill="none" stroke="rgb(235 240 255 / 0.5)" strokeWidth="0.5" strokeDasharray="2.2 2.2" />
      <path d={BOUNDARY} fill="none" pathLength={100} className="fs-run" />

      {/* this example: tied to its nearest neighbours */}
      {near.map((d, i) => (
        <motion.line
          key={i}
          initial={false}
          animate={{ x1: at.x, y1: at.y, x2: d.x, y2: d.y }}
          transition={{ ...spring, delay: i * 0.03 }}
          stroke={tone}
          strokeOpacity="0.7"
          strokeWidth="0.45"
        />
      ))}
      <motion.circle initial={false} animate={{ cx: at.x, cy: at.y }} transition={spring} r="13" fill="url(#fs-glow)" />
      <motion.circle initial={false} animate={{ cx: at.x, cy: at.y }} transition={spring} r="6.5" fill="none" stroke={tone} strokeWidth="0.4" className="fs-ring" />
      <motion.circle initial={false} animate={{ cx: at.x, cy: at.y }} transition={spring} r="2.6" fill="#fff" stroke={tone} strokeWidth="0.8" />

      {/* labels */}
      <text x="6" y="98" className="fs-label" fill="rgb(125 227 255 / 0.8)">varied writing</text>
      <text x={W - 6} y="9" textAnchor="end" className="fs-label" fill="rgb(195 168 255 / 0.85)">formulaic patterns</text>
      <text x="124" y="98" className="fs-label" fill="rgb(225 232 255 / 0.55)">boundary</text>
    </svg>
  );
}
