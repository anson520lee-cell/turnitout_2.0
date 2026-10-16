"use client";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The waiting visual: a small network turning in 3D, with signals running
 * forward layer by layer (a forward pass), a training-loss curve settling
 * on the left and the output layer's softmax bars on the right.
 * Illustrative only; it doesn't show anything about the user's text.
 */

const LAYERS = [7, 10, 12, 10, 4];
const RADII = [0.42, 0.6, 0.68, 0.6, 0.34];
const FAN = 3;
const ACCENT = [91, 140, 255];
const CYAN = [95, 216, 245];
const VIOLET = [154, 123, 255];

interface Node { l: number; x: number; y: number; z: number; glow: number; out: number[] }
interface Pulse { a: number; b: number; t: number; v: number; hops: number }

function build() {
  const nodes: Node[] = [];
  const starts: number[] = [];
  LAYERS.forEach((n, l) => {
    starts.push(nodes.length);
    const x = -1.4 + (2.8 * l) / (LAYERS.length - 1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + l * 0.4;
      nodes.push({ l, x, y: Math.cos(a) * RADII[l], z: Math.sin(a) * RADII[l], glow: 0, out: [] });
    }
  });
  nodes.forEach((nd, idx) => {
    if (nd.l === LAYERS.length - 1) return;
    const next = LAYERS[nd.l + 1];
    const i = idx - starts[nd.l];
    const base = Math.round((i / LAYERS[nd.l]) * next);
    for (let k = 0; k < FAN; k++) nd.out.push(starts[nd.l + 1] + ((base + k * Math.ceil(next / FAN) + next) % next));
  });
  return { nodes, starts };
}

const mix = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function NeuralWaitVisual({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { nodes, starts } = build();
    const outStart = starts[starts.length - 1];
    const pulses: Pulse[] = [];
    const bars = new Array(LAYERS[LAYERS.length - 1]).fill(0.25);
    let w = 0, h = 0, raf = 0, last = performance.now(), spawn = 0, visible = true;
    const t0 = last;

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

    const project = (n: Node, rx: number, ry: number) => {
      // spin the tube around its axis, then tilt it towards the viewer
      const y1 = n.y * Math.cos(rx) - n.z * Math.sin(rx);
      const z1 = n.y * Math.sin(rx) + n.z * Math.cos(rx);
      const x2 = n.x * Math.cos(ry) + z1 * Math.sin(ry);
      const z2 = -n.x * Math.sin(ry) + z1 * Math.cos(ry);
      const d = 3.4 / (3.4 + z2);
      const s = Math.min(w * 0.3, h * 0.6);
      return { x: w / 2 + x2 * s * d, y: h * 0.44 + y1 * s * d, d, z: z2 };
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      if (!visible && !reduce) { raf = requestAnimationFrame(frame); return; }

      // forward pass: new signals enter at the input layer
      spawn -= dt;
      if (!reduce && spawn <= 0 && pulses.length < 70) {
        spawn = 0.07;
        const a = Math.floor(Math.random() * LAYERS[0]);
        const b = nodes[a].out[Math.floor(Math.random() * FAN)];
        pulses.push({ a, b, t: 0, v: 1.6 + Math.random() * 0.8, hops: 0 });
        nodes[a].glow = 1;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.v * dt;
        if (p.t < 1) continue;
        const nd = nodes[p.b];
        nd.glow = 1;
        if (nd.out.length && Math.random() < 0.8) {
          pulses[i] = { a: p.b, b: nd.out[Math.floor(Math.random() * FAN)], t: 0, v: p.v, hops: p.hops + 1 };
        } else {
          pulses.splice(i, 1);
        }
      }
      for (const n of nodes) n.glow = Math.max(0, n.glow - dt * 1.8);

      const rx = reduce ? 0.6 : time * 0.35;
      const ry = reduce ? -0.32 : -0.32 + Math.sin(time * 0.25) * 0.1;
      const P = nodes.map((n) => project(n, rx, ry));

      ctx.clearRect(0, 0, w, h);
      // each layer as a faint ring, so the depth reads
      ctx.lineWidth = 0.8;
      starts.forEach((st, l) => {
        ctx.strokeStyle = mix(l % 2 ? VIOLET : CYAN, 0.16);
        ctx.beginPath();
        for (let k = 0; k <= 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          const q = project({ l, x: nodes[st].x, y: Math.cos(a) * RADII[l], z: Math.sin(a) * RADII[l], glow: 0, out: [] }, rx, ry);
          if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        }
        ctx.stroke();
      });
      // weights
      ctx.lineWidth = 0.6;
      nodes.forEach((n, i) => {
        for (const j of n.out) {
          const a = P[i], b = P[j];
          ctx.strokeStyle = mix(ACCENT, 0.05 + 0.1 * Math.min(a.d, b.d) ** 3);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      });
      ctx.globalCompositeOperation = "lighter";
      // signals with short trails
      for (const p of pulses) {
        const a = P[p.a], b = P[p.b];
        const c = p.hops % 2 ? VIOLET : CYAN;
        const t2 = Math.max(0, p.t - 0.25);
        const g = ctx.createLinearGradient(a.x + (b.x - a.x) * t2, a.y + (b.y - a.y) * t2, a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t);
        g.addColorStop(0, mix(c, 0)); g.addColorStop(1, mix(c, 0.9));
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(a.x + (b.x - a.x) * t2, a.y + (b.y - a.y) * t2);
        ctx.lineTo(a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t);
        ctx.stroke();
      }
      // neurons, far ones first
      const order = P.map((p, i) => i).sort((i, j) => P[j].z - P[i].z);
      for (const i of order) {
        const p = P[i], n = nodes[i];
        const r = (1.4 + n.glow * 1.6) * p.d * (n.l === LAYERS.length - 1 ? 1.5 : 1);
        if (n.glow > 0.05) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
          g.addColorStop(0, mix(n.l % 2 ? VIOLET : CYAN, 0.45 * n.glow));
          g.addColorStop(1, mix(ACCENT, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = mix([233, 237, 247], 0.35 + 0.55 * Math.max(n.glow, (p.d - 0.75) * 1.5));
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // training loss, settling and restarting every 10 s
      const lx = 10, ly = h - 34, lw = Math.min(96, w * 0.28), lh = 24;
      const cyc = reduce ? 1 : 0.15 + 0.85 * ((time % 10) / 10);
      ctx.strokeStyle = mix([138, 146, 174], 0.25); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + lh); ctx.lineTo(lx + lw, ly + lh); ctx.stroke();
      ctx.strokeStyle = mix(CYAN, 0.85); ctx.lineWidth = 1.2;
      ctx.beginPath();
      const steps = Math.max(2, Math.floor(cyc * 60));
      for (let k = 0; k <= steps; k++) {
        const u = k / 60;
        const v = 0.9 * Math.exp(-u * 4) + 0.08 + 0.05 * Math.sin(k * 2.7) * Math.exp(-u * 2);
        const X = lx + u * lw, Y = ly + lh - Math.min(1, v) * lh;
        if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = mix([138, 146, 174], 0.9);
      ctx.fillText("loss ↓", lx, h - 4);

      // softmax over the output layer, following which outputs fire
      const raw = bars.map((_, k) => Math.exp(2.5 * nodes[outStart + k].glow));
      const sum = raw.reduce((a, b) => a + b, 0);
      const bw = 7, gap = 4, bx = w - 10 - LAYERS[LAYERS.length - 1] * (bw + gap), bh = 24;
      bars.forEach((v, k) => {
        bars[k] = v + (raw[k] / sum - v) * Math.min(1, dt * 4);
        const H = Math.max(2, bars[k] * bh * 1.6);
        ctx.fillStyle = mix(k % 2 ? VIOLET : ACCENT, 0.8);
        ctx.fillRect(bx + k * (bw + gap), ly + lh - H, bw, H);
      });
      ctx.fillStyle = mix([138, 146, 174], 0.9);
      ctx.fillText("softmax", bx, h - 4);

      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden className={cn("block", className)} />;
}
