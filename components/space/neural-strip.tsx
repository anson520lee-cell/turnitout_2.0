import { cn } from "@/lib/utils";

/**
 * A small network running fast forward passes, for module headers and
 * banners: hair-thin woven strands, two waves of signals half a pass apart.
 * Pure SVG + CSS (the .ne-* rules in globals.css), no script. Decorative.
 */
const X = [6, 52, 98, 144, 192];
const COUNTS = [5, 8, 8, 5, 1];
const STEP = 0.36;
const CYCLE = 1.8;
const OUT = COUNTS.length - 1;
const ys = (n: number) => (n === 1 ? [30] : Array.from({ length: n }, (_, i) => 5 + (i * 50) / (n - 1)));
const Y = COUNTS.map(ys);

const EDGES: { d: string; wave: 0 | 1 | 2; delay: number }[] = [];
for (let l = 0; l < OUT; l++) {
  for (let a = 0; a < COUNTS[l]; a++) {
    for (let b = 0; b < COUNTS[l + 1]; b++) {
      const h = (a * 5 + b * 3 + l * 7) % 9;
      const m = (X[l] + X[l + 1]) / 2;
      const wave = l === OUT - 1 ? (((a % 2) + 1) as 1 | 2) : h % 4 === 0 ? 1 : h % 4 === 2 ? 2 : 0;
      EDGES.push({
        d: `M${X[l]} ${Y[l][a]} C${m} ${Y[l][a]} ${m} ${Y[l + 1][b]} ${X[l + 1]} ${Y[l + 1][b]}`,
        wave,
        delay: l * STEP + (h % 4) * 0.03 + (wave === 2 ? CYCLE / 2 : 0),
      });
    }
  }
}

export function NeuralStrip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 60" aria-hidden className={cn("h-auto w-full overflow-visible", className)}>
      {EDGES.map((e, i) => (
        <path key={`e${i}`} className="ne-edge" style={{ strokeWidth: 0.22 }} d={e.d} />
      ))}
      {EDGES.filter((e) => e.wave).map((e, i) => (
        <path
          key={`p${i}`}
          className="ne-pulse"
          data-tone={e.wave === 2 ? "violet" : "cyan"}
          pathLength={100}
          d={e.d}
          style={{ animationDelay: `${e.delay.toFixed(2)}s`, strokeWidth: 0.6 }}
        />
      ))}
      {Y.map((col, l) =>
        col.map((y, i) => {
          const delay = `${(l * STEP + (i % 2 ? CYCLE / 2 : 0)).toFixed(2)}s`;
          return (
            <g key={`n${l}-${i}`}>
              <circle cx={X[l]} cy={y} r={l === OUT ? 6 : 3.2} className="ne-halo" style={{ animationDelay: delay }} />
              <circle cx={X[l]} cy={y} r={l === OUT ? 3.4 : 1.7} className="ne-node" data-tone={i % 2 ? "violet" : "cyan"} style={{ animationDelay: delay }} />
              <circle cx={X[l]} cy={y} r={l === OUT ? 5 : 2.8} className="ne-ring" style={{ strokeWidth: 0.25 }} />
            </g>
          );
        }),
      )}
    </svg>
  );
}
