"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { ENGINE_SIGNALS } from "./engine-core";

/**
 * The Pattern Engine drawn as a neural network: the six writing signals are
 * the input neurons, two hidden layers combine them, and one output neuron
 * holds the estimate. Decorative (aria-hidden); the signals are listed in
 * text beside it.
 *
 * The connections are hair-thin S-curves, so they cross and weave. The
 * passes are pure CSS (a dash of light travelling along each strand, layer
 * after layer, see ".ne-*" in globals.css) and they come fast: two waves,
 * cyan and violet, half a pass apart, so signals are always threading
 * through each other. A small timer
 * moves the "attention": one input at a time lights up with every connection
 * leaving it, together with its row in the list. Hovering a row in the list
 * pins the attention to that signal.
 */

const X = [33, 46.5, 60, 73.5, 87.5]; // layer x positions, % of the square
const COUNTS = [ENGINE_SIGNALS.length, 9, 11, 7, 1];
const CAPTIONS = ["signals", "hidden 1", "hidden 2", "hidden 3", "estimate"];
const STEP = 0.36; // seconds a pulse takes to cross one layer gap
const CYCLE = 1.8; // seconds per forward pass (matches .ne-* in globals.css)
const OUT = COUNTS.length - 1;

const ys = (n: number) => (n === 1 ? [50] : Array.from({ length: n }, (_, i) => 13 + (i * 72) / (n - 1)));
/** A strand between two neurons: an S-curve, so neighbours cross and weave. */
const strand = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2;
  return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`;
};
const LAYER_Y = COUNTS.map(ys);

interface Edge {
  l: number;
  a: number;
  d: string;
  /** 0 = no signal, 1 = first wave (cyan), 2 = second wave half a pass later (violet) */
  wave: 0 | 1 | 2;
  delay: number;
}

const EDGES: Edge[] = [];
for (let l = 0; l < COUNTS.length - 1; l++) {
  for (let a = 0; a < COUNTS[l]; a++) {
    for (let b = 0; b < COUNTS[l + 1]; b++) {
      const h = (a * 7 + b * 13 + l * 5) % 11;
      const wave = l === OUT - 1 ? ((a % 2) + 1) as 1 | 2 : h % 4 === 0 ? 1 : h % 4 === 2 ? 2 : 0;
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
      if (ticks % 8 === 0) auto = (auto + 1) % ENGINE_SIGNALS.length; // every 1.2s
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
    <div ref={root} aria-hidden className="relative mx-auto aspect-square w-full max-w-[540px] select-none">
      {/* ambient glow */}
      <div data-depth="-2" className="absolute inset-[-12%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.22),rgb(154_123_255/0.08)_55%,transparent_75%)]" />

      <div className="glass-strong noise absolute inset-0 overflow-hidden rounded-[28px]" data-tilt="7">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-violet/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full bg-cyan/10 blur-3xl" />

        <p className="absolute left-[5%] top-[4%] flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
          <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_#5fd8f5]" />
          Pattern Engine · forward pass
        </p>

        {/* connections, pulses and neurons */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <defs>
            <radialGradient id="ne-out" cx="50%" cy="38%" r="65%">
              <stop offset="0" stopColor="#dfe8ff" stopOpacity="0.95" />
              <stop offset="0.35" stopColor="#6c97ff" stopOpacity="0.7" />
              <stop offset="1" stopColor="#141a3a" stopOpacity="0.95" />
            </radialGradient>
          </defs>
          {EDGES.map((e, i) => (
            <path key={`e${i}`} className="ne-edge" data-in={e.l === 0 ? e.a : undefined} d={e.d} />
          ))}
          {EDGES.filter((e) => e.wave).map((e, i) => (
            <path
              key={`p${i}`}
              className="ne-pulse"
              data-tone={e.wave === 2 ? "violet" : "cyan"}
              pathLength={100}
              d={e.d}
              style={{ animationDelay: `${e.delay.toFixed(2)}s` }}
            />
          ))}
          {LAYER_Y.map((col, l) =>
            l === OUT
              ? null
              : col.map((y, i) => (
                  <g key={`n${l}-${i}`} data-in={l === 0 ? i : undefined} className="ne-neuron">
                    <circle cx={X[l]} cy={y} r="2" className="ne-halo" style={{ animationDelay: `${(l * STEP + (i % 2 ? CYCLE / 2 : 0)).toFixed(2)}s` }} />
                    <circle cx={X[l]} cy={y} r="1.05" className="ne-node" data-tone={i % 2 ? "violet" : "cyan"} style={{ animationDelay: `${(l * STEP + (i % 2 ? CYCLE / 2 : 0)).toFixed(2)}s` }} />
                    <circle cx={X[l]} cy={y} r="1.75" className="ne-ring" />
                  </g>
                )),
          )}
          {/* the output neuron */}
          <circle cx={X[OUT]} cy="50" r="7.6" className="ne-out-ring" style={{ animationDelay: `${(OUT * STEP).toFixed(2)}s` }} />
          <circle cx={X[OUT]} cy="50" r="7.6" className="ne-out-ring" style={{ animationDelay: `${(OUT * STEP + CYCLE / 2).toFixed(2)}s` }} />
          <circle cx={X[OUT]} cy="50" r="6" fill="url(#ne-out)" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.2" />
          <text x={X[OUT]} y="51.6" textAnchor="middle" className="ne-out-text">0%</text>
        </svg>

        {/* input labels */}
        {ENGINE_SIGNALS.map((name, i) => (
          <div
            key={name}
            data-in={i}
            className="ne-chip absolute right-[69.5%] flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap"
            style={{ top: `${LAYER_Y[0][i]}%` }}
          >
            <span className="hidden text-[10.5px] sm:inline">{name}</span>
            <span className="font-mono text-[10px] text-fg-subtle">0{i + 1}</span>
          </div>
        ))}

        {/* layer captions */}
        {CAPTIONS.map((c, l) => (
          <span
            key={c}
            className="absolute bottom-[4.5%] -translate-x-1/2 whitespace-nowrap font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-subtle"
            style={{ left: `${X[l]}%` }}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
