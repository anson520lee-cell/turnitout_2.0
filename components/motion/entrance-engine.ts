/**
 * Headings that answer the scroll wheel.
 *
 * Every h1/h2 below the fold is a cloud of particles until you scroll it into
 * view: as the heading rises from the bottom of the window the cloud rushes in
 * from in front of the camera and settles into the letters, and the real text
 * fades in underneath. The assembly is tied to the scroll position, not to a
 * clock, so it runs backwards when you scroll back and the cloud swirls with
 * your scroll speed. Headings already on screen at load (and the welcome line)
 * assemble once by themselves, since there is nothing to scroll yet.
 *
 * Everything else on the page keeps its own entrance (`Reveal`). Nothing runs
 * under `prefers-reduced-motion`.
 */

const SKIP_SEL = "[data-no-entrance],[aria-hidden=true],.sr-only,.greeting";
const LETTER = /[\p{L}\p{N}]/u;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (u: number) => 1 - Math.pow(1 - u, 3);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ particles */

type Cloud = {
  el: HTMLElement;
  mode: "time" | "scroll";
  // time mode
  start: number;
  dur: number;
  shown: boolean;
  // scroll mode
  target: number; // where the scroll position says progress should be
  prog: number; // eased progress actually drawn
  // geometry: particle targets relative to the element's top-left
  rx: Float32Array;
  ry: Float32Array;
  delay: Float32Array;
  zs: Float32Array;
  sx: Float32Array;
  sy: Float32Array;
  sw: Float32Array; // spiral twist on the way in
  sz: Float32Array; // size
  br: Float32Array; // brightness
  n: number;
  ready: boolean;
};

const clouds = new Set<Cloud>();
let layer: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let lastScrollY = 0;
let vel = 0; // smoothed scroll speed, px per frame

function ensureLayer() {
  if (layer) return;
  layer = document.createElement("canvas");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90";
  document.body.appendChild(layer);
  ctx = layer.getContext("2d");
  fit();
  window.addEventListener("resize", fit);
}
function fit() {
  if (!layer) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

/** Rasterise the heading's visible text; the lit pixels become particle targets. */
function sample(cl: Cloud): boolean {
  const el = cl.el;
  const rect = el.getBoundingClientRect();
  const W = Math.ceil(rect.width);
  const H = Math.ceil(rect.height);
  if (!W || !H || W > 3000 || H > 1200) return false;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) return false;
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
      if (r) c.fillText(ch, r.left - rect.left, r.top - rect.top + r.height / 2);
    }
  }
  let step = Math.max(2, Math.round(size / 19));
  const px = c.getImageData(0, 0, W, H).data;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    xs.length = 0;
    ys.length = 0;
    for (let j = 0; j < H; j += step)
      for (let i = 0; i < W; i += step) if (px[(j * W + i) * 4 + 3] > 120) {
        xs.push(i);
        ys.push(j);
      }
    if (xs.length <= 11000) break;
    step += 1;
  }
  if (!xs.length) return false;
  const n = xs.length;
  cl.n = n;
  cl.rx = Float32Array.from(xs);
  cl.ry = Float32Array.from(ys);
  cl.delay = new Float32Array(n);
  cl.zs = new Float32Array(n);
  cl.sx = new Float32Array(n);
  cl.sy = new Float32Array(n);
  cl.sw = new Float32Array(n);
  cl.sz = new Float32Array(n);
  cl.br = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cl.delay[i] = Math.random() * 0.45;
    cl.zs[i] = 0.3 + Math.random() * 0.6; // how far in front of the camera it starts
    cl.sw[i] = (Math.random() - 0.5) * 2.6;
    cl.sz[i] = 0.45 + Math.random() * 0.75;
    cl.br[i] = 0.35 + Math.random() * 0.65;
    const a = Math.random() * Math.PI * 2;
    const r = 50 + Math.pow(Math.random(), 0.7) * 420;
    cl.sx[i] = Math.cos(a) * r;
    cl.sy[i] = Math.sin(a) * r * 0.85;
  }
  cl.ready = true;
  return true;
}

/** Scroll position -> assembly progress: 0 as the heading enters at the bottom, 1 once it is above ~55% of the window. */
function scrollProgress(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  return clamp((innerHeight * 0.98 - y) / (innerHeight * 0.66), 0, 1);
}

function frame(now: number) {
  raf = 0;
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
  const cx = innerWidth / 2;
  const cy = innerHeight / 2;

  for (const cl of [...clouds]) {
    if (!cl.el.isConnected) {
      clouds.delete(cl);
      continue;
    }
    let p: number;
    if (cl.mode === "time") {
      const u = (now - cl.start) / cl.dur;
      if (u < 0) {
        busy = true;
        continue;
      }
      if (u >= 1.08) {
        cl.el.style.transition = "";
        cl.el.style.opacity = "";
        clouds.delete(cl);
        continue;
      }
      if (!cl.shown && u > 0.72) {
        cl.shown = true;
        cl.el.style.transition = "opacity 0.9s ease";
        cl.el.style.opacity = "1";
      }
      p = u;
      busy = true;
    } else {
      cl.target = scrollProgress(cl.el);
      const d = cl.target - cl.prog;
      if (Math.abs(d) > 0.0015) {
        cl.prog += d * 0.075;
        busy = true;
      } else cl.prog = cl.target;
      p = cl.prog;
      cl.el.style.opacity = p >= 0.999 ? "" : String(smooth(0.66, 0.98, p));
      if (p >= 0.999) cl.el.style.transition = "";
      if (p <= 0.001 || p >= 0.999) continue;
      if (!cl.ready && !sample(cl)) {
        cl.el.style.opacity = "";
        clouds.delete(cl);
        continue;
      }
    }
    if (!ctx || !cl.ready) continue;
    const rect = cl.el.getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > innerHeight + 200) continue;
    const fade = cl.mode === "time" ? 1 - smooth(0.8, 1.06, p) : 1 - smooth(0.93, 1, p);
    const drift = vel * 5;
    const tm = now * 0.0016;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#fff";
    for (let i = 0; i < cl.n; i++) {
      const q = clamp((p - cl.delay[i]) / 0.55, 0, 1);
      const e = ease(q);
      const r = 1 - e;
      const k = 1 / (1 - cl.zs[i] * r); // perspective: nearer = larger, further from the centre
      // the offset spirals in: it shrinks and untwists as the particle arrives
      const ang = cl.sw[i] * r * r;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ox = (cl.sx[i] * ca - cl.sy[i] * sa) * r + Math.sin(tm + i) * 3 * r;
      const oy = (cl.sx[i] * sa + cl.sy[i] * ca) * r + Math.cos(tm * 1.3 + i * 0.7) * 3 * r;
      const bx = rect.left + cl.rx[i];
      const by = rect.top + cl.ry[i];
      const x = cx + (bx + ox - cx) * k;
      const y = cy + (by + oy - cy) * k - drift * (k - 1) * r;
      if (x < -20 || x > innerWidth + 20 || y < -20 || y > innerHeight + 20) continue;
      // small points; the nearer ones are a touch larger and softer
      const s = cl.sz[i] * (1 + 0.5 * r) * Math.min(k, 2.2);
      const twinkle = 0.8 + 0.2 * Math.sin(tm * 3 + i * 1.7);
      const a = (0.18 + 0.82 * e) * cl.br[i] * twinkle * fade * (k > 1.6 ? 0.75 : 1);
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
    start: 0,
    dur: 3200,
    shown: false,
    target: 0,
    prog: 0,
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
    ready: false,
  };
}

/** Assemble an element's text from a cloud once, on a clock (for text already on screen at load). */
export function playCloud(el: HTMLElement, delay = 0) {
  if (reduced() || !el.isConnected) return;
  ensureLayer();
  const cl = mk(el, "time");
  cl.start = performance.now() + delay;
  if (!sample(cl)) return;
  el.style.transition = "none";
  el.style.opacity = "0";
  el.style.visibility = "";
  clouds.add(cl);
  wake();
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

  document.querySelectorAll<HTMLElement>("h1,h2").forEach((h) => {
    if (h.closest(SKIP_SEL) || !h.getClientRects().length || !LETTER.test(h.textContent ?? "")) return;
    const el = (h.closest(".depth-title") as HTMLElement | null) ?? h;
    if (seen.has(el)) return;
    seen.add(el);
    mine.push(el);
  });

  ensureLayer();
  let order = 0;
  for (const el of mine) {
    if (scrollProgress(el) >= 0.999) {
      // already on screen: nothing to scroll yet, so assemble once on a clock
      playCloud(el, 150 + order++ * 120);
    } else {
      const cl = mk(el, "scroll");
      el.style.opacity = "0";
      el.style.transition = "none";
      clouds.add(cl);
    }
  }
  document.documentElement.classList.remove("ent-pre");

  const onScroll = () => wake();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  wake();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    for (const cl of clouds) {
      cl.el.style.opacity = "";
      cl.el.style.transition = "";
      cl.el.style.visibility = "";
    }
    clouds.clear();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    dropLayer();
  };
}
