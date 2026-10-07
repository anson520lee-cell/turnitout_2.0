import { cn } from "@/lib/utils";

/**
 * Small machine-learning motifs used by the demo visuals. All are pure SVG +
 * CSS (see "ML motifs" and ".ne-*" in globals.css), decorative, and safe to
 * render on the server.
 */

const STEP = 0.36; // matches the .ne-* pass timing
const CYCLE = 1.8;
const pt = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
const f2 = (n: number) => n.toFixed(2);

/* ── NeuralHalo: neurons on two rings feeding inward, to sit behind a document ── */
const OUTER = 16;
const INNER = 8;
const HALO: { d: string; wave: 0 | 1 | 2; delay: number }[] = [];
for (let i = 0; i < OUTER; i++) {
  const a = (i / OUTER) * Math.PI * 2;
  const [ox, oy] = pt(46, a);
  for (const k of [0, 1]) {
    // angle left unwrapped (j may reach INNER) so the strand never takes the long way round
    const b = ((Math.floor((i * INNER) / OUTER) + k) / INNER) * Math.PI * 2 + 0.2;
    const [ix, iy] = pt(31, b);
    const [cx, cy] = pt(41, (a + b) / 2 + 0.22);
    const h = (i * 3 + k * 5) % 7;
    HALO.push({
      d: `M${f2(ox)} ${f2(oy)} Q${f2(cx)} ${f2(cy)} ${f2(ix)} ${f2(iy)}`,
      wave: h % 3 === 0 ? 1 : h % 3 === 1 ? 2 : 0,
      delay: (h % 4) * 0.04 + (h % 3 === 1 ? CYCLE / 2 : 0),
    });
  }
}
for (let j = 0; j < INNER; j++) {
  const b = (j / INNER) * Math.PI * 2 + 0.2;
  const [ix, iy] = pt(31, b);
  const [tx, ty] = pt(15, b + 0.5);
  const [cx, cy] = pt(24, b + 0.05);
  HALO.push({
    d: `M${f2(ix)} ${f2(iy)} Q${f2(cx)} ${f2(cy)} ${f2(tx)} ${f2(ty)}`,
    wave: j % 2 ? 2 : 1,
    delay: STEP + (j % 2 ? CYCLE / 2 : 0),
  });
}

export function NeuralHalo({ className }: { className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" aria-hidden className={cn("size-full overflow-visible", className)}>
      <circle r="46" className="ne-ring" style={{ strokeWidth: 0.12, strokeDasharray: "0.6 1.8" }} />
      <circle r="31" className="ne-ring" style={{ strokeWidth: 0.12, strokeDasharray: "0.6 1.8" }} />
      {HALO.map((e, i) => (
        <path key={`e${i}`} className="ne-edge" style={{ strokeWidth: 0.16 }} d={e.d} />
      ))}
      {HALO.filter((e) => e.wave).map((e, i) => (
        <path
          key={`p${i}`}
          className="ne-pulse"
          data-tone={e.wave === 2 ? "violet" : "cyan"}
          pathLength={100}
          d={e.d}
          style={{ animationDelay: `${f2(e.delay)}s`, strokeWidth: 0.45 }}
        />
      ))}
      {Array.from({ length: OUTER }, (_, i) => {
        const [x, y] = pt(46, (i / OUTER) * Math.PI * 2);
        const delay = `${f2(i % 2 ? CYCLE / 2 : 0)}s`;
        return (
          <g key={`o${i}`}>
            <circle cx={f2(x)} cy={f2(y)} r="2" className="ne-halo" style={{ animationDelay: delay }} />
            <circle cx={f2(x)} cy={f2(y)} r="0.95" className="ne-node" data-tone={i % 2 ? "violet" : "cyan"} style={{ animationDelay: delay }} />
          </g>
        );
      })}
      {Array.from({ length: INNER }, (_, j) => {
        const [x, y] = pt(31, (j / INNER) * Math.PI * 2 + 0.2);
        const delay = `${f2(STEP + (j % 2 ? CYCLE / 2 : 0))}s`;
        return (
          <g key={`i${j}`}>
            <circle cx={f2(x)} cy={f2(y)} r="2.4" className="ne-halo" style={{ animationDelay: delay }} />
            <circle cx={f2(x)} cy={f2(y)} r="1.15" className="ne-node" data-tone={j % 2 ? "cyan" : "violet"} style={{ animationDelay: delay }} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── LossCurve: a training curve that draws itself, falls, and starts again ── */
const LOSS = Array.from({ length: 26 }, (_, i) => {
  const x = 3 + (i / 25) * 94;
  const y = 34 - 28 * Math.exp(-i / 5.5) + ((i * 7) % 5) * 0.55 - 1.1;
  return [x, y] as const;
});
const LOSS_D = LOSS.map(([x, y], i) => `${i ? "L" : "M"}${f2(x)} ${f2(y)}`).join(" ");

export function LossCurve({ className }: { className?: string }) {
  const [ex, ey] = LOSS[LOSS.length - 1];
  return (
    <svg viewBox="0 0 100 40" aria-hidden className={cn("h-auto w-full overflow-visible", className)}>
      {[10, 20, 30].map((y) => (
        <line key={y} x1="3" x2="97" y1={y} y2={y} stroke="rgb(148 163 255 / 0.12)" strokeWidth="0.3" />
      ))}
      <path d="M3 3 V37 H97" fill="none" stroke="rgb(148 163 255 / 0.3)" strokeWidth="0.4" />
      <path d={LOSS_D} pathLength={100} className="loss-draw" fill="none" stroke="#7de3ff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={f2(ex)} cy={f2(ey)} r="1.6" fill="#dff8ff" className="loss-dot" />
    </svg>
  );
}

/* ── AttentionGrid: a small attention map whose cells light up in turn ── */
export function AttentionGrid({ n = 5, className }: { n?: number; className?: string }) {
  const cell = 100 / n;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-full", className)}>
      {Array.from({ length: n * n }, (_, k) => {
        const i = k % n;
        const j = Math.floor(k / n);
        const base = i === j ? 0.55 : 0.12 + (((i * 5 + j * 3) % 4) * 0.06);
        return (
          <rect
            key={k}
            x={i * cell + 2}
            y={j * cell + 2}
            width={cell - 4}
            height={cell - 4}
            rx="2.5"
            className="attn-cell"
            fill={(i + j) % 3 === 0 ? "#b9a6ff" : "#7de3ff"}
            style={{ ["--a" as string]: base, animationDelay: `${(((i * 3 + j * 5) % 7) * 0.22).toFixed(2)}s` }}
          />
        );
      })}
    </svg>
  );
}

/* ── SoftmaxBars: class probabilities that keep shifting (never a result) ── */
export function SoftmaxBars({ bars = 5, className }: { bars?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-end gap-[8%]", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="act-bar flex-1 rounded-sm bg-gradient-to-t from-accent/25 to-cyan"
          style={{ height: "100%", animationDelay: `${(-i * 0.37).toFixed(2)}s`, animationDuration: `${(1.3 + (i % 3) * 0.35).toFixed(2)}s` }}
        />
      ))}
    </div>
  );
}
