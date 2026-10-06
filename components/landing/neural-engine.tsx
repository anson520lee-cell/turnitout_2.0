"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { ENGINE_SIGNALS } from "./engine-core";

/**
 * The Pattern Engine as a live instrument panel. Decorative (aria-hidden); the
 * signals are listed in text beside it.
 *
 * It is a real, tiny network running real forward passes, drawn on a canvas:
 * about every 1.6 seconds a new sample arrives (six random signal values),
 * the values are multiplied through fixed random weights layer by layer
 * (tanh units), and a sigmoid turns the last sum into the estimate. What is
 * drawn is that arithmetic: each neuron glows by its activation, each
 * connection by weight × activation (cyan positive, violet negative), packets
 * ride the wavefront as it crosses the layers, and the dial scrambles while
 * the pass is in flight, then lands on the result. So the estimate moves
 * across the whole 0–100% range, sample after sample.
 *
 * The sample's strongest signal is marked and its row in the list lit; hover
 * a row to pin the marker to that signal. Sample values are random: this
 * illustrates how signals are weighed, it is not a reading of any text.
 */

const LAYERS = [ENGINE_SIGNALS.length, 10, 10, 6, 1];
const OUT = LAYERS.length - 1;
const X = [0.34, 0.47, 0.6, 0.72, 0.872]; // layer x, fraction of the panel
const TOP = 0.215;
const BOTTOM = 0.815;
const PERIOD = 1.6; // seconds per sample
const ARRIVE = [0.1, 0.27, 0.44, 0.61, 0.78]; // when the wavefront reaches each layer (fraction of the period)
const CAPTIONS = ["IN·6", "H1·10", "H2·10", "H3·6", "OUT"];
const SHORT = ["Variation", "Repetition", "Transitions", "Phrasing", "Lexical", "Paragraphs"];
const CORNERS = [
  [0, 0, 1, 1],
  [1, 0, -1, 1],
  [0, 1, 1, -1],
  [1, 1, -1, -1],
];

const CYAN = "95,216,245";
const VIOLET = "178,132,255";
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
    let latency = 0.84;

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
      latency = rnd(0.62, 1.38);
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
      const d = cs.getPropertyValue("--font-space-grotesk").trim();
      if (m) mono = `${m}, ui-monospace, monospace`;
      if (d) display = `${d}, ui-sans-serif, sans-serif`;
    }

    let attention = -1;
    function setAttention(i: number) {
      if (i === attention) return;
      attention = i;
      listItems.current.forEach((row, k) => row?.style.setProperty("--on", k === i ? "1" : "0"));
    }

    function draw(u: number, time: number) {
      const k = s / 560; // scale relative to the design size
      const small = s < 400;
      c.clearRect(0, 0, s, s);

      // ── grid and corner brackets
      c.lineWidth = 1;
      c.strokeStyle = "rgba(130,170,255,0.055)";
      c.beginPath();
      const step = 28 * k;
      for (let g = step; g < s; g += step) {
        c.moveTo(g, 0);
        c.lineTo(g, s);
        c.moveTo(0, g);
        c.lineTo(s, g);
      }
      c.stroke();
      c.strokeStyle = `rgba(${CYAN},0.7)`;
      c.lineWidth = 1.4;
      const m = 14 * k;
      const b = 16 * k;
      c.beginPath();
      for (const q of CORNERS) {
        const cx = q[0] ? s - m : m;
        const cy = q[1] ? s - m : m;
        c.moveTo(cx + q[2] * b, cy);
        c.lineTo(cx, cy);
        c.lineTo(cx, cy + q[3] * b);
      }
      c.stroke();

      // ── header
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      c.font = `600 ${Math.max(10, 12.5 * k)}px ${display}`;
      c.fillStyle = "rgba(235,242,255,0.95)";
      c.fillText("PATTERN ENGINE", 34 * k, 50 * k);
      c.font = `${Math.max(8.5, 9.5 * k)}px ${mono}`;
      c.fillStyle = `rgba(${CYAN},0.85)`;
      c.fillText("INFERENCE · LIVE", 34 * k, 66 * k);
      c.textAlign = "right";
      c.fillStyle = "rgba(170,190,235,0.8)";
      c.fillText(`SAMPLE #${String(sample).padStart(6, "0")}`, s - 34 * k, 50 * k);
      c.fillStyle = "rgba(140,160,210,0.7)";
      c.fillText(small ? `Δt ${latency.toFixed(2)} ms` : `Δt ${latency.toFixed(2)} ms · 6→10→10→6→1`, s - 34 * k, 66 * k);
      // progress of this pass, as a hairline under the header
      c.fillStyle = "rgba(130,170,255,0.14)";
      c.fillRect(34 * k, 78 * k, s - 68 * k, 1);
      c.fillStyle = `rgba(${CYAN},0.9)`;
      c.fillRect(34 * k, 78 * k, (s - 68 * k) * clamp(u), 1.5);

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

      // ── connections: brightness = |weight × activation of the source|
      const front = (u - ARRIVE[0]) / (ARRIVE[1] - ARRIVE[0]); // in layer units
      c.lineCap = "round";
      for (let l = 0; l < OUT; l++) {
        const x1 = X[l] * s;
        const x2 = X[l + 1] * s;
        for (let i = 0; i < LAYERS[l]; i++) {
          const a = Math.abs(act[l][i]);
          const y1 = ny(l, i);
          const pinned = l === 0 && i === hot;
          for (let j = 0; j < LAYERS[l + 1]; j++) {
            const w = W[l][i][j];
            const strength = Math.abs(w) * a;
            const al = 0.035 + strength * (pinned ? 0.85 : 0.42);
            if (al < 0.05 && !pinned) continue;
            c.strokeStyle = `rgba(${w >= 0 ? CYAN : VIOLET},${Math.min(0.95, al).toFixed(3)})`;
            c.lineWidth = (pinned ? 0.9 : 0.5) + strength * 0.9;
            c.beginPath();
            c.moveTo(x1, y1);
            c.lineTo(x2, ny(l + 1, j));
            c.stroke();
          }
        }
        // packets riding the wavefront across this gap
        if (front >= l && front <= l + 1 && !reduce) {
          const t = front - l;
          for (let i = 0; i < LAYERS[l]; i++) {
            const a = Math.abs(tgt[l][i]);
            if (a < 0.25) continue;
            const y1 = ny(l, i);
            for (let j = 0; j < LAYERS[l + 1]; j++) {
              const w = W[l][i][j];
              if (Math.abs(w) * a < 0.42) continue;
              const px = x1 + (x2 - x1) * t;
              const py = y1 + (ny(l + 1, j) - y1) * t;
              c.fillStyle = `rgba(${w >= 0 ? CYAN : VIOLET},0.22)`;
              c.beginPath();
              c.arc(px, py, 4.2 * k, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = "rgba(240,250,255,0.95)";
              c.beginPath();
              c.arc(px, py, 1.3 * k, 0, Math.PI * 2);
              c.fill();
            }
          }
          // the wavefront itself (not across the dial)
          if (l === OUT - 1) continue;
          const fx = x1 + (x2 - x1) * t;
          const g = c.createLinearGradient(fx - 26 * k, 0, fx, 0);
          g.addColorStop(0, `rgba(${CYAN},0)`);
          g.addColorStop(1, `rgba(${CYAN},0.1)`);
          c.fillStyle = g;
          c.fillRect(fx - 26 * k, TOP * s - 14 * k, 26 * k, (BOTTOM - TOP) * s + 28 * k);
          c.fillStyle = `rgba(${CYAN},0.5)`;
          c.fillRect(fx, TOP * s - 14 * k, 1, (BOTTOM - TOP) * s + 28 * k);
        }
      }

      // ── layer rails and captions
      c.textAlign = "center";
      c.font = `${Math.max(8, 9 * k)}px ${mono}`;
      for (let l = 0; l < LAYERS.length; l++) {
        const x = X[l] * s;
        if (l < OUT) {
          c.strokeStyle = "rgba(140,175,255,0.16)";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(x, TOP * s - 14 * k);
          c.lineTo(x, BOTTOM * s + 14 * k);
          c.stroke();
        }
        c.fillStyle = "rgba(150,170,220,0.75)";
        c.fillText(CAPTIONS[l], x, s - 40 * k);
      }

      // ── neurons: a ring, a core lit by the activation, an arc gauging it
      for (let l = 0; l < OUT; l++) {
        const x = X[l] * s;
        for (let i = 0; i < LAYERS[l]; i++) {
          const y = ny(l, i);
          const v = act[l][i];
          const a = Math.abs(v);
          const col = v >= 0 ? CYAN : VIOLET;
          const r = (l === 0 ? 5.6 : 4.6) * k;
          if (a > 0.3) {
            const g = c.createRadialGradient(x, y, 0, x, y, r * 4.5);
            g.addColorStop(0, `rgba(${col},${(0.42 * a).toFixed(3)})`);
            g.addColorStop(1, `rgba(${col},0)`);
            c.fillStyle = g;
            c.beginPath();
            c.arc(x, y, r * 4.5, 0, Math.PI * 2);
            c.fill();
          }
          c.fillStyle = "rgba(6,10,24,0.95)";
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "rgba(170,195,255,0.5)";
          c.lineWidth = 1;
          c.stroke();
          c.fillStyle = `rgba(${col},${(0.18 + 0.82 * a).toFixed(3)})`;
          c.beginPath();
          c.arc(x, y, r * 0.56, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = `rgba(${col},0.95)`;
          c.lineWidth = 1.4 * k;
          c.beginPath();
          c.arc(x, y, r + 3 * k, -Math.PI / 2, -Math.PI / 2 + a * Math.PI * 2);
          c.stroke();
        }
      }

      // ── the six signals: name, live value, a level bar
      const x0 = X[0] * s;
      for (let i = 0; i < LAYERS[0]; i++) {
        const y = ny(0, i);
        const v = act[0][i];
        const on = i === hot;
        c.textAlign = "right";
        c.font = `${on ? 600 : 500} ${Math.max(9.5, 11.5 * k)}px ${display}`;
        c.fillStyle = on ? "rgba(255,255,255,0.98)" : "rgba(175,190,225,0.82)";
        c.fillText(small ? SHORT[i] : ENGINE_SIGNALS[i], x0 - 46 * k, y - 1 * k);
        c.font = `${Math.max(8.5, 9.5 * k)}px ${mono}`;
        c.fillStyle = on ? `rgba(${CYAN},1)` : "rgba(140,160,210,0.85)";
        c.fillText(v.toFixed(2), x0 - 14 * k, y + 3.4 * k);
        const bw = 74 * k;
        const bx = x0 - 46 * k - bw;
        c.fillStyle = "rgba(130,170,255,0.14)";
        c.fillRect(bx, y + 6 * k, bw, 2 * k);
        c.fillStyle = on ? `rgba(${CYAN},0.95)` : "rgba(150,180,255,0.6)";
        c.fillRect(bx + bw * (1 - v), y + 6 * k, bw * v, 2 * k);
        if (on) {
          c.fillStyle = `rgba(${CYAN},1)`;
          c.beginPath();
          c.moveTo(bx - 10 * k, y + 3.5 * k);
          c.lineTo(bx - 4 * k, y + 7 * k);
          c.lineTo(bx - 10 * k, y + 10.5 * k);
          c.closePath();
          c.fill();
        }
      }

      // ── the estimate: a dial that scrambles in flight and lands on the result
      const ox = X[OUT] * s;
      const oy = ((TOP + BOTTOM) / 2) * s;
      const R = 43 * k;
      const landed = u >= ARRIVE[OUT];
      const p = shown / 100;
      const hue = 190 + 110 * p; // cyan at 0% through violet to magenta at 100%
      const A0 = Math.PI * 0.75;
      const SWEEP = Math.PI * 1.5;
      const halo = c.createRadialGradient(ox, oy, R * 0.4, ox, oy, R * 2.1);
      halo.addColorStop(0, `hsla(${hue},95%,65%,0.22)`);
      halo.addColorStop(1, `hsla(${hue},95%,65%,0)`);
      c.fillStyle = halo;
      c.beginPath();
      c.arc(ox, oy, R * 2.1, 0, Math.PI * 2);
      c.fill();
      // two counter-rotating segmented rings
      c.save();
      c.translate(ox, oy);
      c.rotate(time * 0.5);
      c.strokeStyle = "rgba(150,185,255,0.35)";
      c.lineWidth = 1;
      c.setLineDash([10 * k, 7 * k]);
      c.beginPath();
      c.arc(0, 0, R + 13 * k, 0, Math.PI * 2);
      c.stroke();
      c.rotate(-time * 1.1);
      c.strokeStyle = `hsla(${hue},95%,70%,0.55)`;
      c.setLineDash([3 * k, 16 * k]);
      c.beginPath();
      c.arc(0, 0, R + 18 * k, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      c.setLineDash([]);
      // ticks, lit up to the value
      for (let i = 0; i <= 40; i++) {
        const ang = A0 + (SWEEP * i) / 40;
        const major = i % 5 === 0;
        const r1 = R + 3 * k;
        const r2 = R + (major ? 9 : 6.5) * k;
        c.strokeStyle = i / 40 <= p ? `hsla(${hue},95%,72%,0.95)` : "rgba(150,175,235,0.25)";
        c.lineWidth = major ? 1.4 : 1;
        c.beginPath();
        c.moveTo(ox + Math.cos(ang) * r1, oy + Math.sin(ang) * r1);
        c.lineTo(ox + Math.cos(ang) * r2, oy + Math.sin(ang) * r2);
        c.stroke();
      }
      // dial face, track and value arc
      c.fillStyle = "rgba(5,8,20,0.92)";
      c.beginPath();
      c.arc(ox, oy, R, 0, Math.PI * 2);
      c.fill();
      c.lineCap = "round";
      c.strokeStyle = "rgba(140,170,255,0.16)";
      c.lineWidth = 5 * k;
      c.beginPath();
      c.arc(ox, oy, R - 6 * k, A0, A0 + SWEEP);
      c.stroke();
      c.strokeStyle = `hsla(${hue},95%,68%,1)`;
      c.shadowColor = `hsla(${hue},95%,65%,0.9)`;
      c.shadowBlur = 12 * k;
      c.beginPath();
      c.arc(ox, oy, R - 6 * k, A0, A0 + SWEEP * Math.max(0.004, p));
      c.stroke();
      c.shadowBlur = 0;
      // the number
      c.font = `600 ${24 * k}px ${display}`;
      const label = String(Math.round(shown));
      const tw = c.measureText(label).width;
      c.textAlign = "center";
      c.fillStyle = landed ? "rgba(255,255,255,0.98)" : `hsla(${hue},95%,82%,0.9)`;
      c.fillText(label, ox - 5 * k, oy + 7 * k);
      c.font = `600 ${11 * k}px ${display}`;
      c.fillStyle = "rgba(190,205,240,0.85)";
      c.textAlign = "left";
      c.fillText("%", ox - 5 * k + tw / 2 + 1.5 * k, oy + 7 * k);
      c.textAlign = "center";
      c.font = `${Math.max(7, 7.5 * k)}px ${mono}`;
      c.fillStyle = landed ? `rgba(${CYAN},0.9)` : "rgba(160,180,225,0.75)";
      c.fillText(landed ? "ESTIMATE" : "COMPUTING", ox, oy + 21 * k);

      // ── the last estimates, as a trace under the dial
      const tw2 = 96 * k;
      const th = 26 * k;
      const tx = ox - tw2 / 2;
      const ty = oy + R + 34 * k;
      c.strokeStyle = "rgba(130,170,255,0.18)";
      c.lineWidth = 1;
      c.strokeRect(tx, ty, tw2, th);
      if (history.length > 1) {
        c.strokeStyle = `rgba(${CYAN},0.9)`;
        c.lineWidth = 1.1;
        c.beginPath();
        history.forEach((v, i) => {
          const hx = tx + (i / 23) * tw2;
          const hy = ty + th - 2 - v * (th - 4);
          if (i === 0) c.moveTo(hx, hy);
          else c.lineTo(hx, hy);
        });
        c.stroke();
      }
      c.fillStyle = "rgba(140,160,210,0.7)";
      c.fillText("LAST 24", ox, ty + th + 12 * k);
    }

    // ── the loop
    let raf = 0;
    let visible = false;
    let t0 = performance.now();
    let last = t0;
    let cycle = -1;
    let scrambleAt = 0;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      const n = Math.floor(time / PERIOD);
      const u = time / PERIOD - n;
      if (n !== cycle) {
        if (cycle >= 0) {
          history.push(tgt[OUT][0]);
          if (history.length > 24) history.shift();
        }
        cycle = n;
        forward();
      }
      // each layer eases to its new activations once the wavefront reaches it
      const rate = 1 - Math.exp(-dt * 14);
      for (let l = 0; l < LAYERS.length; l++) {
        if (u < ARRIVE[l]) continue;
        for (let i = 0; i < LAYERS[l]; i++) act[l][i] += (tgt[l][i] - act[l][i]) * rate;
      }
      if (u < ARRIVE[OUT]) {
        // still computing: the readout scrambles
        if (now - scrambleAt > 45) {
          scrambleAt = now;
          shown = Math.random() * 100;
        }
      } else {
        shown += (tgt[OUT][0] * 100 - shown) * (1 - Math.exp(-dt * 16));
      }
      draw(u, time);
    }

    resize();
    forward();
    for (let l = 0; l < LAYERS.length; l++) act[l].set(tgt[l]);
    shown = tgt[OUT][0] * 100;
    draw(1, 0);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce || !visible) draw(1, 0);
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
      if (reduce) draw(1, 0);
    });
    if (!reduce) {
      t0 = performance.now();
      last = t0;
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
      <div className="hud-panel absolute inset-0 overflow-hidden rounded-[26px]" data-tilt="7">
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      </div>
    </div>
  );
}
