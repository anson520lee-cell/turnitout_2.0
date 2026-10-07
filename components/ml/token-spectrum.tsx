/**
 * A radial spectrum: one bar per token, arranged round the document, its
 * length the strength of the signal read at that token. Four sectors stand
 * out, one for each signal named by the chips in front. A precise instrument
 * ring (ticks, a fine inner rule, a sweeping marker) frames it.
 *
 * Pure SVG + CSS (".spec-*" in globals.css), decorative. The bar lengths are
 * generated, not measured: it illustrates the idea of per-token scores.
 */

const BARS = 120;
const R0 = 43.5; // where the bars start
/** Sector centres in degrees (0 = right, clockwise), placed behind the four signal chips. */
const SECTORS = [214, 342, 164, 35];
const TONES = ["#6fe0f7", "#b79cff", "#6fe0f7", "#b79cff"];

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const bars = Array.from({ length: BARS }, (_, i) => {
  const deg = (i / BARS) * 360;
  // how close this bar is to the nearest signal sector
  let lift = 0;
  let tone = -1;
  SECTORS.forEach((c, k) => {
    const d = Math.abs(((deg - c + 540) % 360) - 180);
    const v = Math.exp(-(d * d) / (2 * 13 * 13));
    if (v > lift) {
      lift = v;
      tone = k;
    }
  });
  const len = 2.2 + hash(i) * 3.2 + lift * (6.5 + hash(i + 50) * 4);
  return {
    deg,
    len,
    strong: lift > 0.32,
    color: lift > 0.32 ? TONES[tone] : "#93a0c8",
    opacity: lift > 0.32 ? 0.55 + lift * 0.45 : 0.3 + hash(i + 9) * 0.18,
    delay: -((i * 0.055) % 2.4) - hash(i + 3) * 0.4,
    dur: 1.5 + hash(i + 7) * 1.1,
  };
});

export function TokenSpectrum({ className }: { className?: string }) {
  return (
    <svg viewBox="-62 -62 124 124" aria-hidden className={className}>
      <defs>
        <linearGradient id="spec-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6fe0f7" stopOpacity="0" />
          <stop offset="1" stopColor="#eaf6ff" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* the instrument: a fine rule, ticks every 6°, longer every 30° */}
      <circle r={R0 - 1.6} fill="none" stroke="rgb(170 190 255 / 0.28)" strokeWidth="0.18" />
      <circle r="59.5" fill="none" stroke="rgb(170 190 255 / 0.12)" strokeWidth="0.18" strokeDasharray="0.5 1.6" />
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={`t${i}`}
          x1={R0 - (i % 5 === 0 ? 4.2 : 2.9)}
          x2={R0 - 2.1}
          y1="0"
          y2="0"
          transform={`rotate(${i * 6})`}
          stroke={i % 5 === 0 ? "rgb(200 215 255 / 0.5)" : "rgb(170 190 255 / 0.22)"}
          strokeWidth="0.2"
        />
      ))}

      {/* the spectrum */}
      {bars.map((b, i) => (
        <g key={i} transform={`rotate(${b.deg.toFixed(2)})`}>
          <line
            x1={R0}
            x2={(R0 + b.len).toFixed(2)}
            y1="0"
            y2="0"
            className="spec-bar"
            stroke={b.color}
            strokeOpacity={b.opacity.toFixed(2)}
            strokeWidth={b.strong ? 0.8 : 0.55}
            strokeLinecap="round"
            style={{ animationDelay: `${b.delay.toFixed(2)}s`, animationDuration: `${b.dur.toFixed(2)}s` }}
          />
        </g>
      ))}

      {/* a marker sweeping round, reading each token in turn */}
      <g className="spec-sweep">
        <path d={`M ${((R0 - 1.6) * Math.cos(-0.9)).toFixed(2)} ${((R0 - 1.6) * Math.sin(-0.9)).toFixed(2)} A ${R0 - 1.6} ${R0 - 1.6} 0 0 1 ${R0 - 1.6} 0`} fill="none" stroke="url(#spec-sweep)" strokeWidth="0.7" strokeLinecap="round" />
        <line x1={R0 - 1.6} x2="60" y1="0" y2="0" stroke="rgb(234 246 255 / 0.55)" strokeWidth="0.22" />
        <circle cx={R0 - 1.6} cy="0" r="0.95" fill="#eaf6ff" />
      </g>
    </svg>
  );
}
