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
  fresh: boolean; // the paths need re-rolling before the next approach
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
    cl.sw[i] = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.4); // sideways bow of the path
    cl.zs[i] = Math.random(); // depth: 1 is close to the camera
    cl.delay[i] = Math.random() * 0.5;
    cl.sz[i] = 0.6 + Math.random() * 0.9;
    cl.br[i] = 0.55 + Math.random() * 0.45;
  }
  cl.fresh = false;
}

/**
 * Rasterise an element's visible text; the lit pixels are returned relative to
 * its top-left corner. `perPx` is the font size divided by the grid step: a
 * bigger number gives a denser cloud.
 */
function rasterise(el: HTMLElement, perPx: number, cap = 14000): { x: number[]; y: number[] } | null {
  const rect = el.getBoundingClientRect();
  const W = Math.ceil(rect.width);
  const H = Math.ceil(rect.height);
  if (!W || !H || W > 3000 || H > 1200) return null;
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
      if (r) c.fillText(ch, r.left - rect.left, r.top - rect.top + r.height / 2);
    }
  }
  let step = Math.max(2, Math.round(size / perPx));
  const px = c.getImageData(0, 0, W, H).data;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    xs.length = 0;
    ys.length = 0;
    for (let j = 0; j < H; j += step)
      for (let i = 0; i < W; i += step) if (px[(j * W + i) * 4 + 3] > 120) {
        xs.push(i);
        ys.push(j);
      }
    if (xs.length <= cap) break;
    step += 1;
  }
  return xs.length ? { x: xs, y: ys } : null;
}

function sample(cl: Cloud): boolean {
  const pts = rasterise(cl.el, 23);
  if (!pts) return false;
  const n = pts.x.length;
  cl.n = n;
  cl.rx = Float32Array.from(pts.x);
  cl.ry = Float32Array.from(pts.y);
  cl.delay = new Float32Array(n);
  cl.zs = new Float32Array(n);
  cl.sx = new Float32Array(n);
  cl.sy = new Float32Array(n);
  cl.sw = new Float32Array(n);
  cl.sz = new Float32Array(n);
  cl.br = new Float32Array(n);
  randomize(cl);
  cl.ready = true;
  return true;
}

/* ------------------------------------------------------------------ link: one block dissolves into the next */

type Link = {
  a: HTMLElement; // the welcome line
  b: HTMLElement; // the headline it turns into
  prog: number;
  active: boolean;
  ready: boolean;
  n: number;
  ax: Float32Array;
  ay: Float32Array;
  bx: Float32Array;
  by: Float32Array;
  delay: Float32Array;
  zs: Float32Array;
  sw: Float32Array;
  sc: Float32Array; // how far it bursts outward mid-flight
  sd: Float32Array;
  sz: Float32Array;
  br: Float32Array;
};
const links = new Set<Link>();
const linkTarget = () => clamp(scrollY / (innerHeight * 0.7), 0, 1);

function ranked(xs: number[], n: number): number[] {
  const idx = xs.map((_, i) => i).sort((i, j) => xs[i] - xs[j]);
  const out: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const f = (k / n) * idx.length + (Math.random() - 0.5) * idx.length * 0.08;
    out[k] = idx[clamp(Math.floor(f), 0, idx.length - 1)];
  }
  return out;
}

function prepLink(l: Link): boolean {
  const A = rasterise(l.a, 34, 9000);
  const B = rasterise(l.b, 23, 12000);
  if (!A || !B) return false;
  const n = Math.min(Math.max(A.x.length, B.x.length), 12000);
  const ia = ranked(A.x, n);
  const ib = ranked(B.x, n);
  l.n = n;
  l.ax = new Float32Array(n);
  l.ay = new Float32Array(n);
  l.bx = new Float32Array(n);
  l.by = new Float32Array(n);
  l.delay = new Float32Array(n);
  l.zs = new Float32Array(n);
  l.sw = new Float32Array(n);
  l.sc = new Float32Array(n);
  l.sd = new Float32Array(n);
  l.sz = new Float32Array(n);
  l.br = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l.ax[i] = A.x[ia[i]];
    l.ay[i] = A.y[ia[i]];
    l.bx[i] = B.x[ib[i]];
    l.by[i] = B.y[ib[i]];
    l.delay[i] = Math.random() * 0.4;
    l.zs[i] = Math.random();
    l.sw[i] = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.35);
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 170;
    l.sc[i] = Math.cos(a) * r;
    l.sd[i] = Math.sin(a) * r;
    l.sz[i] = 0.6 + Math.random() * 0.9;
    l.br[i] = 0.55 + Math.random() * 0.45;
  }
  l.ready = true;
  return true;
}

function drawLink(l: Link, now: number) {
  if (!ctx) return;
  const p = l.prog;
  const ra = l.a.getBoundingClientRect();
  const rb = l.b.getBoundingClientRect();
  const tm = now * 0.0016;
  const drift = vel * 5;
  const hold = smooth(0, 0.1, p); // the dots take over from the letters
  const fade = 1 - smooth(0.82, 1, p);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#fff";
  for (let i = 0; i < l.n; i++) {
    const q = clamp((p - l.delay[i]) / 0.55, 0, 1);
    const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
    const sx = ra.left + l.ax[i];
    const sy = ra.top + l.ay[i];
    const tx = rb.left + l.bx[i];
    const ty = rb.top + l.by[i];
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const lift = Math.sin(Math.PI * e);
    const bow = l.sw[i] * len * lift;
    const wob = lift * 6;
    const x = sx + dx * e - (dy / len) * bow + l.sc[i] * lift * 0.6 + Math.sin(tm * (1 + l.zs[i]) + i) * wob;
    const y = sy + dy * e + (dx / len) * bow + l.sd[i] * lift * 0.6 + Math.cos(tm * 1.3 + i * 0.7) * wob - drift * l.zs[i] * lift;
    if (x < -20 || x > innerWidth + 20 || y < -20 || y > innerHeight + 20) continue;
    const s = l.sz[i] * (0.9 + 0.9 * l.zs[i] * lift);
    const twinkle = 0.8 + 0.2 * Math.sin(tm * 3 + i * 1.7);
    const a = hold * l.br[i] * twinkle * fade * (1 - 0.25 * l.zs[i] * lift);
    if (a <= 0.015) continue;
    ctx.globalAlpha = a;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
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

  for (const l of [...links]) {
    if (!l.a.isConnected || !l.b.isConnected) {
      links.delete(l);
      continue;
    }
    const target = linkTarget();
    const d = target - l.prog;
    if (Math.abs(d) > 0.0015) {
      l.prog += d * 0.09;
      busy = true;
    } else l.prog = target;
    const p = l.prog;
    if (p > 0.001) {
      l.active = true;
      l.a.style.opacity = String(1 - smooth(0, 0.16, p));
    } else if (l.active) {
      l.active = false;
      l.a.style.opacity = "";
    }
    l.b.style.opacity = p >= 0.999 ? "" : String(smooth(0.7, 1, p));
    if (p >= 0.999) l.b.style.transition = "";
    if (p > 0.001 && p < 0.999 && (l.ready || prepLink(l))) drawLink(l, now);
  }

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
      if (p <= 0.001) {
        cl.fresh = true;
        continue;
      }
      if (p >= 0.999) continue;
      if (!cl.ready && !sample(cl)) {
        cl.el.style.opacity = "";
        clouds.delete(cl);
        continue;
      }
    }
    if (!ctx || !cl.ready) continue;
    if (cl.fresh) randomize(cl);
    const rect = cl.el.getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > innerHeight + 200) continue;
    const fade = cl.mode === "time" ? 1 - smooth(0.8, 1.06, p) : 1 - smooth(0.93, 1, p);
    const drift = vel * 5;
    const tm = now * 0.0016;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#fff";
    for (let i = 0; i < cl.n; i++) {
      const q = clamp((p - cl.delay[i]) / 0.5, 0, 1);
      if (q <= 0) continue;
      const e = 1 - Math.pow(1 - q, 2.2 + cl.zs[i] * 1.2); // nearer ones arrive more abruptly
      const r = 1 - e;
      const tx = rect.left + cl.rx[i];
      const ty = rect.top + cl.ry[i];
      const dx = tx - cl.sx[i];
      const dy = ty - cl.sy[i];
      const len = Math.hypot(dx, dy) || 1;
      const bow = cl.sw[i] * len * Math.sin(Math.PI * e); // curved, never a straight line
      const wob = 5 * r;
      const x = cl.sx[i] + dx * e - (dy / len) * bow + Math.sin(tm * (1 + cl.zs[i]) + i) * wob;
      const y = cl.sy[i] + dy * e + (dx / len) * bow + Math.cos(tm * 1.3 + i * 0.7) * wob - drift * cl.zs[i] * r;
      if (x < -20 || x > innerWidth + 20 || y < -20 || y > innerHeight + 20) continue;
      // small points; the ones nearer the camera are a touch larger and softer
      const s = cl.sz[i] * (0.8 + 1.1 * cl.zs[i] * r);
      const twinkle = 0.8 + 0.2 * Math.sin(tm * 3 + i * 1.7);
      const a = (0.55 + 0.45 * e) * cl.br[i] * twinkle * fade * (1 - 0.25 * cl.zs[i] * r);
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
    fresh: false,
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
  // the welcome line dissolves into the page's main headline as you scroll
  const greet = document.querySelector<HTMLElement>(".greeting");
  const headline = document.querySelector<HTMLElement>(".depth-title");
  let linked: HTMLElement | null = null;
  if (greet && headline && mine.includes(headline)) {
    linked = headline;
    links.add({
      a: greet,
      b: headline,
      prog: linkTarget(),
      active: false,
      ready: false,
      n: 0,
      ax: new Float32Array(0),
      ay: new Float32Array(0),
      bx: new Float32Array(0),
      by: new Float32Array(0),
      delay: new Float32Array(0),
      zs: new Float32Array(0),
      sw: new Float32Array(0),
      sc: new Float32Array(0),
      sd: new Float32Array(0),
      sz: new Float32Array(0),
      br: new Float32Array(0),
    });
    headline.style.transition = "none";
    headline.style.opacity = linkTarget() >= 0.999 ? "" : "0";
  }
  let order = 0;
  for (const el of mine) {
    if (el === linked) continue;
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
  const onResize = () => {
    for (const l of links) l.ready = false;
    for (const c of clouds) c.ready = false;
    wake();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  wake();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    for (const l of links) {
      l.a.style.opacity = "";
      l.b.style.opacity = "";
      l.b.style.transition = "";
    }
    links.clear();
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
