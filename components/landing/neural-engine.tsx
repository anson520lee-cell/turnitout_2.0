"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { ENGINE_SIGNALS } from "./engine-core";

/**
 * The Pattern Engine as a live diagram: a three-dimensional network shaped
 * like a ball, turning slowly. The six signals sit on the outer shell, three
 * hidden layers on shells inside it, and the estimate forms at the core; the
 * pass travels inward along the spokes, neurons flash as it reaches them, a
 * ring spreads from the core when the estimate lands, and a constant stream of
 * small sparks keeps running inward between the shells. Drawn plainly: one accent colour, one
 * neutral, hairline shells. Decorative (aria-hidden); the signals are listed
 * in text beside it.
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

const LAYERS = [ENGINE_SIGNALS.length, 18, 22, 12, 1];
const OUT = LAYERS.length - 1;
const X = [0.37, 0.49, 0.61, 0.73, 0.872]; // layer x, fraction of the panel
const TOP = 0.235;
const BOTTOM = 0.82;
/** Seconds a sample takes. Uneven on purpose: quick ones, ordinary ones, and now and then a slow one. */
const nextPeriod = () => {
  const p = Math.random();
  return p < 0.35 ? 0.45 + Math.random() * 0.25 : p < 0.85 ? 0.75 + Math.random() * 0.45 : 1.4 + Math.random() * 0.6;
};
const ARRIVE = [0.1, 0.27, 0.44, 0.61, 0.78]; // when the wavefront reaches each layer (fraction of the period)
/** Shell radius per layer: inputs on the outside, the estimate at the core. */
const RADII = [1, 0.74, 0.5, 0.27, 0];
/** Each layer's neurons spread evenly over its shell (a Fibonacci sphere), each shell turned a little. */
const SHELL: number[][][] = LAYERS.map((n, l) => {
  if (n === 1) return [[0, 0, 0]];
  const r = RADII[l];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - ((i + 0.5) / n) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = i * golden + l * 1.3;
    return [Math.cos(th) * rr * r, y * r * 0.92, Math.sin(th) * rr * r];
  });
});
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
    /** Signals in flight between shells, independent of the sampled pass: spark from a neuron, run along one spoke inward. */
    const sparks: { l: number; i: number; j: number; t0: number; dur: number }[] = [];
    let sparkClock = 0;
    /** Rings that spread from the core each time an estimate lands. */
    const waves: number[] = [];
    let landedSeen = false;

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

      // ── the network as a sphere: six signals on the outer shell, three hidden
      // shells inside it, the estimate at the core. The sphere turns slowly;
      // nearer parts are brighter and larger.
      const cx = 0.43 * s;
      const cy = 0.53 * s;
      const R0 = 0.28 * s;
      const now = performance.now() / 1000;
      const yaw = reduce ? 0.6 : now * 0.22;
      const pitch = -0.32 + (reduce ? 0 : Math.sin(now * 0.27) * 0.08);
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const D = 3.4; // camera distance in shell radii
      const project = (p: number[]) => {
        const x1 = p[0] * cyw + p[2] * syw;
        const z1 = -p[0] * syw + p[2] * cyw;
        const y2 = p[1] * cp - z1 * sp;
        const z2 = p[1] * sp + z1 * cp;
        const sc = D / (D - z2);
        return { x: cx + x1 * R0 * sc, y: cy - y2 * R0 * sc, z: z2, sc };
      };
      const P = SHELL.map((layer) => layer.map(project));
      const depthA = (z: number) => 0.35 + 0.65 * ((z + 1) / 2); // back 0.35 … front 1

      // the shell itself: silhouette, equator and two meridians, hairline
      c.lineWidth = 1;
      c.strokeStyle = "rgba(150,165,215,0.2)";
      c.beginPath();
      c.arc(cx, cy, R0 * (D / Math.sqrt(D * D - 1)), 0, Math.PI * 2);
      c.stroke();
      const shellRing = (f: (a: number) => number[]) => {
        c.beginPath();
        for (let q = 0; q <= 72; q++) {
          const pt = project(f((q / 72) * Math.PI * 2));
          if (q === 0) c.moveTo(pt.x, pt.y);
          else c.lineTo(pt.x, pt.y);
        }
        c.stroke();
      };
      c.strokeStyle = "rgba(150,165,215,0.13)";
      shellRing((a) => [Math.cos(a), 0, Math.sin(a)]);
      shellRing((a) => [Math.cos(a), Math.sin(a), 0]);
      shellRing((a) => [0, Math.sin(a), Math.cos(a)]);
      for (const r of RADII.slice(1, -1)) {
        c.strokeStyle = "rgba(150,165,215,0.08)";
        shellRing((a) => [Math.cos(a) * r, 0, Math.sin(a) * r]);
      }

      // ── connections: straight spokes between shells; opacity follows
      // |weight × activation| and depth. Blue carries a positive weight, grey a negative one.
      const front = (u - ARRIVE[0]) / (ARRIVE[1] - ARRIVE[0]); // in layer units
      c.lineCap = "round";
      for (let l = 0; l < OUT; l++) {
        for (let i = 0; i < LAYERS[l]; i++) {
          const a = Math.abs(act[l][i]);
          const p1 = P[l][i];
          const pinned = l === 0 && i === hot;
          for (let j = 0; j < LAYERS[l + 1]; j++) {
            const w = W[l][i][j];
            const strength = Math.abs(w) * a;
            const p2 = P[l + 1][j];
            const dz = depthA((p1.z + p2.z) / 2);
            const al = (0.05 + strength * (pinned ? 0.75 : 0.42)) * dz;
            if (al < 0.045 && !pinned) continue;
            c.strokeStyle = `rgba(${pinned || w >= 0 ? ACCENT : NEUTRAL},${Math.min(0.9, al).toFixed(3)})`;
            c.lineWidth = ((pinned ? 0.8 : 0.45) + strength * 0.55) * (0.7 + 0.3 * dz);
            c.beginPath();
            c.moveTo(p1.x, p1.y);
            c.lineTo(p2.x, p2.y);
            c.stroke();
          }
        }
        // the pass crossing this gap: points riding the strongest spokes inward
        if (front >= l && front <= l + 1 && !reduce) {
          const t = front - l;
          for (let i = 0; i < LAYERS[l]; i++) {
            const a = Math.abs(tgt[l][i]);
            if (a < 0.25) continue;
            for (let j = 0; j < LAYERS[l + 1]; j++) {
              if (Math.abs(W[l][i][j]) * a < 0.45) continue;
              const q = SHELL[l][i];
              const r = SHELL[l + 1][j];
              const pt = project([q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t, q[2] + (r[2] - q[2]) * t]);
              c.fillStyle = `rgba(225,235,255,${(0.5 + 0.45 * depthA(pt.z)).toFixed(2)})`;
              c.beginPath();
              c.arc(pt.x, pt.y, 1.5 * k * pt.sc, 0, Math.PI * 2);
              c.fill();
            }
          }
        }
      }

      // ── the signal stream: many small sparks always running inward along the
      // spokes, faster than the pass itself, each with a short tail.
      if (!reduce) {
        // spawn ~90 a second, weighted toward strong connections
        const dtS = sparkClock ? Math.min(0.05, now - sparkClock) : 0;
        sparkClock = now;
        let want = dtS * 90;
        while (want > 0) {
          if (Math.random() < want) {
            const l = Math.floor(Math.random() * OUT);
            const i = Math.floor(Math.random() * LAYERS[l]);
            const j = Math.floor(Math.random() * LAYERS[l + 1]);
            if (Math.abs(W[l][i][j]) * (0.4 + Math.abs(act[l][i])) > 0.35) sparks.push({ l, i, j, t0: now, dur: 0.18 + Math.random() * 0.22 });
          }
          want -= 1;
        }
        for (let q = sparks.length - 1; q >= 0; q--) {
          const sp = sparks[q];
          const f = (now - sp.t0) / sp.dur;
          if (f >= 1) {
            sparks.splice(q, 1);
            continue;
          }
          const A = SHELL[sp.l][sp.i];
          const B = SHELL[sp.l + 1][sp.j];
          const head = project([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]);
          const ft = Math.max(0, f - 0.22);
          const tail = project([A[0] + (B[0] - A[0]) * ft, A[1] + (B[1] - A[1]) * ft, A[2] + (B[2] - A[2]) * ft]);
          const dz = depthA(head.z);
          const pos = W[sp.l][sp.i][sp.j] >= 0;
          const g = c.createLinearGradient(tail.x, tail.y, head.x, head.y);
          g.addColorStop(0, `rgba(${pos ? "120,170,255" : "170,180,205"},0)`);
          g.addColorStop(1, `rgba(${pos ? "190,215,255" : "200,205,220"},${(0.85 * dz).toFixed(2)})`);
          c.strokeStyle = g;
          c.lineWidth = 1.4 * k * head.sc;
          c.beginPath();
          c.moveTo(tail.x, tail.y);
          c.lineTo(head.x, head.y);
          c.stroke();
          c.fillStyle = `rgba(235,242,255,${(0.9 * dz).toFixed(2)})`;
          c.beginPath();
          c.arc(head.x, head.y, 1.3 * k * head.sc, 0, Math.PI * 2);
          c.fill();
        }
        if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
      }

      // ── neurons, back to front: a disc whose size and fill follow the activation
      const order: { l: number; i: number; z: number }[] = [];
      for (let l = 0; l < OUT; l++) for (let i = 0; i < LAYERS[l]; i++) order.push({ l, i, z: P[l][i].z });
      order.sort((a, b) => a.z - b.z);
      for (const { l, i } of order) {
        const p = P[l][i];
        const v = act[l][i];
        const a = Math.abs(v);
        const dz = depthA(p.z);
        const r = (2 + 2.6 * a) * k * p.sc * (l === 0 ? 1.15 : 1);
        // a brief flash as the pass reaches this shell
        const hit = reduce ? 0 : Math.max(0, 1 - Math.abs(u - ARRIVE[l]) / 0.07);
        if (hit > 0) {
          const fl = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
          fl.addColorStop(0, `rgba(${ACCENT},${(0.55 * hit * dz).toFixed(2)})`);
          fl.addColorStop(1, `rgba(${ACCENT},0)`);
          c.fillStyle = fl;
          c.beginPath();
          c.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "rgba(10,14,28,1)";
        c.beginPath();
        c.arc(p.x, p.y, r + 1.4 * k, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(${v >= 0 ? ACCENT : NEUTRAL},${((0.3 + 0.7 * a) * dz).toFixed(3)})`;
        c.beginPath();
        c.arc(p.x, p.y, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = `rgba(255,255,255,${(0.42 * dz).toFixed(2)})`;
        c.lineWidth = 1;
        c.stroke();
      }

      // ── the core: the estimate forming at the centre of the sphere
      {
        const p = P[OUT][0];
        const e = clamp(shown / 100);
        const landedNow = u >= ARRIVE[OUT];
        if (landedNow && !landedSeen && !reduce) waves.push(now);
        landedSeen = landedNow;
        for (let q = waves.length - 1; q >= 0; q--) {
          const f = (now - waves[q]) / 0.9;
          if (f >= 1) {
            waves.splice(q, 1);
            continue;
          }
          c.strokeStyle = `rgba(${ACCENT},${(0.5 * (1 - f)).toFixed(2)})`;
          c.lineWidth = 1.2;
          c.beginPath();
          c.arc(p.x, p.y, (8 + f * R0 * 0.55) * 1, 0, Math.PI * 2);
          c.stroke();
        }
        const glow = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26 * k);
        glow.addColorStop(0, `rgba(${ACCENT},${(0.35 + 0.35 * e).toFixed(2)})`);
        glow.addColorStop(1, `rgba(${ACCENT},0)`);
        c.fillStyle = glow;
        c.beginPath();
        c.arc(p.x, p.y, 26 * k, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "rgba(10,14,28,1)";
        c.beginPath();
        c.arc(p.x, p.y, 7.5 * k, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(${ACCENT},1)`;
        c.beginPath();
        c.arc(p.x, p.y, 5.5 * k, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "rgba(255,255,255,0.6)";
        c.lineWidth = 1;
        c.stroke();
      }

      // ── the six signals: a label beside each input node, dimmer at the back
      for (let i = 0; i < LAYERS[0]; i++) {
        const p = P[0][i];
        const on = i === hot;
        const dz = depthA(p.z);
        const right = p.x >= cx;
        const lx = p.x + (right ? 10 : -10) * k;
        c.textAlign = right ? "left" : "right";
        c.font = `${on ? 600 : 500} ${fs(10.5, 8.5)}px ${display}`;
        c.fillStyle = on ? INK : `rgba(154,163,184,${(0.25 + 0.7 * dz).toFixed(2)})`;
        c.fillText(SHORT[i], lx, p.y - 1 * k);
        c.font = `${fs(9, 7.5)}px ${mono}`;
        c.fillStyle = on ? `rgba(${ACCENT},1)` : `rgba(118,126,156,${(0.25 + 0.7 * dz).toFixed(2)})`;
        c.fillText(act[0][i].toFixed(2), lx, p.y + 10 * k);
      }

      // ── legend under the sphere
      c.textAlign = "center";
      c.font = `${fs(9.5, 8)}px ${mono}`;
      c.fillStyle = SUBTLE;
      c.fillText("6 signals  ·  3 hidden shells  ·  1 core", cx, s - 38 * k);

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
