"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The signed-in backdrop: deep space.
 *
 * One fixed canvas behind the app, drawn back to front:
 *  - drifting nebula clouds, a rotating spiral galaxy, a ringed planet
 *    (slow scroll parallax)
 *  - three depth layers of twinkling stars
 *  - the neural field: a loose 3D mesh of neurons the page flies through as
 *    it scrolls; the faster the scroll, the brighter the mesh and the more
 *    signals race along it (and the central network computes faster)
 *  - the 0% pattern machine: a deep neural network in perspective, woven
 *    from hair-thin bowed strands. It iterates fast (an epoch every 0.8s):
 *    forward passes in cyan and backprop in violet run through each other,
 *    updated weights flash, Greek glyphs flicker on the neurons, a loss
 *    curve falls and the similarity readout converges on 0%. It turns
 *    slowly with the cursor and with scroll
 *  - a loss landscape in perspective along the bottom: it flows toward the
 *    viewer over time and as the page scrolls, and an optimiser (the warm
 *    point, ∇L) rolls downhill on it by gradient descent
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

/** A cloud texture: domain-warped fractal noise coloured blue → violet → magenta with cyan filaments. Built once. */
function makeNebula(): HTMLCanvasElement {
  const N = 384;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = N;
  const g = cvs.getContext("2d");
  if (!g) return cvs;
  const P = new Uint8Array(512);
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = P[i];
    P[i] = P[j];
    P[j] = t;
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const lat = (x: number, y: number) => P[(P[x & 255] + y) & 255] / 255;
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = lat(xi, yi);
    const b = lat(xi + 1, yi);
    const d = lat(xi, yi + 1);
    const e = lat(xi + 1, yi + 1);
    return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
  };
  const fbm = (x: number, y: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      sum += amp * noise(x * f, y * f);
      amp *= 0.5;
      f *= 2;
    }
    return sum;
  };
  const img = g.createImageData(N, N);
  const C1 = [50, 105, 255];
  const C2 = [150, 90, 255];
  const C3 = [240, 95, 205];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (x / N) * 3.6;
      const ny = (y / N) * 3.6;
      const q = fbm(nx + 3.1, ny + 1.7);
      const n = fbm(nx + q * 1.7, ny + q * 1.7 + 5.2);
      const m = fbm(nx * 1.6 + 9.4, ny * 1.6 + 2.8);
      // fade to nothing at the border so the texture can be drawn at any size
      const edge = clamp(Math.min(Math.min(x, N - 1 - x), Math.min(y, N - 1 - y)) / (N * 0.2));
      const d = clamp((n - 0.4) / 0.36) * edge * edge * (3 - 2 * edge);
      const t = clamp((m - 0.32) / 0.38);
      const A = t < 0.5 ? C1 : C2;
      const B = t < 0.5 ? C2 : C3;
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const hi = clamp((n - 0.66) / 0.14); // bright cyan filaments in the densest folds
      const o = (y * N + x) * 4;
      img.data[o] = A[0] + (B[0] - A[0]) * k + (120 - 60) * hi;
      img.data[o + 1] = A[1] + (B[1] - A[1]) * k + 120 * hi;
      img.data[o + 2] = A[2] + (B[2] - A[2]) * k;
      img.data[o + 3] = d * d * 235;
    }
  }
  g.putImageData(img, 0, 0);
  return cvs;
}

/**
 * A spiral galaxy sprite, built once and drawn rotating. Tens of thousands of
 * faint points add up to smooth light, the way a real disc does:
 * an exponential stellar disc, two major and two minor logarithmic arms with
 * clumpy brightness, a warm bulge, blue young clusters and pink star-forming
 * regions along the arms, soft glow lanes, dark dust carved along the arms'
 * inner edges, and a faint halo.
 */
function makeGalaxy(): HTMLCanvasElement {
  const N = 1024;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = N;
  const g = cvs.getContext("2d");
  if (!g) return cvs;
  g.translate(N / 2, N / 2);
  const R = N * 0.48;
  const TAU = Math.PI * 2;
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
  const WIND = 2.9;
  const spiral = (r: number) => WIND * Math.log(1 + r / (R * 0.16));
  const dot = (x: number, y: number, size: number) => g.fillRect(x - size / 2, y - size / 2, size, size);
  const blob = (x: number, y: number, r: number, col: string, a: number) => {
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, `rgba(${col},${a})`);
    b.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = b;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // halo
  blob(0, 0, R, "120,135,255", 0.13);
  g.globalCompositeOperation = "lighter";

  // the smooth disc: brightness falls off exponentially with radius
  for (let i = 0; i < 70000; i++) {
    const r = Math.min(R, -Math.log(1 - Math.random()) * R * 0.27);
    const th = Math.random() * TAU;
    const warm = Math.max(0, 1 - r / (R * 0.5));
    g.fillStyle = `rgba(${Math.round(190 + 65 * warm)},${Math.round(200 + 35 * warm)},${Math.round(255 - 30 * warm)},${0.035 + Math.random() * 0.08})`;
    dot(Math.cos(th) * r, Math.sin(th) * r, 1.3);
  }

  // the arms
  const ARMS: [number, number][] = [
    [0, 1],
    [Math.PI, 1],
    [Math.PI * 0.5, 0.42],
    [Math.PI * 1.5, 0.42],
  ];
  for (const [phase, strength] of ARMS) {
    const count = Math.round(46000 * strength);
    for (let i = 0; i < count; i++) {
      // broad, diffuse arms that thin out and fade toward the rim
      const r = R * (0.06 + 0.9 * Math.pow(Math.random(), 1.1));
      const k = r / R;
      const fade = Math.pow(1 - k, 0.7);
      const th = phase + spiral(r) + gauss() * (0.62 - 0.2 * k) + (Math.random() - 0.5) * 0.25;
      // clumps: the arm is brighter in knots along its length
      const clump = 0.55 + 0.45 * Math.sin(spiral(r) * 5.3 + phase * 3) * Math.sin(r * 0.031 + phase);
      const x = Math.cos(th) * r;
      const y = Math.sin(th) * r;
      const p = Math.random();
      if (p < 0.005) {
        // a young blue cluster
        blob(x, y, 3 + Math.random() * 4, "170,205,255", 0.2 * strength * fade);
        g.fillStyle = `rgba(225,238,255,${(0.85 * fade + 0.1).toFixed(2)})`;
        dot(x, y, 1.5);
      } else if (p < 0.009 && k > 0.18) {
        // a pink star-forming region
        blob(x, y, 4 + Math.random() * 6, "255,110,180", 0.17 * strength * fade);
        g.fillStyle = `rgba(255,190,220,${(0.7 * fade + 0.1).toFixed(2)})`;
        dot(x, y, 1.3);
      } else {
        const warm = Math.max(0, 1 - k * 2.4);
        g.fillStyle = `rgba(${Math.round(155 + 100 * warm)},${Math.round(185 + 50 * warm)},${Math.round(255 - 40 * warm)},${((0.04 + Math.random() * 0.13) * strength * (0.5 + clump) * (0.25 + fade)).toFixed(3)})`;
        dot(x, y, Math.random() < 0.08 ? 1.7 : 1.1);
      }
    }
    // glow that follows the arm
    for (let i = 0; i < 260 * strength; i++) {
      const r = R * (0.1 + 0.88 * Math.random());
      const th = phase + spiral(r) + gauss() * 0.16;
      blob(Math.cos(th) * r, Math.sin(th) * r, 22 + Math.random() * 44, r < R * 0.35 ? "210,190,255" : "110,150,255", (0.034 * strength + 0.012) * (1.15 - r / R));
    }
  }

  // dust: dark lanes on the inner (trailing) edge of the two major arms
  g.globalCompositeOperation = "destination-out";
  for (const phase of [0, Math.PI]) {
    for (let i = 0; i < 520; i++) {
      const r = R * (0.12 + 0.7 * Math.random());
      const th = phase + spiral(r) - 0.42 + gauss() * 0.12;
      blob(Math.cos(th) * r, Math.sin(th) * r, 6 + Math.random() * 14, "0,0,0", 0.07 + Math.random() * 0.08);
    }
  }
  g.globalCompositeOperation = "lighter";

  // the bulge: old, warm stars packed round the centre, slightly barred
  for (let i = 0; i < 11000; i++) {
    const r = Math.abs(gauss()) * R * 0.26;
    const th = Math.random() * TAU;
    g.fillStyle = `rgba(255,${Math.round(225 + Math.random() * 20)},${Math.round(190 + Math.random() * 30)},${0.05 + Math.random() * 0.1})`;
    dot(Math.cos(th) * r * 1.25, Math.sin(th) * r * 0.85, 1.2);
  }
  blob(0, 0, R * 0.2, "255,236,208", 0.5);
  blob(0, 0, R * 0.075, "255,250,240", 0.95);

  // a scatter of foreground stars across the whole disc
  for (let i = 0; i < 260; i++) {
    const r = Math.sqrt(Math.random()) * R;
    const th = Math.random() * TAU;
    g.fillStyle = `rgba(240,245,255,${0.35 + Math.random() * 0.55})`;
    dot(Math.cos(th) * r, Math.sin(th) * r, Math.random() < 0.2 ? 1.9 : 1.2);
  }
  return cvs;
}

/**
 * The neural field: a loose 3D mesh of neurons the page flies through as it
 * scrolls. Each neuron is wired to its nearest neighbours.
 */
interface FieldNode { x: number; y: number; z: number; hue: number }
const FIELD_DEPTH = 3.2;
const FIELD_NEAR = 0.22;

function makeField(n: number) {
  const nodes: FieldNode[] = Array.from({ length: n }, () => ({
    x: rand(-1.75, 1.75),
    y: rand(-1.05, 1.05),
    z: rand(0, FIELD_DEPTH),
    hue: Math.random() < 0.4 ? 262 : 192,
  }));
  const edges: [number, number][] = [];
  const seen = new Set<number>();
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => ({ j, d: j === i ? Infinity : (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z - b.z) * 1.4) ** 2 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 3);
    for (const { j } of near) {
      const key = Math.min(i, j) * 1000 + Math.max(i, j);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  });
  return { nodes, edges };
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
    // The two textures take a moment to paint, so they are built just after
    // the first frame instead of holding it up.
    let nebula: HTMLCanvasElement | null = null;
    let galaxy: HTMLCanvasElement | null = null;
    const texTimer = window.setTimeout(() => {
      nebula = makeNebula();
      galaxy = makeGalaxy();
      skyAge = 99;
      if (reduce) draw(0, 0);
    }, 80);
    // The clouds drift slowly, so they are painted into a half-resolution
    // layer every few frames and that layer is blitted, instead of blending
    // two full-screen textures on every frame.
    const sky = document.createElement("canvas");
    const skyCtx = sky.getContext("2d");
    let skyAge = 99;
    let field = makeField(110);
    let fx = new Float32Array(0);
    let fy = new Float32Array(0);
    let fz = new Float32Array(0);
    let fa = new Float32Array(0);
    const fieldPulses: { e: number; u: number; sp: number; rev: boolean }[] = [];
    let energy = 0; // 0…1, how hard the page is being scrolled
    let netPhase = 0; // the network's clock: it runs faster while scrolling
    // gradient descent on the loss landscape: the optimiser's position, velocity and trail
    const opt = { x: 2.1, z: 6, vx: 0, vz: 0, age: 0 };
    const trail: number[] = [];
    const px = new Float32Array(net.nodes.length);
    const py = new Float32Array(net.nodes.length);
    const pk = new Float32Array(net.nodes.length);
    const act = new Float32Array(net.nodes.length);
    const actBack = new Float32Array(net.nodes.length);
    let lx = new Float32Array(0);
    let ly = new Float32Array(0);
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
      stars = makeStars(small ? 150 : 420);
      field = makeField(small ? 44 : 110);
      fx = new Float32Array(field.nodes.length);
      fy = new Float32Array(field.nodes.length);
      fz = new Float32Array(field.nodes.length);
      fa = new Float32Array(field.nodes.length);
      fieldPulses.length = 0;
      sky.width = Math.max(2, Math.round(w / 2));
      sky.height = Math.max(2, Math.round(h / 2));
      skyAge = 99;
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
        len: rand(120, 320) * (fromScroll ? 0.8 : 1),
        age: 0,
        max: 3,
        w: rand(1.1, 2.3),
        violet: Math.random() < 0.28,
      });
    }

    function drawNebula(time: number, off: number) {
      const k = skyCtx;
      if (k && nebula && ++skyAge > 5) {
        skyAge = 0;
        const sw = sky.width;
        const sh = sky.height;
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.globalCompositeOperation = "source-over";
        k.globalAlpha = 1;
        k.clearRect(0, 0, sw, sh);
        // base wash so the void is never flat black
        const wash = k.createLinearGradient(0, 0, sw, sh);
        wash.addColorStop(0, "rgba(28,38,110,0.34)");
        wash.addColorStop(0.5, "rgba(10,12,40,0.08)");
        wash.addColorStop(1, "rgba(70,36,120,0.3)");
        k.fillStyle = wash;
        k.fillRect(0, 0, sw, sh);
        // two sheets of cloud drifting past each other
        const big = Math.max(sw, sh);
        k.globalCompositeOperation = "lighter";
        k.globalAlpha = 0.52;
        k.translate(sw * 0.62 + Math.sin(time * 0.021) * 30, sh * 0.42);
        k.rotate(-0.35 + Math.sin(time * 0.013) * 0.06);
        k.drawImage(nebula, -big * 0.95, -big * 0.7, big * 1.9, big * 1.4);
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.globalAlpha = 0.36;
        k.translate(sw * 0.24 - Math.sin(time * 0.017) * 35, sh * 0.82);
        k.rotate(2.6 + Math.cos(time * 0.011) * 0.08);
        k.drawImage(nebula, -big * 0.8, -big * 0.6, big * 1.6, big * 1.2);
      }
      // drawn a little oversized so the scroll parallax never shows an edge
      c.drawImage(sky, -w * 0.04, -h * 0.1 - off * 0.8, w * 1.08, h * 1.2);
    }

    function drawGalaxy(time: number, off: number) {
      if (!galaxy) return;
      // top right, clear of the headings; drawn close to the sprite's own size
      const R = Math.min(Math.min(w, h) * (small ? 0.46 : 0.56), 540);
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = inApp.current ? 0.8 : 0.92;
      c.translate(small ? w * 0.82 : w * 0.83, h * 0.13 - off * 0.45);
      c.rotate(0.42);
      c.scale(1, 0.56);
      c.rotate(-time * 0.022);
      c.drawImage(galaxy, -R, -R, R * 2, R * 2);
      c.restore();
    }

    // ── the neural field. Scrolling flies the camera through it: neurons rush
    // past, and the harder the page is scrolled the brighter the mesh burns
    // and the more signals race along it.
    function drawField(time: number, dt: number, still: boolean) {
      const F = h * 0.9;
      const zOff = scrollY * 0.0019 + time * 0.03;
      const nodes = field.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let zz = (n.z - zOff) % FIELD_DEPTH;
        if (zz < 0) zz += FIELD_DEPTH;
        zz += FIELD_NEAR;
        const k = F / zz;
        fx[i] = w / 2 + n.x * (w / h) * 0.58 * k;
        fy[i] = h / 2 + n.y * k;
        fz[i] = zz;
        // fade in from the distance, and out just before a neuron passes the eye
        fa[i] = clamp((FIELD_NEAR + FIELD_DEPTH - zz) / 1.1) * clamp((zz - FIELD_NEAR) / 0.3);
      }
      const lit = 0.085 + energy * 0.6;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      for (let e = 0; e < field.edges.length; e++) {
        const a = field.edges[e][0];
        const b = field.edges[e][1];
        if (Math.abs(fz[a] - fz[b]) > 1.3) continue; // the pair straddles the wrap
        const al = Math.min(fa[a], fa[b]) * lit;
        if (al < 0.012) continue;
        const zm = (fz[a] + fz[b]) / 2;
        c.strokeStyle = `hsla(${nodes[a].hue},95%,74%,${al.toFixed(3)})`;
        c.lineWidth = Math.min(1.7, 0.3 + 0.42 / zm);
        c.beginPath();
        c.moveTo(fx[a], fy[a]);
        c.lineTo(fx[b], fy[b]);
        c.stroke();
      }
      // signals: scrolling fires them along the mesh
      if (!still) {
        if (fieldPulses.length < 90 && Math.random() < 0.03 + energy * 1.6) {
          fieldPulses.push({ e: Math.floor(Math.random() * field.edges.length), u: 0, sp: rand(1.2, 2.6), rev: Math.random() < 0.5 });
        }
        for (let i = fieldPulses.length - 1; i >= 0; i--) {
          const p = fieldPulses[i];
          p.u += p.sp * dt * (1 + energy * 1.5);
          if (p.u >= 1 || p.e >= field.edges.length) {
            fieldPulses.splice(i, 1);
            continue;
          }
          const a = field.edges[p.e][p.rev ? 1 : 0];
          const b = field.edges[p.e][p.rev ? 0 : 1];
          if (Math.abs(fz[a] - fz[b]) > 1.3) continue;
          const al = Math.min(fa[a], fa[b]);
          const x = fx[a] + (fx[b] - fx[a]) * p.u;
          const y = fy[a] + (fy[b] - fy[a]) * p.u;
          const r = Math.min(3.2, 0.9 + 0.8 / ((fz[a] + fz[b]) / 2));
          c.fillStyle = `rgba(215,245,255,${(al * (0.5 + energy * 0.5)).toFixed(3)})`;
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = `hsla(${nodes[a].hue},95%,70%,${(al * 0.22).toFixed(3)})`;
          c.beginPath();
          c.arc(x, y, r * 3.4, 0, Math.PI * 2);
          c.fill();
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        if (fa[i] < 0.02 || fx[i] < -40 || fx[i] > w + 40 || fy[i] < -40 || fy[i] > h + 40) continue;
        const r = Math.min(5.5, 0.7 + 1.1 / fz[i]);
        const al = fa[i] * (0.3 + energy * 0.7);
        if (energy > 0.12) {
          c.fillStyle = `hsla(${nodes[i].hue},95%,70%,${(al * 0.16).toFixed(3)})`;
          c.beginPath();
          c.arc(fx[i], fy[i], r * 4.5, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = `hsla(${nodes[i].hue},95%,82%,${al.toFixed(3)})`;
        c.beginPath();
        c.arc(fx[i], fy[i], r, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    // ── the loss landscape: a surface in perspective under the page. It flows
    // toward the viewer over time and when the page scrolls, and an optimiser
    // (the bright point) rolls downhill on it by gradient descent.
    function landscape(x: number, z: number, time: number, flow: number) {
      const zz = z + flow;
      return (
        0.27 * Math.sin(x * 1.2 + time * 0.2) * Math.cos(zz * 0.85) +
        0.13 * Math.sin(x * 2.5 - zz * 1.6 + time * 0.3) -
        0.44 * Math.exp(-((x - 0.3) * (x - 0.3) + (z - 4.3) * (z - 4.3)) / 2.4)
      );
    }

    function drawLandscape(time: number, dt: number, still: boolean) {
      const COLS = small ? 34 : 64;
      const ROWS = small ? 14 : 22;
      const X = 6;
      const Z0 = 1.3;
      const Z1 = 8.2;
      const hor = h * 0.6;
      const f = h * 0.85;
      const camY = 0.74;
      const flow = time * 0.22 + scrollY * 0.0042;
      const A = inApp.current ? 0.42 : 0.36;

      // horizon glow
      const hg = c.createLinearGradient(0, hor - h * 0.1, 0, hor + h * 0.16);
      hg.addColorStop(0, "rgba(91,140,255,0)");
      hg.addColorStop(0.45, "rgba(110,150,255,0.13)");
      hg.addColorStop(1, "rgba(154,123,255,0)");
      c.fillStyle = hg;
      c.fillRect(0, hor - h * 0.1, w, h * 0.26);

      const n = (COLS + 1) * ROWS;
      if (lx.length !== n) {
        lx = new Float32Array(n);
        ly = new Float32Array(n);
      }
      for (let j = 0; j < ROWS; j++) {
        const z = Z0 + (j / (ROWS - 1)) * (Z1 - Z0);
        const k = f / z;
        for (let i = 0; i <= COLS; i++) {
          const x = (i / COLS - 0.5) * 2 * X;
          const o = j * (COLS + 1) + i;
          lx[o] = w / 2 + x * k;
          ly[o] = hor + (camY - landscape(x, z, time, flow)) * k;
        }
      }
      c.lineWidth = 0.7;
      // contour rows, far to near
      for (let j = ROWS - 1; j >= 0; j--) {
        const d = j / (ROWS - 1);
        c.strokeStyle = `hsla(${188 + 72 * d},92%,${70 - 8 * d}%,${(Math.pow(1 - d, 1.25) * A + 0.035).toFixed(3)})`;
        c.beginPath();
        let pen = false;
        for (let i = 0; i <= COLS; i++) {
          const o = j * (COLS + 1) + i;
          if (lx[o] < -80 || lx[o] > w + 80) {
            pen = false;
            continue;
          }
          if (pen) c.lineTo(lx[o], ly[o]);
          else c.moveTo(lx[o], ly[o]);
          pen = true;
        }
        c.stroke();
      }
      // the lines running away from the viewer
      c.strokeStyle = `rgba(140,150,255,${(A * 0.26).toFixed(3)})`;
      c.beginPath();
      for (let i = 0; i <= COLS; i++) {
        if (lx[i] < -w * 0.6 || lx[i] > w * 1.6) continue;
        c.moveTo(lx[i], ly[i]);
        for (let j = 1; j < ROWS; j++) c.lineTo(lx[j * (COLS + 1) + i], ly[j * (COLS + 1) + i]);
      }
      c.stroke();

      // gradient descent: step against the slope, with a little momentum
      if (!still) {
        const e = 0.04;
        const gx = (landscape(opt.x + e, opt.z, time, flow) - landscape(opt.x - e, opt.z, time, flow)) / (2 * e);
        const gz = (landscape(opt.x, opt.z + e, time, flow) - landscape(opt.x, opt.z - e, time, flow)) / (2 * e);
        opt.vx = opt.vx * 0.9 - gx * 0.55 * dt;
        opt.vz = opt.vz * 0.9 - gz * 0.55 * dt;
        opt.x += opt.vx;
        opt.z += opt.vz;
        opt.age += dt;
        if (opt.age > 8 || Math.abs(opt.x) > 3 || opt.z < 2.3 || opt.z > 7.4) {
          opt.x = rand(-2.4, 2.6);
          opt.z = rand(3.4, 6.6);
          opt.vx = 0;
          opt.vz = 0;
          opt.age = 0;
          trail.length = 0;
        }
      }
      const ok = f / opt.z;
      const ox = w / 2 + opt.x * ok;
      const oy = hor + (camY - landscape(opt.x, opt.z, time, flow)) * ok;
      if (Math.abs(vel) > 3) trail.length = 0; // the surface is rushing past: an old trail would no longer lie on it
      trail.push(ox, oy);
      if (trail.length > 90) trail.splice(0, 2);
      if (trail.length > 3) {
        c.strokeStyle = "rgba(255,190,120,0.55)";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(trail[0], trail[1]);
        for (let i = 2; i < trail.length; i += 2) c.lineTo(trail[i], trail[i + 1]);
        c.stroke();
      }
      const og = c.createRadialGradient(ox, oy, 0, ox, oy, 16);
      og.addColorStop(0, "rgba(255,225,170,0.95)");
      og.addColorStop(0.3, "rgba(255,170,90,0.45)");
      og.addColorStop(1, "rgba(255,150,80,0)");
      c.fillStyle = og;
      c.beginPath();
      c.arc(ox, oy, 16, 0, Math.PI * 2);
      c.fill();
      c.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      c.fillStyle = "rgba(255,215,170,0.8)";
      c.fillText("∇L", ox + 10, oy - 9);
    }

    function drawPlanet(off: number) {
      const r = Math.min(w, h) * (small ? 0.42 : 0.5);
      const x = w * 0.96;
      const y = h * 1.04 - off * 0.6;
      const body = c.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.05, x, y, r);
      body.addColorStop(0, "rgba(62,84,172,0.96)");
      body.addColorStop(0.55, "rgba(22,28,74,0.97)");
      body.addColorStop(1, "rgba(5,7,16,1)");
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
      const streak = Math.abs(vel) > 6;
      const dir = vel > 0 ? 1 : -1;
      for (const s of stars) {
        const x = s.x * w;
        let y = (s.y * h - scrollY * s.z * 0.28) % h;
        if (y < 0) y += h;
        const tw = 0.55 + 0.45 * Math.sin(time * (0.8 + s.z) + s.ph);
        const a = clamp(s.z * 0.9 * tw + 0.1);
        const col = `hsla(${s.hue},90%,${s.big ? 88 : 80}%,`;
        if (streak) {
          const len = Math.min(22, Math.abs(vel) * s.z * 0.7);
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
      const S = (small ? Math.min(w / 900, h / 760) * 1.35 : Math.min(w / 1500, h / 720)) * (1 + energy * 0.1);
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
      const base = still ? 2.4 : netPhase;
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

      const baseA = (small ? 0.6 : 0.9) * (inApp.current ? 1 : 0.78);
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
      drawNebula(time, off);
      drawGalaxy(time, off);
      drawStars(time);
      drawPlanet(off);
      drawField(time, dt, reduce);
      drawLandscape(time, dt, reduce);
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
      energy += (clamp(Math.abs(vel) / 24) - energy) * (Math.abs(vel) / 24 > energy ? 0.2 : 0.035);
      netPhase += dt * WAVE_SPEED * (1 + energy * 2.6);
      mxSmooth += (mx - mxSmooth) * 0.04;
      // Public pages and phones run at half rate; they have their own visuals to pay for.
      acc += dt;
      if ((small || !inApp.current) && frame % 2 === 1) return;
      const step = acc;
      acc = 0;
      // random meteors; a fast scroll shakes a few loose
      nextMeteor -= step;
      if (nextMeteor <= 0) {
        if (Math.random() < 0.22) {
          const n = 4 + Math.floor(Math.random() * 6);
          for (let i = 0; i < n; i++) queued.push(i * rand(0.12, 0.38));
          nextMeteor = rand(3.5, 7);
        } else {
          spawnMeteor();
          nextMeteor = rand(0.35, 1.7);
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
      window.clearTimeout(texTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onStillScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-20 size-full" />;
}
