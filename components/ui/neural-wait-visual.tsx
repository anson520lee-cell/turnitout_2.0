"use client";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The waiting visual: a small network turning slowly in 3D. Each layer is a
 * ring of neurons joined to the next by curved weights. Training steps run
 * as waves: a forward pass (cyan) flows from input to output, then the
 * gradient (violet) flows back. A loss curve settles on the left and the
 * output layer's softmax sits on the right.
 * Illustrative only; it doesn't show anything about the user's text.
 */

const LAYERS = [6, 9, 12, 9, 4];
const RADII = [0.4, 0.58, 0.66, 0.58, 0.32];
const FAN = 3;
const CYCLE = 3.2; // seconds per training step (forward + backward)
const WHITE = [233, 237, 247];
const ACCENT = [91, 140, 255];
const CYAN = [95, 216, 245];
const VIOLET = [154, 123, 255];
const MUTED = [138, 146, 174];

type RGB = number[];
interface Node { l: number; x: number; y: number; z: number; act: number; grad: number; out: number[]; inn: number[] }
interface Pulse { a: number; b: number; t: number; v: number; back: boolean }
interface P2 { x: number; y: number; d: number; z: number }

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
const ease = (t: number) => t * t * (3 - 2 * t);

function build() {
  const nodes: Node[] = [];
  const starts: number[] = [];
  LAYERS.forEach((n, l) => {
    starts.push(nodes.length);
    const x = -1.45 + (2.9 * l) / (LAYERS.length - 1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + l * 0.35;
      nodes.push({ l, x, y: Math.cos(a) * RADII[l], z: Math.sin(a) * RADII[l], act: 0, grad: 0, out: [], inn: [] });
    }
  });
  nodes.forEach((nd, idx) => {
    if (nd.l === LAYERS.length - 1) return;
    const next = LAYERS[nd.l + 1];
    const i = idx - starts[nd.l];
    const base = Math.round((i / LAYERS[nd.l]) * next);
    for (let k = -1; k < FAN - 1; k++) {
      const j = starts[nd.l + 1] + ((base + k + next) % next);
      if (!nd.out.includes(j)) { nd.out.push(j); nodes[j].inn.push(idx); }
    }
  });
  return { nodes, starts };
}

/** A soft round glow, drawn once and stamped with drawImage. */
function sprite(c: RGB) {
  const s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, rgba(c, 0.9));
  r.addColorStop(0.18, rgba(c, 0.45));
  r.addColorStop(0.5, rgba(c, 0.1));
  r.addColorStop(1, rgba(c, 0));
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return s;
}

export function NeuralWaitVisual({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const { nodes, starts } = build();
    const outStart = starts[starts.length - 1];
    const nOut = LAYERS[LAYERS.length - 1];
    const glowCyan = sprite(CYAN);
    const glowViolet = sprite(VIOLET);
    const glowWhite = sprite(WHITE);
    const pulses: Pulse[] = [];
    const bars = new Array(nOut).fill(1 / nOut);
    let target = 0;
    let w = 0, h = 0, raf = 0, visible = true;
    let last = performance.now();
    const t0 = last;
    let step = -1;
    let backSent = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cv);

    let rx = 0, ry = 0;
    const project = (x: number, y: number, z: number): P2 => {
      const y1 = y * Math.cos(rx) - z * Math.sin(rx);
      const z1 = y * Math.sin(rx) + z * Math.cos(rx);
      const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
      const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
      const d = 3.6 / (3.6 + z2);
      const s = Math.min(w * 0.29, h * 0.58);
      return { x: w / 2 + x2 * s * d, y: h * 0.42 + y1 * s * d, d, z: z2 };
    };
    // A weight is an S-curve: it leaves a neuron along the layer axis and
    // bends into the next one, like the links in a Sankey diagram.
    const curve = (a: Node, b: Node) => {
      const mx = (a.x + b.x) / 2;
      return [project(a.x, a.y, a.z), project(mx, a.y, a.z), project(mx, b.y, b.z), project(b.x, b.y, b.z)];
    };
    const at = (c: P2[], t: number) => {
      const u = 1 - t;
      const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
      return { x: c[0].x * k0 + c[1].x * k1 + c[2].x * k2 + c[3].x * k3, y: c[0].y * k0 + c[1].y * k1 + c[2].y * k2 + c[3].y * k3 };
    };

    const send = (a: number, back: boolean, delay: number) => {
      const list = back ? nodes[a].inn : nodes[a].out;
      if (!list.length) return;
      const b = list[Math.floor(Math.random() * list.length)];
      pulses.push({ a, b, t: -delay, v: back ? 1.5 : 1.25, back });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = reduce ? 4 : (now - t0) / 1000;

      // one training step: forward wave, then the gradient flows back
      const s = Math.floor(time / CYCLE);
      const phase = (time % CYCLE) / CYCLE;
      if (!reduce && s !== step) {
        step = s;
        backSent = false;
        target = Math.floor(Math.random() * nOut);
        for (let i = 0; i < LAYERS[0]; i++) { send(i, false, Math.random() * 0.15); if (Math.random() < 0.5) send(i, false, 0.1 + Math.random() * 0.2); }
      }
      if (!reduce && !backSent && phase > 0.6) {
        backSent = true;
        for (let k = 0; k < nOut; k++) { send(outStart + k, true, Math.random() * 0.1); send(outStart + k, true, 0.08 + Math.random() * 0.12); }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.v * dt;
        if (p.t < 1) continue;
        const nd = nodes[p.b];
        if (p.back) nd.grad = 1; else nd.act = 1;
        pulses.splice(i, 1);
        const more = p.back ? nd.inn.length : nd.out.length;
        if (more && pulses.length < 90) {
          send(p.b, p.back, 0);
          if (Math.random() < 0.35) send(p.b, p.back, 0.06);
        }
      }
      for (const n of nodes) { n.act = Math.max(0, n.act - dt * 1.3); n.grad = Math.max(0, n.grad - dt * 1.6); }
      if (reduce) for (const n of nodes) n.act = n.l % 2 ? 0.35 : 0.15;

      rx = reduce ? 0.55 : time * 0.16;
      ry = -0.3 + (reduce ? 0 : Math.sin(time * 0.18) * 0.08);
      const P = nodes.map((n) => project(n.x, n.y, n.z));

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";

      // layer rings
      starts.forEach((st, l) => {
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * Math.PI * 2;
          const q = project(nodes[st].x, Math.cos(a) * RADII[l], Math.sin(a) * RADII[l]);
          if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        }
        ctx.strokeStyle = rgba(l === 0 || l === LAYERS.length - 1 ? CYAN : ACCENT, 0.13);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      });

      // weights: curves, fading with depth, brighter while a neuron is active
      nodes.forEach((n, i) => {
        for (const j of n.out) {
          const c = curve(n, nodes[j]);
          const depth = Math.min(P[i].d, P[j].d);
          const live = Math.max(n.act, nodes[j].act) * 0.25 + Math.max(n.grad, nodes[j].grad) * 0.18;
          ctx.strokeStyle = rgba(ACCENT, 0.035 + 0.11 * depth ** 4 + live);
          ctx.lineWidth = 0.5 + 0.4 * depth;
          ctx.beginPath();
          ctx.moveTo(c[0].x, c[0].y);
          ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
          ctx.stroke();
        }
      });

      ctx.globalCompositeOperation = "lighter";
      // signals travel along the curves with a tapered comet tail
      for (const p of pulses) {
        if (p.t <= 0) continue;
        const A = nodes[p.back ? p.b : p.a], B = nodes[p.back ? p.a : p.b];
        const c = curve(A, B);
        const head = p.back ? 1 - ease(p.t) : ease(p.t);
        const col = p.back ? VIOLET : CYAN;
        const tail = 9;
        for (let k = 0; k < tail; k++) {
          const tt = Math.min(1, Math.max(0, head + (p.back ? 1 : -1) * k * 0.028));
          const q = at(c, tt);
          ctx.fillStyle = rgba(col, 0.75 * (1 - k / tail) ** 1.6);
          ctx.beginPath(); ctx.arc(q.x, q.y, 1.5 * (1 - k / tail) + 0.3, 0, Math.PI * 2); ctx.fill();
        }
        const q = at(c, head);
        ctx.drawImage(p.back ? glowViolet : glowCyan, q.x - 7, q.y - 7, 14, 14);
      }

      // neurons, far ones first, with depth fog
      const order = P.map((_, i) => i).sort((i, j) => P[j].z - P[i].z);
      for (const i of order) {
        const p = P[i], n = nodes[i];
        const fog = Math.min(1, Math.max(0.25, (p.d - 0.72) * 2.4));
        const out = n.l === LAYERS.length - 1;
        const glow = Math.max(n.act, n.grad);
        if (glow > 0.03) {
          const R = (10 + 14 * glow) * p.d * (out ? 1.3 : 1);
          ctx.globalAlpha = glow * fog;
          ctx.drawImage(n.grad > n.act ? glowViolet : glowCyan, p.x - R, p.y - R, R * 2, R * 2);
          ctx.globalAlpha = 1;
        }
        const r = (out ? 2.1 : 1.5) * p.d + glow * 0.9;
        ctx.globalAlpha = 0.25 * fog;
        ctx.drawImage(glowWhite, p.x - r * 3, p.y - r * 3, r * 6, r * 6);
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(WHITE, (0.4 + 0.6 * glow) * fog);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // training loss: a smooth curve with a soft fill, settling over 12 steps
      const lx = 12, lh = 22, ly = h - 16 - lh, lw = Math.min(92, w * 0.27);
      const span = 12;
      const prog = reduce ? 1 : ((time / CYCLE) % span) / span;
      const loss = (u: number) => 0.86 * Math.exp(-u * 3.6) + 0.1 + 0.035 * Math.sin(u * 37) * Math.exp(-u * 2.2);
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k <= 48 * prog; k++) { const u = k / 48; pts.push({ x: lx + u * lw, y: ly + lh - loss(u) * lh }); }
      if (pts.length > 1) {
        const fill = ctx.createLinearGradient(0, ly, 0, ly + lh);
        fill.addColorStop(0, rgba(CYAN, 0.22)); fill.addColorStop(1, rgba(CYAN, 0));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, ly + lh);
        pts.forEach((q) => ctx.lineTo(q.x, q.y));
        ctx.lineTo(pts[pts.length - 1].x, ly + lh);
        ctx.fillStyle = fill; ctx.fill();
        ctx.beginPath();
        pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.strokeStyle = rgba(CYAN, 0.9); ctx.lineWidth = 1.2; ctx.stroke();
        const hd = pts[pts.length - 1];
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(glowCyan, hd.x - 6, hd.y - 6, 12, 12);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.strokeStyle = rgba(MUTED, 0.22); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(lx, ly + lh + 0.5); ctx.lineTo(lx + lw, ly + lh + 0.5); ctx.stroke();
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = rgba(MUTED, 0.85);
      ctx.fillText(`loss · step ${reduce ? 12 : Math.floor((time / CYCLE) % span) + 1}`, lx, h - 4);

      // softmax: the output layer leans towards this step's target class
      const sharp = 1.2 + 3.8 * ease(Math.min(1, prog * 1.2));
      const raw = bars.map((_, k) => Math.exp((k === target ? sharp : 0) + nodes[outStart + k].act));
      const sum = raw.reduce((a, b) => a + b, 0);
      const bw = 8, gap = 5, bx = w - 12 - nOut * (bw + gap) + gap;
      bars.forEach((v, k) => {
        bars[k] = v + (raw[k] / sum - v) * Math.min(1, dt * 3);
        const H = Math.max(2, bars[k] * lh);
        const g = ctx.createLinearGradient(0, ly + lh - H, 0, ly + lh);
        g.addColorStop(0, rgba(k === target ? CYAN : ACCENT, 0.95)); g.addColorStop(1, rgba(VIOLET, 0.35));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(bx + k * (bw + gap), ly + lh - H, bw, H, [2, 2, 0, 0]);
        ctx.fill();
      });
      ctx.strokeStyle = rgba(MUTED, 0.22);
      ctx.beginPath(); ctx.moveTo(bx - 2, ly + lh + 0.5); ctx.lineTo(w - 12, ly + lh + 0.5); ctx.stroke();
      ctx.fillStyle = rgba(MUTED, 0.85);
      ctx.fillText("softmax", bx - 2, h - 4);

      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden className={cn("block", className)} />;
}
