"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { ENGINE_SIGNALS } from "./engine-core";

/**
 * The Pattern Engine drawn as a neural network: the six writing signals are
 * the input neurons, two hidden layers combine them, and one output neuron
 * holds the estimate. Decorative (aria-hidden); the signals are listed in
 * text beside it.
 *
 * Drawn as liquid glass: each layer is a frosted glass capsule holding glass
 * bead neurons, the connections are hair-thin S-curves that cross and weave,
 * and the signals are small points of light gliding along them (pure CSS,
 * see ".ne-*" in globals.css). Two waves, cyan and violet, run half a pass
 * apart, so light is always threading through the weave. A small timer
 * moves the "attention": one input at a time lights up with every connection
 * leaving it, together with its row in the list. Hovering a row in the list
 * pins the attention to that signal.
 */

const X = [35, 49, 62.5, 76, 90]; // layer x positions, % of the square
const COUNTS = [ENGINE_SIGNALS.length, 8, 8, 5, 1];
const CAPTIONS = ["Signals", "Hidden 1", "Hidden 2", "Hidden 3", "Estimate"];
const STEP = 0.36; // seconds a signal takes to cross one layer gap
const CYCLE = 1.8; // seconds per forward pass (matches .ne-* in globals.css)
const OUT = COUNTS.length - 1;
const TOP = 20;
const SPAN = 63;

const ys = (n: number) => (n === 1 ? [TOP + SPAN / 2] : Array.from({ length: n }, (_, i) => TOP + (i * SPAN) / (n - 1)));
const LAYER_Y = COUNTS.map(ys);
const OY = TOP + SPAN / 2; // the output orb sits level with the middle of the layers
/** A strand between two neurons: an S-curve, so neighbours cross and weave. */
const strand = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2;
  return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`;
};

interface Edge {
  l: number;
  a: number;
  d: string;
  /** 0 = no signal, 1 = first wave (cyan), 2 = second wave half a pass later (violet) */
  wave: 0 | 1 | 2;
  delay: number;
}

const EDGES: Edge[] = [];
for (let l = 0; l < OUT; l++) {
  for (let a = 0; a < COUNTS[l]; a++) {
    for (let b = 0; b < COUNTS[l + 1]; b++) {
      const h = (a * 7 + b * 13 + l * 5) % 11;
      const wave = l === OUT - 1 ? (((a % 2) + 1) as 1 | 2) : h % 4 === 0 ? 1 : h % 4 === 2 ? 2 : 0;
      EDGES.push({
        l,
        a,
        d: strand(X[l], LAYER_Y[l][a], X[l + 1], LAYER_Y[l + 1][b]),
        wave,
        delay: l * STEP + (h % 5) * 0.03 + (wave === 2 ? CYCLE / 2 : 0),
      });
    }
  }
}

export function NeuralEngine({
  focus,
  listItems,
}: {
  /** Index of the signal hovered in the list, or null. */
  focus: MutableRefObject<number | null>;
  /** List rows to light up alongside their input neurons. */
  listItems: MutableRefObject<(HTMLElement | null)[]>;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current = -1;
    let auto = 0;
    let ticks = 0;
    let timer = 0;

    const apply = (i: number) => {
      if (i === current) return;
      current = i;
      el.querySelectorAll<HTMLElement | SVGElement>("[data-in]").forEach((n) => {
        if (n.getAttribute("data-in") === String(i)) n.setAttribute("data-hot", "");
        else n.removeAttribute("data-hot");
      });
      listItems.current.forEach((row, k) => row?.style.setProperty("--on", k === i ? "1" : "0"));
    };

    const tick = () => {
      ticks++;
      if (focus.current !== null) {
        apply(focus.current);
        return;
      }
      if (reduce) {
        apply(-1);
        return;
      }
      if (ticks % 10 === 0) auto = (auto + 1) % ENGINE_SIGNALS.length; // every 1.5s
      apply(auto);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        window.clearInterval(timer);
        if (e.isIntersecting) timer = window.setInterval(tick, 150);
      },
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [focus, listItems]);

  return (
    <div ref={root} aria-hidden className="relative mx-auto aspect-square w-full max-w-[560px] select-none">
      {/* ambient glow */}
      <div data-depth="-2" className="absolute inset-[-14%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.26),rgb(154_123_255/0.1)_55%,transparent_75%)]" />

      <div className="liquid-glass absolute inset-0 overflow-hidden rounded-[36px]" data-tilt="7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-violet/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-cyan/15 blur-3xl" />

        <div className="absolute inset-x-[6%] top-[5%] flex items-center justify-between">
          <p className="text-[13px] font-semibold tracking-tight text-fg">Pattern Engine</p>
          <p className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[10.5px] font-medium text-fg-muted">
            <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_#5fd8f5]" />
            Forward pass
          </p>
        </div>

        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id="ne-slab" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
              <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.035" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.075" />
            </linearGradient>
            <linearGradient id="ne-slab-rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="0.45" stopColor="#9fb8ff" stopOpacity="0.14" />
              <stop offset="1" stopColor="#c9b8ff" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="ne-bead-cyan" cx="34%" cy="28%" r="78%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.28" stopColor="#a8f1ff" />
              <stop offset="0.7" stopColor="#3aa9d6" />
              <stop offset="1" stopColor="#10324f" />
            </radialGradient>
            <radialGradient id="ne-bead-violet" cx="34%" cy="28%" r="78%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.28" stopColor="#d6c9ff" />
              <stop offset="0.7" stopColor="#7a5fe0" />
              <stop offset="1" stopColor="#24194f" />
            </radialGradient>
            <radialGradient id="ne-orb" cx="36%" cy="26%" r="82%">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="0.2" stopColor="#bcd0ff" stopOpacity="0.9" />
              <stop offset="0.58" stopColor="#4d74ee" stopOpacity="0.92" />
              <stop offset="1" stopColor="#0d1440" stopOpacity="0.98" />
            </radialGradient>
            <linearGradient id="ne-strand" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8fe6ff" />
              <stop offset="1" stopColor="#b9a6ff" />
            </linearGradient>
          </defs>

          {/* the weave */}
          {EDGES.map((e, i) => (
            <path key={`e${i}`} className="ne-edge" data-in={e.l === 0 ? e.a : undefined} d={e.d} />
          ))}
          {/* points of light gliding along it, each with a soft halo */}
          {EDGES.filter((e) => e.wave).map((e, i) => (
            <g key={`p${i}`}>
              <path className="ne-pulse ne-pulse-glow" data-tone={e.wave === 2 ? "violet" : "cyan"} pathLength={100} d={e.d} style={{ animationDelay: `${e.delay.toFixed(2)}s` }} />
              <path className="ne-pulse" data-tone={e.wave === 2 ? "violet" : "cyan"} pathLength={100} d={e.d} style={{ animationDelay: `${e.delay.toFixed(2)}s` }} />
            </g>
          ))}

          {/* each layer is a frosted glass capsule */}
          {LAYER_Y.map((col, l) =>
            l === OUT ? null : (
              <rect
                key={`s${l}`}
                x={X[l] - 3.6}
                y={col[0] - 5}
                width="7.2"
                height={col[col.length - 1] - col[0] + 10}
                rx="3.6"
                fill="url(#ne-slab)"
                stroke="url(#ne-slab-rim)"
                strokeWidth="0.18"
              />
            ),
          )}

          {/* glass bead neurons */}
          {LAYER_Y.map((col, l) =>
            l === OUT
              ? null
              : col.map((y, i) => {
                  const delay = `${(l * STEP + (i % 2 ? CYCLE / 2 : 0)).toFixed(2)}s`;
                  return (
                    <g key={`n${l}-${i}`} data-in={l === 0 ? i : undefined} className="ne-neuron">
                      <circle cx={X[l]} cy={y} r="2.5" className="ne-halo" style={{ animationDelay: delay }} />
                      <circle cx={X[l]} cy={y} r="1.55" fill={`url(#ne-bead-${i % 2 ? "violet" : "cyan"})`} className="ne-bead" style={{ animationDelay: delay }} />
                      <ellipse cx={X[l] - 0.45} cy={y - 0.6} rx="0.55" ry="0.32" fill="#fff" opacity="0.75" />
                    </g>
                  );
                }),
          )}

          {/* the output: a glass orb */}
          <circle cx={X[OUT]} cy={OY} r="7.4" className="ne-out-ring" style={{ animationDelay: `${(OUT * STEP).toFixed(2)}s` }} />
          <circle cx={X[OUT]} cy={OY} r="7.4" className="ne-out-ring" style={{ animationDelay: `${(OUT * STEP + CYCLE / 2).toFixed(2)}s` }} />
          <circle cx={X[OUT]} cy={OY} r="6.3" fill="url(#ne-orb)" stroke="rgb(255 255 255 / 0.5)" strokeWidth="0.2" />
          <ellipse cx={X[OUT] - 1.6} cy={OY - 3.6} rx="2.6" ry="1.3" fill="#fff" opacity="0.5" />
          <text x={X[OUT]} y={OY + 1.5} textAnchor="middle" className="ne-out-text">0%</text>
        </svg>

        {/* input labels: glass pills */}
        {ENGINE_SIGNALS.map((name, i) => (
          <div
            key={name}
            data-in={i}
            className="ne-chip absolute right-[69.5%] flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-2.5 pr-2"
            style={{ top: `${LAYER_Y[0][i]}%` }}
          >
            <span className="hidden text-[11px] font-medium sm:inline">{name}</span>
            <span className="text-[10px] font-semibold tabular-nums opacity-60">0{i + 1}</span>
          </div>
        ))}

        {/* layer captions */}
        {CAPTIONS.map((c, l) => (
          <span
            key={c}
            className="absolute bottom-[6%] -translate-x-1/2 whitespace-nowrap text-[9.5px] font-medium tracking-wide text-fg-subtle"
            style={{ left: `${X[l]}%` }}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
