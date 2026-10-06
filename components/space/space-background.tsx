"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CLASS_NAMES, INPUT_NAMES, NET_LAYERS, classColor, createTrainer } from "./trainer";

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
 *  - the network: a real multilayer perceptron being trained in the page
 *    (see ./trainer), laid dim across the whole viewport so text stays
 *    readable. The neurons are small steady points; the motion is in the
 *    strands, which show the actual weights and carry signals threading
 *    the weave: forward along strong strands (cyan), backward along the ones
 *    whose gradient is large (violet). Scrolling trains it faster
 *  - a loss landscape in perspective along the bottom: it flows toward the
 *    viewer over time and as the page scrolls, and five optimisers (SGD,
 *    Momentum, RMSProp, Adam, AdaGrad) race down it from the same start,
 *    each by its own real update rule
 *  - meteors that fall at random, now and then in showers
 *  - a thin scroll-progress line on the top edge
 *
 * It never takes pointer events, pauses while the tab is hidden, and draws a
 * single still frame when the visitor prefers reduced motion.
 */

const WAVE_SPEED = 2.4; // layers a signal crosses per second
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * The optimisers that race down the loss landscape. Each is the real update
 * rule, run on the landscape's actual slope.
 */
interface Optimiser {
  name: string;
  rgb: string;
  x: number;
  z: number;
  /** per-rule state: velocity / first moment, and squared-gradient accumulators */
  mx: number;
  mz: number;
  vx: number;
  vz: number;
  t: number;
  alive: boolean;
  trail: number[];
}
const OPTIMISERS: [string, string][] = [
  ["SGD", "225,230,245"],
  ["Momentum", "95,216,245"],
  ["RMSProp", "178,132,255"],
  ["Adam", "255,186,110"],
  ["AdaGrad", "130,235,170"],
];

interface Star { x: number; y: number; z: number; s: number; ph: number; hue: number; big: boolean }
interface Meteor { x: number; y: number; vx: number; vy: number; len: number; age: number; max: number; w: number; violet: boolean }
/** Where a neuron sits: fractions of the viewport, a depth for parallax, a phase for its drift. */
interface NetNode { l: number; i: number; fx: number; fy: number; z: number; ph: number }
/** A connection: its two neurons, its place in the trainer's weight arrays, and how its strand bows. */
interface NetEdge { a: number; b: number; l: number; q: number; c: number; ph: number }

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

/** Lays the trainer's network out across the whole viewport: layers left to right, each spread top to bottom. */
function makeNet() {
  const nodes: NetNode[] = [];
  const first: number[] = [];
  const L = NET_LAYERS.length;
  NET_LAYERS.forEach((n, l) => {
    first.push(nodes.length);
    for (let i = 0; i < n; i++) {
      nodes.push({
        l,
        i,
        fx: 0.055 + (0.89 * l) / (L - 1) + rand(-0.012, 0.012),
        fy: 0.1 + (0.8 * (i + 0.5)) / n + rand(-0.012, 0.012),
        z: rand(-1, 1),
        ph: Math.random() * Math.PI * 2,
      });
    }
  });
  const edges: NetEdge[] = [];
  for (let l = 0; l < L - 1; l++) {
    const b = NET_LAYERS[l + 1];
    for (let i = 0; i < NET_LAYERS[l]; i++) {
      for (let j = 0; j < b; j++) {
        edges.push({ a: first[l] + i, b: first[l + 1] + j, l, q: i * b + j, c: rand(-0.16, 0.16), ph: Math.random() });
      }
    }
  }
  return { nodes, edges, first };
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
    const trainer = createTrainer();
    let trainDebt = 0; // fractional training steps owed
    let holdFor = 0; // seconds a finished run is left on screen before the next starts
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
    // the optimisers racing on the loss landscape
    const opts: Optimiser[] = OPTIMISERS.map(([name, rgb]) => ({ name, rgb, x: 0, z: 0, mx: 0, mz: 0, vx: 0, vz: 0, t: 0, alive: false, trail: [] }));
    let raceAge = 99;
    let raceQuiet = 0;
    const px = new Float32Array(net.nodes.length);
    const py = new Float32Array(net.nodes.length);
    let lx = new Float32Array(0);
    let ly = new Float32Array(0);
    const ex = new Float32Array(net.edges.length);
    let lastPass = -1;

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
        // deep space: the wash is barely there, so black stays black
        wash.addColorStop(0, "rgba(22,30,90,0.14)");
        wash.addColorStop(0.5, "rgba(6,8,26,0.02)");
        wash.addColorStop(1, "rgba(52,26,96,0.12)");
        k.fillStyle = wash;
        k.fillRect(0, 0, sw, sh);
        // two sheets of cloud drifting past each other
        const big = Math.max(sw, sh);
        k.globalCompositeOperation = "lighter";
        k.globalAlpha = 0.24;
        k.translate(sw * 0.62 + Math.sin(time * 0.021) * 30, sh * 0.42);
        k.rotate(-0.35 + Math.sin(time * 0.013) * 0.06);
        k.drawImage(nebula, -big * 0.95, -big * 0.7, big * 1.9, big * 1.4);
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.globalAlpha = 0.16;
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
      c.globalAlpha = inApp.current ? 0.7 : 0.82;
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
      const lit = energy * 0.5; // nothing at all while the page is still
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
        // a bowed link: the midpoint pushed sideways, alternately one way and the other
        const bow = (e % 2 ? 0.2 : -0.2) + ((e % 5) - 2) * 0.03;
        c.moveTo(fx[a], fy[a]);
        c.quadraticCurveTo((fx[a] + fx[b]) / 2 - (fy[b] - fy[a]) * bow, (fy[a] + fy[b]) / 2 + (fx[b] - fx[a]) * bow, fx[b], fy[b]);
        c.stroke();
      }
      // signals: scrolling fires them along the mesh
      if (!still) {
        if (fieldPulses.length < 90 && Math.random() < energy * 1.6) {
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
          // along the same bow as the link it rides
          const bow = (p.e % 2 ? 0.2 : -0.2) + ((p.e % 5) - 2) * 0.03;
          const sgn = p.rev ? -1 : 1;
          const mxq = (fx[a] + fx[b]) / 2 - (fy[b] - fy[a]) * bow * sgn;
          const myq = (fy[a] + fy[b]) / 2 + (fx[b] - fx[a]) * bow * sgn;
          const v = 1 - p.u;
          const x = v * v * fx[a] + 2 * v * p.u * mxq + p.u * p.u * fx[b];
          const y = v * v * fy[a] + 2 * v * p.u * myq + p.u * p.u * fy[b];
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
        if (energy < 0.06) break; // at rest the field shows no neurons at all
        const r = Math.min(5.5, 0.7 + 1.1 / fz[i]);
        const al = fa[i] * energy;
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
      const A = inApp.current ? 0.3 : 0.26;

      // horizon glow
      const hg = c.createLinearGradient(0, hor - h * 0.1, 0, hor + h * 0.16);
      hg.addColorStop(0, "rgba(91,140,255,0)");
      hg.addColorStop(0.45, "rgba(110,150,255,0.07)");
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

      // ── the race: five optimisers start from the same point and each follows
      // its own update rule down the surface's real slope
      if (!still) {
        raceAge += dt;
        // a new race once this one has gone quiet (everyone has settled), or has run long
        if (raceAge > 14 || raceQuiet > 1.4 || opts.every((o) => !o.alive)) {
          raceAge = 0;
          raceQuiet = 0;
          const sx = rand(-2.7, 2.8);
          const sz = rand(5.6, 7.1);
          for (const o of opts) {
            o.x = sx;
            o.z = sz;
            o.mx = o.mz = o.vx = o.vz = 0;
            o.t = 0;
            o.alive = true;
            o.trail.length = 0;
          }
        }
        const e = 0.04;
        const sc = Math.min(2, dt * 60); // the step sizes below are per 60 Hz frame
        let moved = 0;
        for (const o of opts) {
          if (!o.alive) continue;
          const bx = o.x;
          const bz = o.z;
          const gx = (landscape(o.x + e, o.z, time, flow) - landscape(o.x - e, o.z, time, flow)) / (2 * e);
          const gz = (landscape(o.x, o.z + e, time, flow) - landscape(o.x, o.z - e, time, flow)) / (2 * e);
          o.t++;
          if (o.name === "SGD") {
            o.x -= 0.014 * gx * sc;
            o.z -= 0.014 * gz * sc;
          } else if (o.name === "Momentum") {
            o.mx = 0.93 * o.mx + gx;
            o.mz = 0.93 * o.mz + gz;
            o.x -= 0.0019 * o.mx * sc;
            o.z -= 0.0019 * o.mz * sc;
          } else if (o.name === "RMSProp") {
            o.vx = 0.95 * o.vx + 0.05 * gx * gx;
            o.vz = 0.95 * o.vz + 0.05 * gz * gz;
            o.x -= (0.0052 * gx * sc) / Math.sqrt(o.vx + 1e-6);
            o.z -= (0.0052 * gz * sc) / Math.sqrt(o.vz + 1e-6);
          } else if (o.name === "Adam") {
            o.mx = 0.9 * o.mx + 0.1 * gx;
            o.mz = 0.9 * o.mz + 0.1 * gz;
            o.vx = 0.999 * o.vx + 0.001 * gx * gx;
            o.vz = 0.999 * o.vz + 0.001 * gz * gz;
            const c1 = 1 - Math.pow(0.9, o.t);
            const c2 = 1 - Math.pow(0.999, o.t);
            o.x -= (0.0062 * (o.mx / c1) * sc) / (Math.sqrt(o.vx / c2) + 1e-6);
            o.z -= (0.0062 * (o.mz / c1) * sc) / (Math.sqrt(o.vz / c2) + 1e-6);
          } else {
            // AdaGrad: the accumulated squared gradient only grows, so its steps shrink
            o.vx += gx * gx;
            o.vz += gz * gz;
            o.x -= (0.045 * gx * sc) / Math.sqrt(o.vx + 1e-6);
            o.z -= (0.045 * gz * sc) / Math.sqrt(o.vz + 1e-6);
          }
          moved = Math.max(moved, Math.hypot(o.x - bx, o.z - bz));
          if (Math.abs(o.x) > 3.2 || o.z < 2.3 || o.z > 7.6) o.alive = false;
        }
        raceQuiet = moved < 0.0012 * sc ? raceQuiet + dt : 0;
      }
      c.font = `9px ${MONO}`;
      c.textAlign = "left";
      for (let oi = 0; oi < opts.length; oi++) {
        const o = opts[oi];
        if (!o.alive) continue;
        const ok = f / o.z;
        const ox = w / 2 + o.x * ok;
        const oy = hor + (camY - landscape(o.x, o.z, time, flow)) * ok;
        if (Math.abs(vel) > 3) o.trail.length = 0; // the surface is rushing past: an old trail would no longer lie on it
        o.trail.push(ox, oy);
        if (o.trail.length > 110) o.trail.splice(0, 2);
        if (o.trail.length > 3) {
          c.strokeStyle = `rgba(${o.rgb},0.4)`;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(o.trail[0], o.trail[1]);
          for (let i = 2; i < o.trail.length; i += 2) c.lineTo(o.trail[i], o.trail[i + 1]);
          c.stroke();
        }
        c.fillStyle = `rgba(${o.rgb},0.2)`;
        c.beginPath();
        c.arc(ox, oy, 7, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(${o.rgb},0.95)`;
        c.beginPath();
        c.arc(ox, oy, 2.4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(${o.rgb},0.75)`;
        c.fillText(`∇L ${o.name}`, ox + 10, oy - 26 + oi * 11);
      }
    }

    function drawPlanet(off: number) {
      const r = Math.min(w, h) * (small ? 0.42 : 0.5);
      const x = w * 0.96;
      const y = h * 1.04 - off * 0.6;
      const body = c.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.05, x, y, r);
      body.addColorStop(0, "rgba(34,48,112,0.97)");
      body.addColorStop(0.5, "rgba(12,16,46,0.98)");
      body.addColorStop(1, "rgba(3,4,10,1)");
      c.fillStyle = body;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      // atmosphere rim on the lit side
      const rim = c.createRadialGradient(x, y, r * 0.96, x, y, r * 1.06);
      rim.addColorStop(0, "rgba(95,216,245,0.0)");
      rim.addColorStop(0.55, "rgba(120,170,255,0.22)");
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
      const streak = false; // stars stay points; the scroll shows in the neural field, not as streaks
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

    // ── the network. It is the trainer's actual model, laid across the whole
    // viewport and kept dim so the page stays readable. What is drawn is what
    // is happening: a strand's weight sets how visible it is (cyan positive,
    // violet negative), strands whose gradient is large brighten as they are
    // corrected, and signals thread the weave: forward along the strong
    // strands, backward along the ones being corrected.
    function drawNet(time: number, dt: number, still: boolean) {
      const L = NET_LAYERS.length;
      // training: about 30 steps a second, several times that while scrolling
      if (!still) {
        if (trainer.done) {
          holdFor += dt;
          if (holdFor > 3.5) {
            holdFor = 0;
            trainer.reset();
          }
        } else {
          trainDebt += dt * 30 * (1 + energy * 5);
          const n = Math.min(8, Math.floor(trainDebt));
          if (n > 0) {
            trainDebt -= n;
            trainer.train(n);
          }
        }
      }

      // ── where every neuron is: its slot, a slow drift, and a parallax by depth
      const sway = (mxSmooth - 0.5) * 46;
      const lift = Math.sin(scrollY * 0.0011) * 26;
      for (let i = 0; i < net.nodes.length; i++) {
        const n = net.nodes[i];
        px[i] = n.fx * w + n.z * sway + Math.sin(time * 0.21 + n.ph) * 7;
        py[i] = n.fy * h + n.z * lift + Math.cos(time * 0.17 + n.ph * 1.7) * 7;
      }
      // Every strand is an S-curve: it leaves its neuron level, sweeps across,
      // and arrives level, so strands run together like fibres instead of
      // criss-crossing as straight lines. ex is where the sweep happens.
      for (let i = 0; i < net.edges.length; i++) {
        const e = net.edges[i];
        ex[i] = (px[e.a] + px[e.b]) / 2 + (px[e.b] - px[e.a]) * e.c;
      }

      // every few seconds a new sample is followed through the network
      const pass = Math.floor(netPhase / 6);
      if (pass !== lastPass && !still) {
        lastPass = pass;
        trainer.probe();
      }

      const dim = (small ? 0.75 : 1) * (inApp.current ? 0.9 : 0.8);
      c.save();
      c.lineCap = "round";

      // ── the weave: weight magnitude decides how visible a strand is
      const wmax = new Float32Array(L - 1);
      const gmax = new Float32Array(L - 1);
      for (let l = 0; l < L - 1; l++) {
        const ww = trainer.W[l];
        const gg = trainer.G[l];
        let m = 1e-6;
        let g = 1e-9;
        for (let q = 0; q < ww.length; q++) {
          if (Math.abs(ww[q]) > m) m = Math.abs(ww[q]);
          if (gg[q] > g) g = gg[q];
        }
        wmax[l] = m;
        gmax[l] = g;
      }
      // only the stronger half of the weights is drawn at all: fewer, clearer strands
      c.lineWidth = 0.5;
      for (const sign of [1, -1]) {
        for (let bucket = 1; bucket < 3; bucket++) {
          c.strokeStyle = `rgba(${sign > 0 ? "110,215,245" : "165,140,255"},${((bucket === 1 ? 0.028 : 0.058) * dim).toFixed(3)})`;
          c.beginPath();
          for (let i = 0; i < net.edges.length; i++) {
            const e = net.edges[i];
            const wv = trainer.W[e.l][e.q];
            if (wv * sign <= 0) continue;
            const m = Math.abs(wv) / wmax[e.l];
            if ((m < 0.4 ? 0 : m < 0.7 ? 1 : 2) !== bucket) continue;
            c.moveTo(px[e.a], py[e.a]);
            c.bezierCurveTo(ex[i], py[e.a], ex[i], py[e.b], px[e.b], py[e.b]);
          }
          c.stroke();
        }
      }
      // strands being corrected hardest right now (largest gradients)
      if (!still && !trainer.done) {
        c.strokeStyle = `rgba(235,242,255,${(0.075 * dim).toFixed(3)})`;
        c.lineWidth = 0.6;
        c.beginPath();
        for (let i = 0; i < net.edges.length; i++) {
          const e = net.edges[i];
          if (trainer.G[e.l][e.q] / gmax[e.l] < 0.7) continue;
          c.moveTo(px[e.a], py[e.a]);
          c.bezierCurveTo(ex[i], py[e.a], ex[i], py[e.b], px[e.b], py[e.b]);
        }
        c.stroke();
      }

      // ── the traffic. This is what the eye should follow: signals threading
      // the weave. Each strong strand carries a comet of light forward (cyan),
      // each strand whose weight is being corrected hard carries the error
      // back the other way (violet). Every strand keeps its own beat, so the
      // whole network is always in motion rather than flashing in step.
      if (!still) {
        for (let i = 0; i < net.edges.length; i++) {
          const e = net.edges[i];
          const m = Math.abs(trainer.W[e.l][e.q]) / wmax[e.l];
          const g = trainer.done ? 0 : trainer.G[e.l][e.q] / gmax[e.l];
          const back = g > 0.55 && e.ph > 0.7;
          if (!back && (m < 0.45 || e.ph > 0.42)) continue;
          // where the comet's head is along the strand; it rests between runs
          const beat = (netPhase * (back ? 0.3 : 0.24) + e.ph * 7.3 + e.l * 0.31) % 1.7;
          if (beat > 1.3) continue;
          const head = Math.min(1, beat);
          const tail = Math.max(0, beat - 0.34);
          if (tail >= head) continue;
          const a = back ? e.b : e.a;
          const b = back ? e.a : e.b;
          const x0 = px[a];
          const y0 = py[a];
          const x3 = px[b];
          const y3 = py[b];
          const xm = ex[i];
          // points along the strand from tail to head (cubic: level out, sweep, level in)
          const SEG = 7;
          let hx = x0;
          let hy = y0;
          let sx = x0;
          let sy = y0;
          c.beginPath();
          for (let k = 0; k <= SEG; k++) {
            const t = tail + ((head - tail) * k) / SEG;
            const u = 1 - t;
            const bx = u * u * u * x0 + 3 * u * u * t * xm + 3 * u * t * t * xm + t * t * t * x3;
            const by = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y3 + t * t * t * y3;
            if (k === 0) {
              sx = bx;
              sy = by;
              c.moveTo(bx, by);
            } else c.lineTo(bx, by);
            hx = bx;
            hy = by;
          }
          const col = back ? "178,150,255" : "120,228,255";
          const al = (back ? 0.36 : 0.2 + m * 0.22) * dim;
          const grad = c.createLinearGradient(sx, sy, hx, hy);
          grad.addColorStop(0, `rgba(${col},0)`);
          grad.addColorStop(1, `rgba(${col},${al.toFixed(3)})`);
          c.strokeStyle = grad;
          c.lineWidth = 0.9;
          c.stroke();
          if (beat < 1) {
            c.fillStyle = `rgba(235,248,255,${Math.min(0.85, al * 1.7).toFixed(3)})`;
            c.beginPath();
            c.arc(hx, hy, 1.05, 0, Math.PI * 2);
            c.fill();
          }
        }
      }

      // ── neurons: small, steady points. They mark where strands meet; they do not flash.
      c.font = `9px ${MONO}`;
      const r = small ? 1.2 : 1.5;
      c.fillStyle = `rgba(160,180,240,${(0.2 * dim).toFixed(3)})`;
      c.beginPath();
      for (let i = 0; i < net.nodes.length; i++) {
        c.moveTo(px[i] + r, py[i]);
        c.arc(px[i], py[i], r, 0, Math.PI * 2);
      }
      c.fill();
      // what goes in, and what the network answers for the sample being followed
      if (!small) {
        for (let i = 0; i < net.nodes.length; i++) {
          const n = net.nodes[i];
          if (n.l === 0) {
            c.textAlign = "right";
            c.fillStyle = `rgba(170,190,240,${(0.42 * dim).toFixed(3)})`;
            c.fillText(INPUT_NAMES[n.i], px[i] - 8, py[i] + 3);
          } else if (n.l === L - 1) {
            c.textAlign = "right";
            c.fillStyle = `rgba(${classColor(n.i)},${((trainer.probePick === n.i ? 0.8 : 0.4) * dim).toFixed(3)})`;
            c.fillText(`${CLASS_NAMES[n.i]} ${trainer.act[L - 1][n.i].toFixed(2)}`, px[i] - 8, py[i] + 3);
          }
        }
      }
      c.textAlign = "left";
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
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      t += dt;
      frame++;
      if (frame % 90 === 0) docH = document.documentElement.scrollHeight;
      scrollY = window.scrollY;
      const dv = scrollY - lastScrollY;
      lastScrollY = scrollY;
      vel += (dv - vel) * 0.18;
      energy += (clamp(Math.abs(vel) / 24) - energy) * (Math.abs(vel) / 24 > energy ? 0.2 : 0.035);
      netPhase += dt * WAVE_SPEED * (1 + energy * 2);
      mxSmooth += (mx - mxSmooth) * 0.04;
      // Public pages and phones run at half rate; they have their own visuals to pay for.
      acc += dt;
      if ((small || !inApp.current) && frame % 2 === 1) return;
      const step = acc;
      acc = 0;
      // random meteors; a fast scroll shakes a few loose
      nextMeteor -= step;
      if (nextMeteor <= 0) {
        if (Math.random() < 0.12) {
          const n = 4 + Math.floor(Math.random() * 6);
          for (let i = 0; i < n; i++) queued.push(i * rand(0.12, 0.38));
          nextMeteor = rand(3.5, 7);
        } else {
          spawnMeteor();
          nextMeteor = rand(1, 3.4);
        }
      }
      if (Math.abs(vel) > 28 && Math.random() < 0.02) spawnMeteor(true);
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
