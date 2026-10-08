import { cn } from "@/lib/utils";

/**
 * The Pattern Engine as a plain technical schematic for the dashboard banner,
 * drawn like the diagram on the home page: one accent colour, hairline greys,
 * labelled inputs, no glow. Six signals feed three hidden layers and one
 * estimate; a single thin read line sweeps across the layers. Pure SVG + CSS
 * (.es-* in globals.css), no script. Decorative: the text beside it says what
 * the engine does.
 */
const SIGNALS = ["Variation", "Repetition", "Transitions", "Phrasing", "Lexical", "Paragraphs"];
const VALUES = [0.62, 0.34, 0.78, 0.45, 0.28, 0.55]; // illustrative bar fills
const X = [112, 192, 268, 344, 424];
const COUNTS = [6, 8, 8, 5, 1];
const TOP = 18;
const BOTTOM = 142;
const ys = (n: number) => (n === 1 ? [(TOP + BOTTOM) / 2] : Array.from({ length: n }, (_, i) => TOP + ((BOTTOM - TOP) * i) / (n - 1)));
const Y = COUNTS.map(ys);
const CAPTIONS = ["Signals", "Hidden", "Hidden", "Hidden", "Estimate"];

// deterministic "weights": most connections faint grey, a few carrying the accent
const EDGES: { d: string; strong: boolean; o: number }[] = [];
for (let l = 0; l < COUNTS.length - 1; l++) {
  for (let a = 0; a < COUNTS[l]; a++) {
    for (let b = 0; b < COUNTS[l + 1]; b++) {
      const h = (a * 7 + b * 5 + l * 11) % 13;
      const m = (X[l] + X[l + 1]) / 2;
      EDGES.push({
        d: `M${X[l]} ${Y[l][a]} C${m} ${Y[l][a]} ${m} ${Y[l + 1][b]} ${X[l + 1]} ${Y[l + 1][b]}`,
        strong: h === 0 || h === 6,
        o: 0.06 + (h / 13) * 0.1,
      });
    }
  }
}

export function EngineSchematic({ className }: { className?: string }) {
  const R = 22;
  const C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 480 168" aria-hidden className={cn("h-auto w-full", className)} style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
      <defs>
        <linearGradient id="es-read" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(91 140 255)" stopOpacity="0" />
          <stop offset="0.5" stopColor="rgb(91 140 255)" stopOpacity="0.55" />
          <stop offset="1" stopColor="rgb(91 140 255)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* layer guides */}
      {X.map((x, l) => (
        <line key={`g${l}`} x1={x} x2={x} y1={TOP - 8} y2={BOTTOM + 8} stroke="rgb(150 160 190)" strokeOpacity="0.07" strokeWidth="0.6" strokeDasharray="2 3" />
      ))}

      {/* connections */}
      {EDGES.map((e, i) =>
        e.strong ? (
          <path key={i} d={e.d} fill="none" stroke="rgb(91 140 255)" strokeOpacity="0.38" strokeWidth="0.6" />
        ) : (
          <path key={i} d={e.d} fill="none" stroke="rgb(150 160 190)" strokeOpacity={e.o} strokeWidth="0.45" />
        ),
      )}

      {/* the read line sweeping across the layers */}
      <rect className="es-read" x={X[0] - 0.5} y={TOP - 10} width="1" height={BOTTOM - TOP + 20} fill="url(#es-read)" />

      {/* inputs: label, value bar, node */}
      {SIGNALS.map((s, i) => {
        const y = Y[0][i];
        return (
          <g key={s}>
            <text x={X[0] - 46} y={y + 2.6} textAnchor="end" fontSize="7.6" fill="rgb(154 163 184)" letterSpacing="0.04em">
              {s}
            </text>
            <rect x={X[0] - 40} y={y - 1} width="30" height="2" rx="1" fill="rgb(255 255 255)" fillOpacity="0.07" />
            <rect x={X[0] - 40} y={y - 1} width={30 * VALUES[i]} height="2" rx="1" fill="rgb(91 140 255)" fillOpacity="0.8" />
          </g>
        );
      })}

      {/* nodes */}
      {Y.slice(0, -1).map((col, l) =>
        col.map((y, i) => (
          <circle key={`n${l}-${i}`} cx={X[l]} cy={y} r="2.3" fill="rgb(8 11 22)" stroke="rgb(170 180 205)" strokeOpacity="0.55" strokeWidth="0.7" />
        )),
      )}

      {/* the estimate: a gauge with a tick ring */}
      <g transform={`translate(${X[4]} ${Y[4][0]})`}>
        <circle r={R + 5} fill="none" stroke="rgb(150 160 190)" strokeOpacity="0.18" strokeWidth="0.6" strokeDasharray="0.8 3.2" />
        <circle r={R} fill="rgb(8 11 22)" stroke="rgb(255 255 255)" strokeOpacity="0.08" strokeWidth="2" />
        <circle className="es-arc" r={R} fill="none" stroke="rgb(91 140 255)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${C * 0.28} ${C}`} transform="rotate(-90)" />
        <text y="2.8" textAnchor="middle" fontSize="8.5" fill="rgb(233 237 247)" letterSpacing="0.08em">
          READY
        </text>
      </g>

      {/* captions */}
      {CAPTIONS.map((c, l) => (
        <text key={c + l} x={X[l]} y="164" textAnchor="middle" fontSize="6.4" fill="rgb(118 126 156)" letterSpacing="0.16em">
          {c.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
