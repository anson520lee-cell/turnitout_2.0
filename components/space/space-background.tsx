"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The signed-in backdrop: deep space.
 *
 * One fixed canvas behind the app, drawn back to front:
 *  - nebula glow, a large planet in the corner (slow scroll parallax)
 *  - three depth layers of twinkling stars; scrolling pulls them into
 *    "warp" streaks proportional to scroll speed
 *  - the 0% pattern machine: a deep neural network in perspective, woven
 *    from hair-thin bowed strands. It iterates fast (an epoch every 0.8s):
 *    forward passes in cyan and backprop in violet run through each other,
 *    updated weights flash, Greek glyphs flicker on the neurons, a loss
 *    curve falls and the similarity readout converges on 0%. It turns
 *    slowly with the cursor and with scroll
 *  - meteors that fall at random, now and then in showers
 *  - a thin scroll-progress line on the top edge
 *
 * It never takes pointer events, pauses while the tab is hidden, and draws a
 * single still frame when the visitor prefers reduced motion.
 */

const GREEK = "αβγδεζηθικλμνξοπρστυφχψω";
const LAYERS = [6, 10, 14, 14, 10, 4];
const EPOCH = 0.8; // seconds per training epoch: it iterates fast
const WAVE_SPEED = 2.7; // layers a signal crosses per second
const MAX_EPOCH = 96;

interface Star { x: number; y: number; z: number; s: number; ph: number; hue: number; big: boolean }
interface Meteor { x: number; y: number; vx: number; vy: number; len: number; age: number; max: number; w: number; violet: boolean }
interface NetNode { l: number; x: number; y: number; z: number; j: number; g: string; gt: number }
interface NetEdge { a: number; b: number; w: number; l: number; span: number; c: number; ph: number; flash: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function makeStars(n: number): Star[] {
  return Array.from({ length: n }, () => {
    const z = Math.random();
    return {
      x: Math.random(),
      y: Math.random(),
      z: 0.15 + z * 0.85,
      s: 0.5 + z * 1.3,
      ph: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.18 ? 262 : Math.random() < 0.5 ? 215 : 190,
      big: Math.random() < 0.07,
    };
  });
}

function makeNet() {
  const nodes: NetNode[] = [];
  const layerNodes: number[][] = [];
  LAYERS.forEach((n, l) => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(nodes.length);
      nodes.push({
        l,
        x: (l - (LAYERS.length - 1) / 2) * 150 + rand(-12, 12),
        y: (i - (n - 1) / 2) * 34 + rand(-5, 5),
        z: rand(-110, 110),
        j: Math.random(),
        g: GREEK[Math.floor(Math.random() * GREEK.length)],
        gt: 0,
      });
    }
    layerNodes.push(ids);
  });
  // Every neuron feeds every neuron of the next layer, on a slightly bowed
  // strand (c), so neighbouring strands cross each other like a weave. A few
  // skip connections jump a layer.
  const edges: NetEdge[] = [];
  const add = (a: number, b: number, l: number, span: number) =>
    edges.push({ a, b, w: rand(-1, 1), l, span, c: rand(-0.22, 0.22), ph: Math.random(), flash: 0 });
  for (let l = 0; l < LAYERS.length - 1; l++) {
    for (const a of layerNodes[l]) {
      for (const b of layerNodes[l + 1]) add(a, b, l, 1);
      if (l < LAYERS.length - 2) {
        for (const b of layerNodes[l + 2]) if (Math.random() < 0.05) add(a, b, l, 2);
      }
    }
  }
  return { nodes, edges, layerNodes };
}

/** Signed-in areas get the full show; public pages keep it quieter behind their own visuals. */
const APP_ROUTES = /^\/(dashboard|scan|orders|services|billing|settings|admin)(\/|$)/;

export function SpaceBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const inApp = useRef(false);
  useEffect(() => {
    inApp.current = APP_ROUTES.test(pathname ?? "");
  }, [pathname]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const c = ctx;
    const cv = canvas;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let small = false;
    let stars: Star[] = [];
    const meteors: Meteor[] = [];
    const queued: number[] = []; // seconds until a queued shower meteor appears
    const net = makeNet();
    const px = new Float32Array(net.nodes.length);
    const py = new Float32Array(net.nodes.length);
    const pk = new Float32Array(net.nodes.length);
    const act = new Float32Array(net.nodes.length);
    const actBack = new Float32Array(net.nodes.length);
    const ex = new Float32Array(net.edges.length);
    const ey = new Float32Array(net.edges.length);

    let epoch = 0;
    let loss = 2.2;
    let history: number[] = [2.2];
    let lastCycle = -1;

    let scrollY = window.scrollY;
    let lastScrollY = scrollY;
    let vel = 0;
    let docH = document.documentElement.scrollHeight;
    let mx = 0.5;
    let mxSmooth = 0.5;
    let nextMeteor = 1.2;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let frame = 0;
    let acc = 0;

    function resize() {
      small = window.innerWidth < 760;
      dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(small ? 90 : 190);
      docH = document.documentElement.scrollHeight;
      if (reduce) draw(0, 0);
    }

    function spawnMeteor(fromScroll = false) {
      const ang = rand(2.35, 2.75); // radians; heading down and to the left
      const speed = rand(650, 1250);
      const fromTop = Math.random() < 0.65;
      meteors.push({
        x: fromTop ? rand(w * 0.25, w * 1.15) : w + 20,
        y: fromTop ? -30 : rand(0, h * 0.55),
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        len: rand(90, 230) * (fromScroll ? 0.8 : 1),
        age: 0,
        max: 3,
        w: rand(1.1, 2.3),
        violet: Math.random() < 0.28,
      });
    }

    function drawNebula(off: number) {
      const blobs: [number, number, number, string][] = [
        [0.18, 0.1, 0.62, "91,140,255"],
        [0.88, 0.5, 0.66, "154,123,255"],
        [0.4, 0.98, 0.55, "95,216,245"],
      ];
      const r0 = Math.max(w, h);
      for (const [bx, by, br, col] of blobs) {
        const x = bx * w;
        const y = by * h - off;
        const r = br * r0;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${col},0.13)`);
        g.addColorStop(0.5, `rgba(${col},0.045)`);
        g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
    }

    function drawPlanet(off: number) {
      const r = Math.min(w, h) * (small ? 0.42 : 0.5);
      const x = w * 0.96;
      const y = h * 1.04 - off * 0.6;
      const body = c.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.05, x, y, r);
      body.addColorStop(0, "rgba(70,96,190,0.42)");
      body.addColorStop(0.55, "rgba(30,38,92,0.5)");
      body.addColorStop(1, "rgba(6,8,18,0.85)");
      c.fillStyle = body;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      // atmosphere rim on the lit side
      const rim = c.createRadialGradient(x, y, r * 0.96, x, y, r * 1.06);
      rim.addColorStop(0, "rgba(95,216,245,0.0)");
      rim.addColorStop(0.55, "rgba(120,170,255,0.32)");
      rim.addColorStop(1, "rgba(120,170,255,0)");
      c.fillStyle = rim;
      c.beginPath();
      c.arc(x, y, r * 1.06, 0, Math.PI * 2);
      c.fill();
      // a ring
      c.save();
      c.translate(x, y);
      c.rotate(-0.38);
      c.scale(1, 0.18);
      c.strokeStyle = "rgba(160,190,255,0.16)";
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.arc(0, 0, r * 1.35, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "rgba(154,123,255,0.1)";
      c.lineWidth = r * 0.02;
      c.beginPath();
      c.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    function drawStars(time: number) {
      const streak = Math.abs(vel) > 2.5;
      const dir = vel > 0 ? 1 : -1;
      for (const s of stars) {
        const x = s.x * w;
        let y = (s.y * h - scrollY * s.z * 0.28) % h;
        if (y < 0) y += h;
        const tw = 0.55 + 0.45 * Math.sin(time * (0.8 + s.z) + s.ph);
        const a = clamp(s.z * 0.9 * tw + 0.1);
        const col = `hsla(${s.hue},90%,${s.big ? 88 : 80}%,`;
        if (streak) {
          const len = Math.min(58, Math.abs(vel) * s.z * 1.7);
          c.strokeStyle = col + a * 0.9 + ")";
          c.lineWidth = s.s;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + dir * len);
          c.stroke();
        } else if (s.big) {
          c.fillStyle = col + a * 0.16 + ")";
          c.beginPath();
          c.arc(x, y, s.s * 3.2, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = col + a + ")";
          c.fillRect(x - s.s * 0.6, y - s.s * 0.6, s.s * 1.5, s.s * 1.5);
          c.fillRect(x - s.s * 3, y - 0.4, s.s * 6, 0.8);
          c.fillRect(x - 0.4, y - s.s * 3, 0.8, s.s * 6);
        } else {
          c.fillStyle = col + a + ")";
          c.fillRect(x, y, s.s, s.s);
        }
      }
    }

    function drawMeteors(dt: number) {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.age += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y > h + 60 || m.x < -300 || m.age > m.max) {
          meteors.splice(i, 1);
          continue;
        }
        const sp = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / sp) * m.len;
        const ty = m.y - (m.vy / sp) * m.len;
        const core = m.violet ? "200,180,255" : "190,235,255";
        const tail = m.violet ? "154,123,255" : "95,216,245";
        const g = c.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(${core},0.95)`);
        g.addColorStop(0.25, `rgba(${tail},0.45)`);
        g.addColorStop(1, `rgba(${tail},0)`);
        c.strokeStyle = g;
        c.lineWidth = m.w;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(m.x, m.y);
        c.lineTo(tx, ty);
        c.stroke();
        const hg = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.w * 5);
        hg.addColorStop(0, `rgba(${core},0.9)`);
        hg.addColorStop(1, `rgba(${core},0)`);
        c.fillStyle = hg;
        c.beginPath();
        c.arc(m.x, m.y, m.w * 5, 0, Math.PI * 2);
        c.fill();
      }
      c.lineCap = "butt";
    }

    function drawNet(time: number, dt: number, still: boolean) {
      const L = LAYERS.length;
      const S = small ? Math.min(w / 900, h / 760) * 1.35 : Math.min(w / 1500, h / 720);
      const cx = small ? w * 0.5 : w * 0.6;
      const cy = h * 0.5 + Math.sin(scrollY * 0.0011) * 36;
      const yaw = 0.3 + Math.sin(time * 0.14) * 0.3 + Math.sin(scrollY * 0.0013) * 0.3 + (mxSmooth - 0.5) * 0.4;
      const pitch = 0.16 + Math.sin(time * 0.09) * 0.05;
      const cY = Math.cos(yaw);
      const sY = Math.sin(yaw);
      const cP = Math.cos(pitch);
      const sP = Math.sin(pitch);

      // ── training state: a new epoch every 0.8s. Each one nudges the weights
      // and a handful of connections flash as they are updated.
      const epochN = still ? 0 : Math.floor(time / EPOCH);
      if (epochN !== lastCycle) {
        if (lastCycle >= 0) {
          epoch++;
          if (epoch > MAX_EPOCH) {
            epoch = 0;
            history = [];
            for (const e of net.edges) e.w = rand(-1, 1);
          } else {
            for (const e of net.edges) {
              e.w = clamp(e.w + rand(-0.1, 0.1), -1, 1);
              if (Math.random() < 0.07) e.flash = 1;
            }
          }
          loss = 2.2 * Math.exp(-epoch * 0.06) + 0.01 + Math.random() * 0.025;
          history.push(loss);
          if (history.length > 80) history.shift();
        }
        lastCycle = epochN;
      }

      // ── signal fronts. Two forward passes and two backward passes are always
      // in flight, half a network apart, so cyan and violet signals keep
      // crossing each other.
      const range = L + 1.2;
      const base = still ? 2.4 : time * WAVE_SPEED;
      const fwd = [(base % range) - 0.6, ((base + range / 2) % range) - 0.6];
      const bwd = still
        ? [-9, -9]
        : [L - 0.4 - ((base + range * 0.25) % range), L - 0.4 - ((base + range * 0.75) % range)];

      // ── project the neurons and work out how lit each one is
      for (let i = 0; i < net.nodes.length; i++) {
        const n = net.nodes[i];
        const x1 = n.x * cY + n.z * sY;
        const z1 = -n.x * sY + n.z * cY;
        const y1 = n.y * cP - z1 * sP;
        const z2 = n.y * sP + z1 * cP;
        const k = 900 / (900 + z2 + 120);
        px[i] = cx + x1 * k * S;
        py[i] = cy + y1 * k * S;
        pk[i] = k;
        const jf = n.j * 0.45;
        act[i] = Math.max(clamp(1 - Math.abs(fwd[0] - n.l - jf) * 1.6), clamp(1 - Math.abs(fwd[1] - n.l - jf) * 1.6));
        actBack[i] = Math.max(clamp(1 - Math.abs(bwd[0] - n.l + jf) * 1.6), clamp(1 - Math.abs(bwd[1] - n.l + jf) * 1.6));
        if (act[i] > 0.85 && time - n.gt > 0.35) {
          n.g = GREEK[Math.floor(Math.random() * GREEK.length)];
          n.gt = time;
        }
      }
      // control point of each strand: the midpoint pushed sideways
      for (let i = 0; i < net.edges.length; i++) {
        const e = net.edges[i];
        const dx = px[e.b] - px[e.a];
        const dy = py[e.b] - py[e.a];
        ex[i] = (px[e.a] + px[e.b]) / 2 - dy * e.c;
        ey[i] = (py[e.a] + py[e.b]) / 2 + dx * e.c;
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 2.4);
      }

      const baseA = (small ? 0.6 : 0.9) * (inApp.current ? 1 : 0.5);
      c.save();
      c.globalAlpha = baseA;

      // ── the weave: hair-thin strands, cyan for positive weights and violet
      // for negative, a little brighter where the weight is strong
      c.lineWidth = small ? 0.4 : 0.45;
      for (const sign of [1, -1]) {
        for (const strong of [false, true]) {
          const col = sign > 0 ? "110,215,245" : "160,135,255";
          c.strokeStyle = `rgba(${col},${strong ? 0.22 : 0.11})`;
          c.beginPath();
          for (let i = 0; i < net.edges.length; i++) {
            const e = net.edges[i];
            if (e.w * sign <= 0 || Math.abs(e.w) > 0.55 !== strong) continue;
            c.moveTo(px[e.a], py[e.a]);
            c.quadraticCurveTo(ex[i], ey[i], px[e.b], py[e.b]);
          }
          c.stroke();
        }
      }
      // strands whose weight was just updated
      c.strokeStyle = "rgba(235,242,255,0.5)";
      c.lineWidth = 0.6;
      c.beginPath();
      for (let i = 0; i < net.edges.length; i++) {
        const e = net.edges[i];
        if (e.flash < 0.35) continue;
        c.moveTo(px[e.a], py[e.a]);
        c.quadraticCurveTo(ex[i], ey[i], px[e.b], py[e.b]);
      }
      c.stroke();

      // ── signals running along the strands
      c.globalCompositeOperation = "lighter";
      const drawPulses = (front: number, back: boolean, pick: number) => {
        c.strokeStyle = back ? "rgba(175,150,255,0.6)" : "rgba(120,228,255,0.65)";
        c.lineWidth = 0.75;
        c.lineCap = "round";
        c.beginPath();
        const dots: number[] = [];
        for (let i = 0; i < net.edges.length; i++) {
          const e = net.edges[i];
          // each pass uses its own share of the strands
          if (pick === 0 ? e.ph > 0.5 : e.ph < 0.42) continue;
          // 0 at the strand's source layer, 1 at its target layer
          const s0 = (front - e.l) / e.span;
          const s = back ? 1 - s0 : s0;
          if (s < 0 || s > 1) continue;
          const a = back ? e.b : e.a;
          const b = back ? e.a : e.b;
          const t0 = Math.max(0, s - 0.13);
          const u = 1 - s;
          const u0 = 1 - t0;
          const hx = u * u * px[a] + 2 * u * s * ex[i] + s * s * px[b];
          const hy = u * u * py[a] + 2 * u * s * ey[i] + s * s * py[b];
          c.moveTo(u0 * u0 * px[a] + 2 * u0 * t0 * ex[i] + t0 * t0 * px[b], u0 * u0 * py[a] + 2 * u0 * t0 * ey[i] + t0 * t0 * py[b]);
          c.lineTo(hx, hy);
          if (Math.abs(e.w) > 0.45) dots.push(hx, hy);
        }
        c.stroke();
        c.fillStyle = back ? "rgba(215,200,255,0.95)" : "rgba(210,248,255,0.95)";
        c.beginPath();
        for (let i = 0; i < dots.length; i += 2) {
          c.moveTo(dots[i] + 1, dots[i + 1]);
          c.arc(dots[i], dots[i + 1], 1, 0, Math.PI * 2);
        }
        c.fill();
        c.lineCap = "butt";
      };
      drawPulses(fwd[0], false, 0);
      drawPulses(fwd[1], false, 1);
      if (!still) {
        drawPulses(bwd[0], true, 1);
        drawPulses(bwd[1], true, 0);
      }

      // ── neurons: a small core, a fine ring, a glow while firing
      c.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (let i = 0; i < net.nodes.length; i++) {
        const n = net.nodes[i];
        const r = (1.6 + pk[i] * 1.5) * (small ? 0.9 : 1);
        const a = act[i];
        const b = actBack[i];
        const glow = Math.max(a, b);
        const col = b > a ? "175,150,255" : "120,228,255";
        if (glow > 0.04) {
          const g = c.createRadialGradient(px[i], py[i], 0, px[i], py[i], r * 7);
          g.addColorStop(0, `rgba(${col},${0.5 * glow})`);
          g.addColorStop(1, `rgba(${col},0)`);
          c.fillStyle = g;
          c.beginPath();
          c.arc(px[i], py[i], r * 7, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = glow > 0.05 ? `rgba(${col},${0.6 + 0.4 * glow})` : "rgba(160,182,255,0.55)";
        c.beginPath();
        c.arc(px[i], py[i], r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = `rgba(200,215,255,${0.22 + 0.4 * glow})`;
        c.lineWidth = 0.5;
        c.beginPath();
        c.arc(px[i], py[i], r + 1.8 + glow * 1.6, 0, Math.PI * 2);
        c.stroke();
        if (!small && (a > 0.45 || n.l === L - 1)) {
          c.fillStyle = `rgba(215,228,255,${n.l === L - 1 ? 0.65 : 0.7 * a})`;
          c.fillText(n.g, px[i] + r + 5, py[i] + 3);
        }
      }
      c.globalCompositeOperation = "source-over";

      // ── readout and loss curve under the network
      const sim = 100 * Math.exp(-epoch * 0.065);
      const iter = still ? 0 : Math.floor(time * 31) % 100000;
      const bw = 320;
      const bh = 30;
      const hx = cx - bw / 2;
      const hy = cy + 255 * S + 28;
      c.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      c.fillStyle = "rgba(170,190,235,0.75)";
      c.fillText(
        `iter ${String(iter).padStart(5, "0")}   ε ${String(epoch).padStart(3, "0")}   λ ${loss.toFixed(4)}   σ ${sim.toFixed(1)}%`,
        hx,
        hy,
      );
      const by0 = hy + 9;
      c.strokeStyle = "rgba(148,163,255,0.16)";
      c.lineWidth = 0.5;
      c.strokeRect(hx + 0.5, by0 + 0.5, bw, bh);
      c.beginPath();
      for (let g = 1; g < 8; g++) {
        c.moveTo(hx + (g * bw) / 8, by0);
        c.lineTo(hx + (g * bw) / 8, by0 + bh);
      }
      c.strokeStyle = "rgba(148,163,255,0.07)";
      c.stroke();
      if (history.length > 1) {
        c.strokeStyle = "rgba(120,228,255,0.85)";
        c.lineWidth = 0.9;
        c.beginPath();
        let lx = hx;
        let ly = by0;
        history.forEach((v, i) => {
          lx = hx + (i / 79) * bw;
          ly = by0 + bh - clamp(v / 2.3) * (bh - 4) - 2;
          if (i === 0) c.moveTo(lx, ly);
          else c.lineTo(lx, ly);
        });
        c.stroke();
        c.fillStyle = "rgba(220,250,255,0.95)";
        c.beginPath();
        c.arc(lx, ly, 1.6, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    function drawProgress() {
      const max = Math.max(1, docH - h);
      const p = clamp(scrollY / max);
      if (p <= 0.002) return;
      const g = c.createLinearGradient(0, 0, w * p, 0);
      g.addColorStop(0, "rgba(95,216,245,0.0)");
      g.addColorStop(0.7, "rgba(95,216,245,0.85)");
      g.addColorStop(1, "rgba(190,170,255,1)");
      c.fillStyle = g;
      c.fillRect(0, 0, w * p, 2);
      const hg = c.createRadialGradient(w * p, 1, 0, w * p, 1, 14);
      hg.addColorStop(0, "rgba(200,190,255,0.8)");
      hg.addColorStop(1, "rgba(200,190,255,0)");
      c.fillStyle = hg;
      c.fillRect(w * p - 14, 0, 28, 16);
    }

    function draw(time: number, dt: number) {
      c.clearRect(0, 0, w, h);
      const off = Math.sin(scrollY * 0.0009) * 80;
      drawNebula(off);
      drawPlanet(off);
      drawStars(time);
      drawNet(time, dt, reduce);
      if (!reduce) drawMeteors(dt);
      drawProgress();
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      frame++;
      if (frame % 90 === 0) docH = document.documentElement.scrollHeight;
      scrollY = window.scrollY;
      const dv = scrollY - lastScrollY;
      lastScrollY = scrollY;
      vel += (dv - vel) * 0.18;
      mxSmooth += (mx - mxSmooth) * 0.04;
      // Public pages and phones run at half rate; they have their own visuals to pay for.
      acc += dt;
      if ((small || !inApp.current) && frame % 2 === 1) return;
      const step = acc;
      acc = 0;
      // random meteors; a fast scroll shakes a few loose
      nextMeteor -= step;
      if (nextMeteor <= 0) {
        if (Math.random() < 0.16) {
          const n = 3 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) queued.push(i * rand(0.12, 0.38));
          nextMeteor = rand(5, 9);
        } else {
          spawnMeteor();
          nextMeteor = rand(0.6, 2.4);
        }
      }
      if (Math.abs(vel) > 28 && Math.random() < 0.05) spawnMeteor(true);
      for (let i = queued.length - 1; i >= 0; i--) {
        queued[i] -= step;
        if (queued[i] <= 0) {
          spawnMeteor();
          queued.splice(i, 1);
        }
      }
      draw(t, step);
    }

    function onMove(e: PointerEvent) {
      mx = e.clientX / Math.max(1, window.innerWidth);
    }
    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    function onStillScroll() {
      scrollY = window.scrollY;
      draw(0, 0);
    }
    if (reduce) {
      window.addEventListener("scroll", onStillScroll, { passive: true });
      draw(0, 0);
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onStillScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-20 size-full" />;
}
