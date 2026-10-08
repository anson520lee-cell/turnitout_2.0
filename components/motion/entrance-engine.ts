/**
 * Headings made of particles.
 *
 * Every h1/h2/h3 is drawn as a field of small white particles that sit exactly
 * where the letters of its real text are. The real text stays in the page (for
 * search engines, screen readers, copy and paste, and as the template the
 * particles are sampled from) but is not painted: what you see is the
 * particles, before, during and after the assembly.
 *
 * Below the fold the assembly follows the scroll position, not a clock: the
 * particles start outside the window, drift in from every side on curved paths
 * and settle into the letter shapes as the heading rises, so it runs backwards
 * when you scroll back, and fast or slow scrolling assembles fast or slow.
 * Headings already on screen at load assemble once by themselves.
 *
 * Everything else on the page keeps its own entrance (`Reveal`). Nothing runs
 * under `prefers-reduced-motion`.
 */

const SKIP_SEL = "[data-no-entrance],[aria-hidden=true],.sr-only";
const LETTER = /[\p{L}\p{N}]/u;
const DOT = 1.4; // resting particle size for display headings, CSS px
const DOT_SMALL = 1.05; // for card and sub-headings

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ particles */

type Cloud = {
  el: HTMLElement;
  mode: "time" | "scroll";
  text: string; // the text the particles were sampled from
  // time mode
  start: number;
  dur: number;
  // scroll mode
  target: number; // where the scroll position says progress should be
  prog: number; // eased progress actually drawn
  // geometry: particle targets relative to the element's top-left
  w: number;
  h: number;
  rx: Float32Array;
  ry: Float32Array;
  delay: Float32Array;
  zs: Float32Array;
  sx: Float32Array; // start, viewport coordinates, outside the window
  sy: Float32Array;
  sw: Float32Array; // sideways bow of the path
  sz: Float32Array; // size in flight
  br: Float32Array; // brightness in flight
  n: number;
  dot: number; // resting particle size
  ready: boolean;
  fresh: boolean; // the paths need re-rolling before the next approach
  sprite: HTMLCanvasElement | null; // the finished heading, drawn once
};

const clouds = new Set<Cloud>();
let layer: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let lastScrollY = 0;
let vel = 0; // smoothed scroll speed, px per frame
let lastNow = 0;

const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);

function ensureLayer() {
  if (layer) return;
  layer = document.createElement("canvas");
  layer.setAttribute("aria-hidden", "true");
  // under the fixed header (z-50), over the page
  layer.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30";
  document.body.appendChild(layer);
  ctx = layer.getContext("2d");
  fit();
  window.addEventListener("resize", fit);
}
function fit() {
  if (!layer) return;
  const dpr = dprNow();
  layer.width = Math.round(innerWidth * dpr);
  layer.height = Math.round(innerHeight * dpr);
}
function dropLayer() {
  if (!layer) return;
  window.removeEventListener("resize", fit);
  layer.remove();
  layer = null;
  ctx = null;
}

/**
 * Give every particle a fresh, different journey: a start point outside the
 * window (any side, any distance), a curved path with its own bow, its own
 * depth and its own timing. Called again each time a heading is approached.
 */
function randomize(cl: Cloud) {
  const W = innerWidth;
  const H = innerHeight;
  for (let i = 0; i < cl.n; i++) {
    const side = Math.floor(Math.random() * 4);
    const out = 20 + Math.pow(Math.random(), 1.5) * 300; // how far beyond the edge
    const along = Math.random();
    let x: number;
    let y: number;
    if (side === 0) {
      x = -out;
      y = along * H * 1.3 - H * 0.15;
    } else if (side === 1) {
      x = W + out;
      y = along * H * 1.3 - H * 0.15;
    } else if (side === 2) {
      x = along * W * 1.3 - W * 0.15;
      y = -out;
    } else {
      x = along * W * 1.3 - W * 0.15;
      y = H + out;
    }
    cl.sx[i] = x;
    cl.sy[i] = y;
    cl.sw[i] = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.4);
    cl.zs[i] = Math.random(); // depth: 1 is close to the camera
    cl.delay[i] = Math.random() * 0.5;
    cl.sz[i] = 0.6 + Math.random() * 0.9;
    cl.br[i] = 0.55 + Math.random() * 0.45;
  }
  cl.fresh = false;
}

/**
 * Rasterise the heading's real text (the template); the lit pixels, relative to
 * its top-left corner, are where the particles go. `perPx` is the font size
 * divided by the grid step: a bigger number gives a denser field.
 */
function rasterise(el: HTMLElement, perPx: number, cap: number): { x: number[]; y: number[]; size: number } | null {
  const rect = el.getBoundingClientRect();
  // layout size, free of any transform an entrance animation has on the heading right now
  const W = el.offsetWidth;
  const H = el.offsetHeight;
  if (!W || !H || !rect.width || !rect.height || W > 3000 || H > 1200) return null;
  const kx = W / rect.width;
  const ky = H / rect.height;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  c.fillStyle = "#fff";
  c.textBaseline = "middle";
  const rg = document.createRange();
  let size = 16;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n as Text;
    const p = t.parentElement;
    if (!p || p.closest("[aria-hidden=true]") || !LETTER.test(t.data)) continue;
    const cs = getComputedStyle(p);
    size = parseFloat(cs.fontSize) || size;
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    for (let i = 0; i < t.data.length; i++) {
      const ch = t.data[i];
      if (!ch.trim()) continue;
      rg.setStart(t, i);
      rg.setEnd(t, i + 1);
      const r = rg.getClientRects()[0];
      if (r) c.fillText(ch, (r.left - rect.left) * kx, (r.top - rect.top + r.height / 2) * ky);
    }
  }
  let step = Math.max(size < 26 ? 1 : 1.25, size / perPx);
  const px = c.getImageData(0, 0, W, H).data;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    xs.length = 0;
    ys.length = 0;
    for (let j = 0; j < H; j += step)
      for (let i = 0; i < W; i += step) if (px[(Math.floor(j) * W + Math.floor(i)) * 4 + 3] > 120) {
        xs.push(i);
        ys.push(j);
      }
    if (xs.length <= cap) break;
    step += 0.3;
  }
  return xs.length ? { x: xs, y: ys, size } : null;
}

function sample(cl: Cloud): boolean {
  const pts = rasterise(cl.el, 54, 22000);
  if (!pts) return false;
  const n = pts.x.length;
  cl.dot = pts.size < 26 ? DOT_SMALL : DOT;
  cl.w = cl.el.offsetWidth;
  cl.h = cl.el.offsetHeight;
  cl.text = cl.el.textContent ?? "";
  cl.n = n;
  // a touch of grain so the letters read as particles, not as a grid
  cl.rx = Float32Array.from(pts.x, (v) => v + (Math.random() - 0.5) * 0.9);
  cl.ry = Float32Array.from(pts.y, (v) => v + (Math.random() - 0.5) * 0.9);
  cl.delay = new Float32Array(n);
  cl.zs = new Float32Array(n);
  cl.sx = new Float32Array(n);
  cl.sy = new Float32Array(n);
  cl.sw = new Float32Array(n);
  cl.sz = new Float32Array(n);
  cl.br = new Float32Array(n);
  cl.sprite = null;
  randomize(cl);
  cl.ready = true;
  return true;
}

/** The finished heading: every particle at rest, drawn once and reused while scrolling. */
function makeSprite(cl: Cloud): HTMLCanvasElement {
  const D = cl.dot;
  const dpr = dprNow();
  const cv = document.createElement("canvas");
  cv.width = Math.ceil((cl.w + 8) * dpr);
  cv.height = Math.ceil((cl.h + 8) * dpr);
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  c.fillStyle = "#fff";
  // a soft halo, a brighter ring, then the crisp white core
  const small = D < 1.2; // small headings stay crisp: less glow
  c.globalAlpha = small ? 0 : 0.05;
  for (let i = 0; i < cl.n; i++) c.fillRect(cl.rx[i] + 4 - D * 1.5, cl.ry[i] + 4 - D * 1.5, D * 3, D * 3);
  c.globalAlpha = small ? 0.07 : 0.16;
  for (let i = 0; i < cl.n; i++) c.fillRect(cl.rx[i] + 4 - D, cl.ry[i] + 4 - D, D * 2, D * 2);
  c.globalAlpha = 1;
  for (let i = 0; i < cl.n; i++) c.fillRect(cl.rx[i] + 4 - D * 0.6, cl.ry[i] + 4 - D * 0.6, D * 1.2, D * 1.2);
  return cv;
}

/** Scroll position -> assembly progress: 0 just before the heading enters at the bottom, 1 once it has risen to ~40% of the window. */
function scrollProgress(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  return clamp((innerHeight * 1.08 - y) / (innerHeight * 0.66), 0, 1);
}

function frame(now: number) {
  raf = 0;
  const dt = clamp(lastNow ? now - lastNow : 16, 8, 64);
  lastNow = now;
  const sy = scrollY;
  vel += (clamp(sy - lastScrollY, -120, 120) - vel) * 0.25;
  lastScrollY = sy;
  let busy = false;

  if (ctx && layer) {
    const dpr = layer.width / innerWidth;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  for (const cl of [...clouds]) {
    if (!cl.el.isConnected) {
      clouds.delete(cl);
      continue;
    }
    // the heading's text changed: sample it again
    if (cl.ready && (cl.el.textContent ?? "") !== cl.text) cl.ready = false;

    let p: number;
    if (cl.mode === "time") {
      const u = (now - cl.start) / cl.dur;
      if (u < 0) {
        busy = true;
        continue;
      }
      p = clamp(u, 0, 1);
      if (u < 1) busy = true;
    } else {
      cl.target = scrollProgress(cl.el);
      const d = cl.target - cl.prog;
      if (Math.abs(d) > 0.0015) {
        cl.prog += d * (1 - Math.exp(-dt / 40)); // follows the scroll closely: fast scroll, fast assembly
        busy = true;
      } else cl.prog = cl.target;
      p = cl.prog;
      if (p <= 0.001) {
        cl.fresh = true; // re-roll the paths for the next approach
        continue;
      }
    }
    if (!ctx) continue;
    const rect = cl.el.getBoundingClientRect();
    if (rect.bottom < -60 || rect.top > innerHeight + 60) continue;
    if (!cl.ready && !sample(cl)) {
      cl.el.style.opacity = ""; // nothing to sample: show the plain text
      clouds.delete(cl);
      continue;
    }

    // finished: the heading is the sprite
    const kx = rect.width / cl.w;
    const ky = rect.height / cl.h;
    if (p >= 0.999) {
      if (!cl.sprite) cl.sprite = makeSprite(cl);
      ctx.globalCompositeOperation = "lighter"; // overlapping glow adds up: whiter, brighter
      ctx.drawImage(cl.sprite, rect.left - 4 * kx, rect.top - 4 * ky, (cl.w + 8) * kx, (cl.h + 8) * ky);
      ctx.globalCompositeOperation = "source-over";
      continue;
    }

    if (cl.fresh) randomize(cl);
    const drift = vel * 5;
    const tm = now * 0.0016;
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#fff";
    for (let i = 0; i < cl.n; i++) {
      const q = clamp((p - cl.delay[i]) / 0.5, 0, 1);
      if (q <= 0) continue;
      const e = 1 - Math.pow(1 - q, 2.2 + cl.zs[i] * 1.2); // nearer ones arrive more abruptly
      const r = 1 - e;
      const tx = rect.left + cl.rx[i] * kx;
      const ty = rect.top + cl.ry[i] * ky;
      const dx = tx - cl.sx[i];
      const dy = ty - cl.sy[i];
      const len = Math.hypot(dx, dy) || 1;
      const bow = cl.sw[i] * len * Math.sin(Math.PI * e); // curved, never a straight line
      const wob = 5 * r;
      const px = cl.sx[i] + dx * e - (dy / len) * bow + Math.sin(tm * (1 + cl.zs[i]) + i) * wob;
      const py = cl.sy[i] + dy * e + (dx / len) * bow + Math.cos(tm * 1.3 + i * 0.7) * wob - drift * cl.zs[i] * r;
      // depth: far away it is small and near the middle of the view, and it rushes out
      // toward you, growing, as it settles onto the page
      const k = 1 / (1 - cl.zs[i] * 0.62 * r);
      const x = cx + (px - cx) * k;
      const y = cy + (py - cy) * k;
      if (x < -30 || x > innerWidth + 30 || y < -30 || y > innerHeight + 30) continue;
      // in flight each particle is its own size and brightness; on arrival they all match
      const s = cl.sz[i] * (0.8 + 1.1 * cl.zs[i] * r) * Math.min(k, 2.2) * r + cl.dot * e;
      const twinkle = 0.8 + 0.2 * Math.sin(tm * 3 + i * 1.7);
      const a = (cl.br[i] * twinkle * (1 - 0.25 * cl.zs[i] * r)) * r + 0.96 * e;
      if (a <= 0.015) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  if (Math.abs(vel) > 0.4) busy = true;
  if (busy) raf = requestAnimationFrame(frame);
}
const wake = () => {
  if (!raf) raf = requestAnimationFrame(frame);
};

function mk(el: HTMLElement, mode: Cloud["mode"]): Cloud {
  return {
    el,
    mode,
    text: "",
    start: 0,
    dur: 3200,
    target: 0,
    prog: 0,
    w: 0,
    h: 0,
    rx: new Float32Array(0),
    ry: new Float32Array(0),
    delay: new Float32Array(0),
    zs: new Float32Array(0),
    sx: new Float32Array(0),
    sy: new Float32Array(0),
    sw: new Float32Array(0),
    sz: new Float32Array(0),
    br: new Float32Array(0),
    n: 0,
    dot: DOT,
    ready: false,
    fresh: false,
    sprite: null,
  };
}

/* ------------------------------------------------------------------ page scan */

export function startEntrance(): () => void {
  if (typeof window === "undefined" || reduced()) {
    document.documentElement.classList.remove("ent-pre");
    return () => {};
  }
  const seen = new Set<HTMLElement>();
  const mine: HTMLElement[] = [];
  lastScrollY = scrollY;
  lastNow = 0;

  document.querySelectorAll<HTMLElement>("h1,h2,h3").forEach((h) => {
    if (h.closest(SKIP_SEL) || !h.getClientRects().length || !LETTER.test(h.textContent ?? "")) return;
    const el = (h.closest(".depth-title") as HTMLElement | null) ?? h;
    if (seen.has(el)) return;
    seen.add(el);
    mine.push(el);
  });

  ensureLayer();
  let order = 0;
  const t0 = performance.now();
  for (const el of mine) {
    const box = el.getBoundingClientRect();
    const onScreen = box.top + box.height / 2 < innerHeight * 0.8;
    const cl = mk(el, onScreen ? "time" : "scroll");
    if (onScreen) cl.start = t0 + 150 + order++ * 120; // already visible: assemble once on a clock
    // the real text stays in the page as the template, but is not painted
    el.style.opacity = "0";
    el.style.transition = "none";
    clouds.add(cl);
  }
  document.documentElement.classList.remove("ent-pre");

  const onScroll = () => wake();
  const onResize = () => {
    for (const c of clouds) {
      c.ready = false;
      c.sprite = null;
    }
    wake();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  wake();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    for (const cl of clouds) {
      cl.el.style.opacity = "";
      cl.el.style.transition = "";
    }
    clouds.clear();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    dropLayer();
  };
}
