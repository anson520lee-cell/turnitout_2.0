"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { ENGINE_SIGNALS } from "./engine-core";

/**
 * The Pattern Engine as a live diagram, drawn plainly: one accent colour, one
 * neutral, no ornament. Decorative (aria-hidden); the signals are listed in
 * text beside it.
 *
 * It is a real, tiny network running real forward passes, drawn on a canvas:
 * a new sample arrives every one to five seconds (six random signal values;
 * the pace is uneven, some passes quick and some slow),
 * the values are multiplied through fixed random weights layer by layer
 * (tanh units), and a sigmoid turns the last sum into the estimate. What is
 * drawn is that arithmetic: each neuron's size and fill follow its
 * activation, each connection's opacity follows weight × activation (blue
 * positive, grey negative), points ride the pass across the layers, and the
 * estimate hunts while the pass is in flight (wide jumps at first, then
 * slower and closer as the answer firms up), then settles on the result. So the estimate moves
 * across the whole 0–100% range, sample after sample.
 *
 * The sample's strongest signal is marked and its row in the list lit; hover
 * a row to pin the marker to that signal. Sample values are random: this
 * illustrates how signals are weighed, it is not a reading of any text.
 */

const LAYERS = [ENGINE_SIGNALS.length, 10, 10, 6, 1];
const OUT = LAYERS.length - 1;
const X = [0.37, 0.49, 0.61, 0.73, 0.872]; // layer x, fraction of the panel
const TOP = 0.235;
const BOTTOM = 0.82;
/** Seconds a sample takes. Uneven on purpose: quick ones, ordinary ones, and now and then a slow one. */
const nextPeriod = () => {
  const p = Math.random();
  return p < 0.3 ? 0.8 + Math.random() * 0.5 : p < 0.8 ? 1.5 + Math.random() * 1.1 : 3 + Math.random() * 1.8;
};
const ARRIVE = [0.1, 0.27, 0.44, 0.61, 0.78]; // when the wavefront reaches each layer (fraction of the period)
const CAPTIONS = ["Signals", "Hidden", "Hidden", "Hidden", "Estimate"];
const SHORT = ["Variation", "Repetition", "Transitions", "Phrasing", "Lexical", "Paragraphs"];
// A restrained palette: one accent, one neutral, three greys for text.
const ACCENT = "91,140,255";
const NEUTRAL = "150,160,190";
const INK = "rgba(233,237,247,0.96)";
const MUTED = "rgba(154,163,184,0.95)";
const SUBTLE = "rgba(118,126,156,0.95)";
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = root.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;
    const el = host;
    const c = ctx;
    const cv = canvas;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── the network: fixed random weights, tanh hidden units, a sigmoid output
    const W: number[][][] = [];
    const B: number[][] = [];
    for (let l = 0; l < OUT; l++) {
      W.push(Array.from({ length: LAYERS[l] }, () => Array.from({ length: LAYERS[l + 1] }, () => rnd(-1, 1))));
      B.push(Array.from({ length: LAYERS[l + 1] }, () => rnd(-0.3, 0.3)));
    }
    const act = LAYERS.map((n) => new Float32Array(n)); // what is drawn
    const tgt = LAYERS.map((n) => new Float32Array(n)); // this sample's true activations
    const history: number[] = [];
    let sample = 4096 + Math.floor(Math.random() * 900);
    let shown = 0; // the number on the dial

    function forward() {
      for (let i = 0; i < LAYERS[0]; i++) tgt[0][i] = Math.random();
      for (let l = 0; l < OUT; l++) {
        const last = l === OUT - 1;
        for (let j = 0; j < LAYERS[l + 1]; j++) {
          let z = B[l][j];
          for (let i = 0; i < LAYERS[l]; i++) z += W[l][i][j] * (l === 0 ? tgt[l][i] * 2 - 1 : tgt[l][i]);
          z /= Math.sqrt(LAYERS[l]) * 0.5;
          tgt[l + 1][j] = last ? 1 / (1 + Math.exp(-z * 2.4)) : Math.tanh(z * 1.3);
        }
      }
      sample++;
    }

    // ── geometry
    let s = 1; // panel size in CSS px
    let mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    let display = "ui-sans-serif, system-ui, sans-serif";
    const ny = (l: number, i: number) => {
      const n = LAYERS[l];
      return n === 1 ? ((TOP + BOTTOM) / 2) * s : (TOP + ((BOTTOM - TOP) * i) / (n - 1)) * s;
    };

    function resize() {
      s = Math.max(200, el.getBoundingClientRect().width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(s * dpr);
      cv.height = Math.round(s * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cs = getComputedStyle(document.documentElement);
      const m = cs.getPropertyValue("--font-geist-mono").trim();
      const d = cs.getPropertyValue("--font-geist-sans").trim();
      if (m) mono = `${m}, ui-monospace, monospace`;
      if (d) display = `${d}, ui-sans-serif, sans-serif`;
    }

    let attention = -1;
    function setAttention(i: number) {
      if (i === attention) return;
      attention = i;
      listItems.current.forEach((row, k) => row?.style.setProperty("--on", k === i ? "1" : "0"));
    }

    function draw(u: number) {
      const k = s / 560; // scale relative to the design size
      const small = s < 400;
      const fs = (px: number, min: number) => Math.max(min, px * k);
      c.clearRect(0, 0, s, s);
      c.textBaseline = "alphabetic";

      // ── header: title, what this is, and a hairline that fills as the pass runs
      c.textAlign = "left";
      c.font = `600 ${fs(15, 12)}px ${display}`;
      c.fillStyle = INK;
      c.fillText("Pattern Engine", 36 * k, 52 * k);
      c.font = `${fs(11.5, 9.5)}px ${display}`;
      c.fillStyle = MUTED;
      c.fillText(small ? "Forward pass, illustrative" : "Forward pass on a random sample, illustrative", 36 * k, 71 * k);
      c.textAlign = "right";
      c.font = `${fs(10.5, 9)}px ${mono}`;
      c.fillStyle = SUBTLE;
      c.fillText(`sample ${sample.toLocaleString("en-US")}`, s - 36 * k, 52 * k);
      c.fillStyle = "rgba(148,163,255,0.14)";
      c.fillRect(36 * k, 86 * k, s - 72 * k, 1);
      c.fillStyle = `rgba(${ACCENT},0.85)`;
      c.fillRect(36 * k, 86 * k, (s - 72 * k) * clamp(u), 1);

      // ── which input is marked: the pinned one, else this sample's strongest
      let hot = focus.current ?? -1;
      if (hot < 0) {
        let best = -1;
        for (let i = 0; i < LAYERS[0]; i++) {
          if (tgt[0][i] > best) {
            best = tgt[0][i];
            hot = i;
          }
        }
      }
      setAttention(hot);

      // ── connections: smooth curves; opacity = |weight × activation of the source|.
      // Blue carries a positive weight, grey a negative one.
      const front = (u - ARRIVE[0]) / (ARRIVE[1] - ARRIVE[0]); // in layer units
      c.lineCap = "round";
      for (let l = 0; l < OUT; l++) {
        const x1 = X[l] * s;
        const x2 = X[l + 1] * s;
        const xm = (x1 + x2) / 2;
        for (let i = 0; i < LAYERS[l]; i++) {
          const a = Math.abs(act[l][i]);
          const y1 = ny(l, i);
          const pinned = l === 0 && i === hot;
          for (let j = 0; j < LAYERS[l + 1]; j++) {
            const w = W[l][i][j];
            const strength = Math.abs(w) * a;
            const al = 0.03 + strength * (pinned ? 0.7 : 0.3);
            if (al < 0.045 && !pinned) continue;
            c.strokeStyle = `rgba(${pinned || w >= 0 ? ACCENT : NEUTRAL},${Math.min(0.9, al).toFixed(3)})`;
            c.lineWidth = (pinned ? 0.8 : 0.5) + strength * 0.6;
            c.beginPath();
            c.moveTo(x1, y1);
            c.bezierCurveTo(xm, y1, xm, ny(l + 1, j), x2, ny(l + 1, j));
            c.stroke();
          }
        }
        // the pass crossing this gap: small points riding the strongest connections
        if (front >= l && front <= l + 1 && !reduce) {
          const t = front - l;
          const v = 1 - t;
          for (let i = 0; i < LAYERS[l]; i++) {
            const a = Math.abs(tgt[l][i]);
            if (a < 0.25) continue;
            const y1 = ny(l, i);
            for (let j = 0; j < LAYERS[l + 1]; j++) {
              if (Math.abs(W[l][i][j]) * a < 0.45) continue;
              const y2 = ny(l + 1, j);
              const px = v * v * v * x1 + 3 * v * v * t * xm + 3 * v * t * t * xm + t * t * t * x2;
              const py = v * v * v * y1 + 3 * v * v * t * y1 + 3 * v * t * t * y2 + t * t * t * y2;
              c.fillStyle = "rgba(225,235,255,0.95)";
              c.beginPath();
              c.arc(px, py, 1.5 * k, 0, Math.PI * 2);
              c.fill();
            }
          }
        }
      }

      // ── neurons: a disc whose size and fill follow the activation
      for (let l = 0; l < OUT; l++) {
        const x = X[l] * s;
        for (let i = 0; i < LAYERS[l]; i++) {
          const y = ny(l, i);
          const v = act[l][i];
          const a = Math.abs(v);
          const r = (2.6 + 3.4 * a) * k;
          c.fillStyle = "rgba(10,14,28,1)";
          c.beginPath();
          c.arc(x, y, r + 1.5 * k, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = `rgba(${v >= 0 ? ACCENT : NEUTRAL},${(0.35 + 0.65 * a).toFixed(3)})`;
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "rgba(255,255,255,0.4)";
          c.lineWidth = 1;
          c.stroke();
        }
      }

      // ── layer captions
      c.textAlign = "center";
      c.font = `${fs(10.5, 9)}px ${display}`;
      c.fillStyle = SUBTLE;
      for (let l = 0; l < LAYERS.length; l++) c.fillText(CAPTIONS[l], X[l] * s, s - 38 * k);

      // ── the six signals: name, value, a level bar
      const x0 = X[0] * s;
      const bw = 92 * k;
      for (let i = 0; i < LAYERS[0]; i++) {
        const y = ny(0, i);
        const v = act[0][i];
        const on = i === hot;
        c.textAlign = "right";
        c.font = `${on ? 600 : 500} ${fs(12, 10)}px ${display}`;
        c.fillStyle = on ? INK : MUTED;
        c.fillText(small ? SHORT[i] : ENGINE_SIGNALS[i], x0 - 18 * k, y - 2 * k);
        c.font = `${fs(10, 8.5)}px ${mono}`;
        c.fillStyle = on ? `rgba(${ACCENT},1)` : SUBTLE;
        c.fillText(v.toFixed(2), x0 - 18 * k - bw - 8 * k, y + 10.5 * k);
        const bx = x0 - 18 * k - bw;
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(bx, y + 6 * k, bw, 2.5 * k);
        c.fillStyle = on ? `rgba(${ACCENT},1)` : `rgba(${ACCENT},0.5)`;
        c.fillRect(bx, y + 6 * k, bw * v, 2.5 * k);
      }

      // ── the estimate: a ring that fills to the value. While the pass is in
      // flight the number hunts; when it arrives it settles.
      const ox = X[OUT] * s;
      const oy = ((TOP + BOTTOM) / 2) * s;
      const R = 44 * k;
      const landed = u >= ARRIVE[OUT];
      const p = clamp(shown / 100);
      c.lineCap = "round";
      c.strokeStyle = "rgba(255,255,255,0.09)";
      c.lineWidth = 6 * k;
      c.beginPath();
      c.arc(ox, oy, R, 0, Math.PI * 2);
      c.stroke();
      const ring = c.createLinearGradient(ox - R, oy - R, ox + R, oy + R);
      ring.addColorStop(0, "rgba(140,180,255,1)");
      ring.addColorStop(1, `rgba(${ACCENT},1)`);
      c.strokeStyle = ring;
      c.beginPath();
      c.arc(ox, oy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.004, p));
      c.stroke();
      c.font = `600 ${27 * k}px ${display}`;
      const label = String(Math.round(shown));
      const tw = c.measureText(label).width;
      c.textAlign = "center";
      c.fillStyle = landed ? INK : "rgba(200,212,240,0.82)";
      c.fillText(label, ox - 5 * k, oy + 9 * k);
      c.font = `500 ${12 * k}px ${display}`;
      c.fillStyle = MUTED;
      c.textAlign = "left";
      c.fillText("%", ox - 5 * k + tw / 2 + 2 * k, oy + 9 * k);

      // ── recent estimates, as a plain trace
      const tw2 = 96 * k;
      const th = 24 * k;
      const tx = ox - tw2 / 2;
      const ty = oy + R + 30 * k;
      c.fillStyle = "rgba(255,255,255,0.08)";
      c.fillRect(tx, ty + th, tw2, 1);
      if (history.length > 1) {
        c.strokeStyle = "rgba(170,185,220,0.75)";
        c.lineWidth = 1.2;
        c.lineJoin = "round";
        c.beginPath();
        let hx = tx;
        let hy = ty;
        history.forEach((v, i) => {
          hx = tx + (i / 23) * tw2;
          hy = ty + th - 2 - v * (th - 4);
          if (i === 0) c.moveTo(hx, hy);
          else c.lineTo(hx, hy);
        });
        c.stroke();
        c.fillStyle = `rgba(${ACCENT},1)`;
        c.beginPath();
        c.arc(hx, hy, 2.2 * k, 0, Math.PI * 2);
        c.fill();
      }
      c.textAlign = "center";
      c.font = `${fs(10, 8.5)}px ${display}`;
      c.fillStyle = SUBTLE;
      c.fillText("Recent samples", ox, ty + th + 15 * k);
    }

    // ── the loop
    let raf = 0;
    let visible = false;
    let last = performance.now();
    let u = 0; // progress through the current sample, 0…1
    let period = nextPeriod();
    let nextJump = 0; // when the dial next changes while computing

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      // never negative: the observer may stamp `last` a hair after this frame's own timestamp
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      u += dt / period;
      if (u >= 1) {
        u = 0;
        period = nextPeriod();
        history.push(tgt[OUT][0]);
        if (history.length > 24) history.shift();
        forward();
      }
      // each layer eases to its new activations once the wavefront reaches it
      const rate = 1 - Math.exp(-dt * 14);
      for (let l = 0; l < LAYERS.length; l++) {
        if (u < ARRIVE[l]) continue;
        for (let i = 0; i < LAYERS[l]; i++) act[l][i] += (tgt[l][i] - act[l][i]) * rate;
      }
      if (u < ARRIVE[OUT]) {
        // Still computing: the readout hunts for the answer. Early on it
        // jumps anywhere, often; as the pass nears the output the jumps come
        // slower and stay closer to where it will land.
        if (now >= nextJump) {
          const near = Math.pow(clamp(u / ARRIVE[OUT]), 1.6);
          const target = tgt[OUT][0] * 100;
          shown = clamp((target + (Math.random() * 100 - target) * (1 - near * 0.85)) / 100) * 100;
          nextJump = now + (55 + near * 300) * (0.5 + Math.random()) * Math.min(1.8, period / 1.6);
        }
      } else {
        shown += (tgt[OUT][0] * 100 - shown) * (1 - Math.exp(-dt * 16));
      }
      draw(u);
    }

    resize();
    forward();
    for (let l = 0; l < LAYERS.length; l++) act[l].set(tgt[l]);
    shown = tgt[OUT][0] * 100;
    draw(1);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce || !visible) draw(1);
    });
    ro.observe(el);
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) last = performance.now();
      },
      { rootMargin: "100px" },
    );
    io.observe(el);
    // the web fonts may land after the first draw
    void document.fonts?.ready.then(() => {
      resize();
      if (reduce) draw(1);
    });
    if (!reduce) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [focus, listItems]);

  return (
    <div ref={root} aria-hidden className="relative mx-auto aspect-square w-full max-w-[560px] select-none">
      {/* ambient glow */}
      <div data-depth="-2" className="absolute inset-[-14%] rounded-full bg-[radial-gradient(closest-side,rgb(91_140_255/0.26),rgb(154_123_255/0.1)_55%,transparent_75%)]" />
      <div className="glass-strong absolute inset-0 overflow-hidden rounded-[24px]" data-tilt="6">
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      </div>
    </div>
  );
}
