/**
 * The site's single pointer loop. It turns mouse movement into CSS variables
 * and compositor-only transforms; no React state is touched per frame.
 *
 * Every frame (only while something is still moving):
 * - A "light" follows the cursor on a soft spring. The page-wide light layers
 *   are moved with `transform`, and glass surfaces are lit from this point:
 *   anything within reach gets `--px/--py` (light position inside it, which may
 *   lie outside its box), `--lit` (0…1 by distance) and `--shx/--shy` (a cast
 *   shadow offset pointing away from the light). So edges nearest the cursor
 *   start to catch the light before you reach them.
 * - The hovered `[data-tilt]` element leans toward the cursor on a spring
 *   (`--rx/--ry` in degrees, `--lift` 0…1, `--gx/--gy` -0.5…0.5 for glare and
 *   popped layers) and springs back with a little overshoot when left.
 * - `.magnetic` elements within reach are pulled toward the cursor
 *   (`--tx/--ty`), with `--bx/--by` for their highlight.
 * - `[data-depth]` and `[data-cursor]` elements get `--cx/--cy` (-1…1 across
 *   the viewport, smoothed) for parallax and anything else that follows the
 *   light; their subtrees inherit them. They are written per element, never
 *   on :root, because a custom property changed on :root restyles the whole
 *   document every frame.
 * - Components can join the same loop with `onPointerFrame`.
 *
 * Layout reads are limited to the element being hovered (measured once when
 * the hover starts). Nearby surfaces use rectangles cached from an
 * IntersectionObserver, offset by the scroll position.
 */

import { PRESSABLE } from "./press-effects";

export interface PointerState {
  /** Raw pointer, px. */
  x: number;
  y: number;
  /** The lagging light the page is lit from, px. */
  lx: number;
  ly: number;
  /** Smoothed pointer across the viewport, -1…1 (y points down). */
  cx: number;
  cy: number;
  /** Smoothed pointer speed, px/s. */
  speed: number;
  /** True while a mouse is over the page. */
  inside: boolean;
  /** Seconds since start, and this frame's delta. */
  time: number;
  dt: number;
  /** `time` of the most recent primary click, or -1. */
  clickAt: number;
}

export const pointer: PointerState = {
  x: -9999,
  y: -9999,
  lx: -9999,
  ly: -9999,
  cx: 0,
  cy: 0,
  speed: 0,
  inside: false,
  time: 0,
  dt: 1 / 60,
  clickAt: -1,
};

/** Return true to be called again next frame (e.g. while animating). */
export type FrameListener = (p: PointerState) => boolean | void;

const listeners = new Set<FrameListener>();
let wakeLoop: () => void = () => {};
let active = false;

/** Join the shared loop. Returns an unsubscribe function. */
export function onPointerFrame(fn: FrameListener) {
  listeners.add(fn);
  wakeLoop();
  return () => {
    listeners.delete(fn);
  };
}

/**
 * True when the engine is running (fine pointer, motion allowed). Note that
 * the engine starts in the root layout's effect, after the page's own effects
 * have run; subscribe with `onPointerFrame` regardless, it is a no-op without
 * the engine.
 */
export function pointerEngineActive() {
  return active;
}

export interface EngineLayers {
  /** Large light behind the content. Centered on its own box. */
  back: HTMLElement;
  /** Grid inside `back`, counter-moved so it stays fixed to the page. */
  backGrid?: HTMLElement | null;
  /** Small soft glow above the content. */
  halo: HTMLElement;
  /** Container click ripples are appended to. */
  ripples: HTMLElement;
}

/* ------------------------------------------------------------------ */

interface Spring {
  x: number;
  v: number;
}
const settled = (s: Spring, target: number, eps = 0.01) => Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;
function step(s: Spring, target: number, k: number, c: number, dt: number) {
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

interface Tracked {
  el: HTMLElement;
  /** Document coordinates, or viewport coordinates when `fixed`. */
  left: number;
  top: number;
  w: number;
  h: number;
  fixed: boolean;
  /** Inside a sticky container: position unknown without measuring. */
  pinned: boolean;
  glass: boolean;
  magnetic: boolean;
  /** Receives --cx/--cy. */
  follows: boolean;
  lit: boolean;
}

interface Tilt {
  rect: { left: number; top: number; w: number; h: number; sx: number; sy: number };
  hover: boolean;
  strength: number;
  rx: Spring;
  ry: Spring;
  lift: Spring;
}

interface Magnet {
  tx: Spring;
  ty: Spring;
  target: [number, number];
}

const SURFACES = ".glass, .glass-strong, .magnetic, [data-depth], [data-cursor]";
const LIGHT_REACH = 240;
const MAGNET_REACH = 44;

const LIT_PROPS = ["--px", "--py", "--lit", "--shx", "--shy"];
const TILT_PROPS = ["--rx", "--ry", "--lift", "--gx", "--gy"];
const MAGNET_PROPS = ["--tx", "--ty", "--bx", "--by"];

function unset(el: HTMLElement, props: string[]) {
  for (const p of props) el.style.removeProperty(p);
}

/**
 * Start the engine. Returns a stop function. Call only for a fine pointer
 * with motion allowed; the CSS effects stay inert otherwise.
 */
export function startPointerEngine(layers: EngineLayers) {
  const root = document.documentElement;
  root.dataset.interactive = "true";
  active = true;

  let raf = 0;
  let last = 0;
  let moved = 0;
  let target: Element | null = null;
  let hitDirty = false;
  let pressed = false;
  let overControl = false;

  const light = { x: { x: -9999, v: 0 }, y: { x: -9999, v: 0 } };
  const halo = { x: { x: -9999, v: 0 }, y: { x: -9999, v: 0 } };
  const haloScale: Spring = { x: 1, v: 0 };
  const cxy = { wx: 0, wy: 0 };

  // The back layer is centered on the light with negative margins; its size
  // only changes with the viewport, so it is measured once and on resize.
  let backHalf = layers.back.offsetWidth / 2;
  const onResize = () => {
    backHalf = layers.back.offsetWidth / 2;
  };

  const tracked = new Map<Element, Tracked>();
  const observed = new WeakSet<Element>();
  const tilts = new Map<HTMLElement, Tilt>();
  const magnets = new Map<HTMLElement, Magnet>();

  let hoverGlass: HTMLElement | null = null;
  let hoverRect = { left: 0, top: 0, w: 0, h: 0, sx: 0, sy: 0 };
  let tiltHover: HTMLElement | null = null;

  const measure = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, sx: window.scrollX, sy: window.scrollY };
  };

  /* ---- surface registry ---- */
  const io = new IntersectionObserver(
    (entries) => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (!e.isIntersecting) {
          const t = tracked.get(el);
          if (t?.lit) unset(el, LIT_PROPS);
          tracked.delete(el);
          continue;
        }
        const r = e.boundingClientRect;
        const fixed = !!el.closest(".fixed, dialog");
        const prev = tracked.get(el);
        tracked.set(el, {
          el,
          left: fixed ? r.left : r.left + sx,
          top: fixed ? r.top : r.top + sy,
          w: r.width,
          h: r.height,
          fixed,
          pinned: !fixed && !!el.closest(".sticky"),
          glass: el.classList.contains("glass") || el.classList.contains("glass-strong"),
          magnetic: el.classList.contains("magnetic"),
          follows: el.hasAttribute("data-depth") || el.hasAttribute("data-cursor"),
          lit: prev?.lit ?? false,
        });
        // Entering view: bring it up to date with the current light.
        if (el.hasAttribute("data-depth") || el.hasAttribute("data-cursor")) {
          el.style.setProperty("--cx", pointer.cx.toFixed(3));
          el.style.setProperty("--cy", pointer.cy.toFixed(3));
        }
      }
      wakeLoop();
    },
    { rootMargin: `${LIGHT_REACH}px`, threshold: [0, 0.25, 0.5, 0.75, 1] },
  );

  const scan = () => {
    document.querySelectorAll<HTMLElement>(SURFACES).forEach((el) => {
      if (observed.has(el)) return;
      observed.add(el);
      io.observe(el);
    });
  };
  let scanTimer = 0;
  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 160);
  };
  // Layout changed (resize, accordion, route): re-observe for fresh rects.
  let remeasureTimer = 0;
  const remeasure = () => {
    window.clearTimeout(remeasureTimer);
    remeasureTimer = window.setTimeout(() => {
      io.disconnect();
      document.querySelectorAll<HTMLElement>(SURFACES).forEach((el) => {
        observed.add(el);
        io.observe(el);
      });
    }, 180);
  };
  const mo = new MutationObserver(scheduleScan);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  const ro = new ResizeObserver(remeasure);
  ro.observe(document.body);
  scan();

  /* ---- per-frame work ---- */
  const lightSurfaces = () => {
    const lx = light.x.x;
    const ly = light.y.x;
    const sx = window.scrollX;
    const sy = window.scrollY;
    for (const t of tracked.values()) {
      if (!t.glass) continue;
      const hovered = t.el === hoverGlass;
      let left: number, top: number, w: number, h: number;
      if (hovered) {
        left = hoverRect.left - (t.fixed ? 0 : sx - hoverRect.sx);
        top = hoverRect.top - (t.fixed ? 0 : sy - hoverRect.sy);
        w = hoverRect.w;
        h = hoverRect.h;
      } else if (t.pinned || !pointer.inside) {
        if (t.lit) {
          unset(t.el, LIT_PROPS);
          t.lit = false;
        }
        continue;
      } else {
        left = t.fixed ? t.left : t.left - sx;
        top = t.fixed ? t.top : t.top - sy;
        w = t.w;
        h = t.h;
      }
      const dx = lx < left ? left - lx : lx > left + w ? lx - left - w : 0;
      const dy = ly < top ? top - ly : ly > top + h ? ly - top - h : 0;
      const p = hovered && pointer.inside ? 1 : smooth(clamp(1 - Math.hypot(dx, dy) / LIGHT_REACH, 0, 1)) * 0.8;
      if (p < 0.01) {
        if (t.lit) {
          unset(t.el, LIT_PROPS);
          t.lit = false;
        }
        continue;
      }
      // Direction from the surface's center to the light, -1…1.
      const nx = clamp((lx - left - w / 2) / (w / 2 + LIGHT_REACH), -1, 1);
      const ny = clamp((ly - top - h / 2) / (h / 2 + LIGHT_REACH), -1, 1);
      const s = t.el.style;
      s.setProperty("--px", `${(lx - left).toFixed(1)}px`);
      s.setProperty("--py", `${(ly - top).toFixed(1)}px`);
      s.setProperty("--lit", p.toFixed(3));
      s.setProperty("--shx", (-nx * 22 * p).toFixed(1));
      s.setProperty("--shy", (-ny * 22 * p).toFixed(1));
      t.lit = true;
    }
  };

  const stepTilts = (dt: number) => {
    let busy = false;
    const sx = window.scrollX;
    const sy = window.scrollY;
    for (const [el, t] of tilts) {
      let trx = 0;
      let tr = 0;
      let tl = 0;
      if (t.hover && pointer.inside) {
        const left = t.rect.left - (sx - t.rect.sx);
        const top = t.rect.top - (sy - t.rect.sy);
        const nx = clamp((pointer.x - left) / t.rect.w - 0.5, -0.5, 0.5);
        const ny = clamp((pointer.y - top) / t.rect.h - 0.5, -0.5, 0.5);
        trx = -ny * t.strength;
        tr = nx * t.strength;
        tl = 1;
      }
      // Slightly under-damped so the release overshoots once, like a spring.
      step(t.rx, trx, 190, 15, dt);
      step(t.ry, tr, 190, 15, dt);
      step(t.lift, tl, 210, 20, dt);
      const done = !t.hover && settled(t.rx, 0, 0.02) && settled(t.ry, 0, 0.02) && settled(t.lift, 0, 0.004);
      if (done) {
        unset(el, TILT_PROPS);
        tilts.delete(el);
        continue;
      }
      busy = true;
      const s = el.style;
      s.setProperty("--rx", `${t.rx.x.toFixed(2)}deg`);
      s.setProperty("--ry", `${t.ry.x.toFixed(2)}deg`);
      s.setProperty("--lift", t.lift.x.toFixed(3));
      s.setProperty("--gx", (t.ry.x / t.strength).toFixed(3));
      s.setProperty("--gy", (-t.rx.x / t.strength).toFixed(3));
    }
    return busy;
  };

  const stepMagnets = (dt: number) => {
    let busy = false;
    const sx = window.scrollX;
    const sy = window.scrollY;
    // Find the closest magnetic element within reach.
    let best: { el: HTMLElement; left: number; top: number; w: number; h: number; d: number } | null = null;
    if (pointer.inside) {
      for (const t of tracked.values()) {
        if (!t.magnetic || t.pinned) continue;
        const left = t.fixed ? t.left : t.left - sx;
        const top = t.fixed ? t.top : t.top - sy;
        const dx = pointer.x < left ? left - pointer.x : pointer.x > left + t.w ? pointer.x - left - t.w : 0;
        const dy = pointer.y < top ? top - pointer.y : pointer.y > top + t.h ? pointer.y - top - t.h : 0;
        const d = Math.hypot(dx, dy);
        if (d < MAGNET_REACH && (!best || d < best.d)) best = { el: t.el, left, top, w: t.w, h: t.h, d };
      }
    }
    if (best && !magnets.has(best.el)) magnets.set(best.el, { tx: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, target: [0, 0] });
    for (const [el, m] of magnets) {
      if (best && el === best.el) {
        const f = 1 - best.d / MAGNET_REACH;
        const dx = pointer.x - (best.left + best.w / 2);
        const dy = pointer.y - (best.top + best.h / 2);
        m.target = [clamp(dx * 0.22, -14, 14) * f, clamp(dy * 0.34, -9, 9) * f];
        el.style.setProperty("--bx", `${(pointer.x - best.left).toFixed(0)}px`);
        el.style.setProperty("--by", `${(pointer.y - best.top).toFixed(0)}px`);
      } else {
        m.target = [0, 0];
      }
      step(m.tx, m.target[0], 260, 17, dt);
      step(m.ty, m.target[1], 260, 17, dt);
      if (el !== best?.el && settled(m.tx, 0, 0.05) && settled(m.ty, 0, 0.05)) {
        unset(el, MAGNET_PROPS);
        magnets.delete(el);
        continue;
      }
      busy = true;
      el.style.setProperty("--tx", `${m.tx.x.toFixed(2)}px`);
      el.style.setProperty("--ty", `${m.ty.x.toFixed(2)}px`);
    }
    return busy;
  };

  const updateHover = () => {
    const el = target instanceof Element ? target : null;
    const g = pointer.inside ? (el?.closest<HTMLElement>(".glass, .glass-strong") ?? null) : null;
    if (g !== hoverGlass) {
      hoverGlass = g;
      if (g) hoverRect = measure(g);
    }
    const tl = pointer.inside ? (el?.closest<HTMLElement>("[data-tilt]") ?? null) : null;
    if (tl !== tiltHover) {
      if (tiltHover) {
        const prev = tilts.get(tiltHover);
        if (prev) prev.hover = false;
      }
      tiltHover = tl;
      if (tl) {
        const existing = tilts.get(tl);
        const strength = clamp((Number(tl.dataset.tilt) || 8) * 1.35, 2, 16);
        const t: Tilt = existing ?? {
          rect: measure(tl),
          hover: true,
          strength,
          rx: { x: 0, v: 0 },
          ry: { x: 0, v: 0 },
          lift: { x: 0, v: 0 },
        };
        if (existing) t.rect = measure(tl);
        t.hover = true;
        t.strength = strength;
        tilts.set(tl, t);
      }
    }
    overControl = !!el?.closest("a[href], button, [role='button'], summary, label, input, textarea, select");
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    pointer.time += dt;
    pointer.dt = dt;
    let busy = false;

    if (hitDirty && pointer.inside) {
      target = document.elementFromPoint(pointer.x, pointer.y);
      hitDirty = false;
    }
    updateHover();

    // Light and halo springs. The light lags noticeably; the halo barely.
    step(light.x, pointer.x, 95, 19, dt);
    step(light.y, pointer.y, 95, 19, dt);
    step(halo.x, pointer.x, 620, 46, dt);
    step(halo.y, pointer.y, 620, 46, dt);
    step(haloScale, pressed ? 0.7 : overControl ? 1.5 : 1, 300, 24, dt);
    if (!settled(light.x, pointer.x, 0.1) || !settled(light.y, pointer.y, 0.1)) busy = true;
    if (!settled(halo.x, pointer.x, 0.1) || !settled(halo.y, pointer.y, 0.1)) busy = true;
    if (!settled(haloScale, pressed ? 0.7 : overControl ? 1.5 : 1, 0.002)) busy = true;
    pointer.lx = light.x.x;
    pointer.ly = light.y.x;

    const inst = moved / dt;
    moved = 0;
    pointer.speed += (inst - pointer.speed) * ease(9, dt);
    if (pointer.speed > 4) busy = true;
    else pointer.speed = 0;

    // Global parallax variables.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tcx = pointer.inside ? clamp((pointer.x / w) * 2 - 1, -1, 1) : 0;
    const tcy = pointer.inside ? clamp((pointer.y / h) * 2 - 1, -1, 1) : 0;
    pointer.cx += (tcx - pointer.cx) * ease(7, dt);
    pointer.cy += (tcy - pointer.cy) * ease(7, dt);
    if (Math.abs(tcx - pointer.cx) > 0.001 || Math.abs(tcy - pointer.cy) > 0.001) busy = true;
    if (Math.abs(pointer.cx - cxy.wx) > 0.0008 || Math.abs(pointer.cy - cxy.wy) > 0.0008) {
      cxy.wx = pointer.cx;
      cxy.wy = pointer.cy;
      const vx = pointer.cx.toFixed(3);
      const vy = pointer.cy.toFixed(3);
      for (const t of tracked.values()) {
        if (!t.follows) continue;
        t.el.style.setProperty("--cx", vx);
        t.el.style.setProperty("--cy", vy);
      }
    }

    // Light layers: transforms only.
    layers.back.style.transform = `translate3d(${light.x.x.toFixed(1)}px, ${light.y.x.toFixed(1)}px, 0)`;
    if (layers.backGrid) {
      // Keep the grid's lines fixed to the page while its window moves.
      const cell = 48;
      const ox = -((((light.x.x - backHalf + window.scrollX) % cell) + cell) % cell);
      const oy = -((((light.y.x - backHalf + window.scrollY) % cell) + cell) % cell);
      layers.backGrid.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0)`;
    }
    layers.halo.style.transform = `translate3d(${halo.x.x.toFixed(1)}px, ${halo.y.x.toFixed(1)}px, 0) scale(${haloScale.x.toFixed(3)})`;

    lightSurfaces();
    if (stepTilts(dt)) busy = true;
    if (stepMagnets(dt)) busy = true;

    for (const fn of listeners) if (fn(pointer)) busy = true;

    if (busy) raf = requestAnimationFrame(frame);
    else last = 0;
  };

  wakeLoop = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  // Components may have subscribed before the engine started (their effects
  // run before the layout's).
  if (listeners.size) wakeLoop();

  /* ---- input ---- */
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (!pointer.inside) {
      // First contact: start the light where the cursor is, not off-screen.
      pointer.inside = true;
      root.dataset.pointer = "in";
      if (light.x.x < -9000) {
        light.x.x = halo.x.x = e.clientX;
        light.y.x = halo.y.x = e.clientY;
      }
    }
    if (pointer.x > -9000) moved += Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    target = e.target instanceof Element ? e.target : null;
    hitDirty = false;
    wakeLoop();
  };
  const onLeave = () => {
    pointer.inside = false;
    delete root.dataset.pointer;
    target = null;
    wakeLoop();
  };
  const onOut = (e: PointerEvent) => {
    if (!e.relatedTarget && e.pointerType === "mouse") onLeave();
  };
  const onScroll = () => {
    hitDirty = true;
    wakeLoop();
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    pressed = true;
    pointer.clickAt = pointer.time;
    // Buttons and clickable cards show their own press ripple (press-effects.ts).
    if (e.target instanceof Element && e.target.closest(PRESSABLE)) {
      wakeLoop();
      return;
    }
    const r = document.createElement("span");
    r.className = "light-ripple";
    r.style.translate = `${e.clientX}px ${e.clientY}px`;
    r.addEventListener("animationend", () => r.remove(), { once: true });
    layers.ripples.appendChild(r);
    // Cap in case animationend never fires (tab hidden).
    while (layers.ripples.childElementCount > 6) layers.ripples.firstElementChild?.remove();
    wakeLoop();
  };
  const onUp = () => {
    pressed = false;
    wakeLoop();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("pointerout", onOut, { passive: true });
  window.addEventListener("blur", onLeave);

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointerout", onOut);
    window.removeEventListener("blur", onLeave);
    if (raf) cancelAnimationFrame(raf);
    window.clearTimeout(scanTimer);
    window.clearTimeout(remeasureTimer);
    io.disconnect();
    mo.disconnect();
    ro.disconnect();
    for (const t of tracked.values()) {
      if (t.lit) unset(t.el, LIT_PROPS);
      if (t.follows) unset(t.el, ["--cx", "--cy"]);
    }
    for (const el of tilts.keys()) unset(el, TILT_PROPS);
    for (const el of magnets.keys()) unset(el, MAGNET_PROPS);
    delete root.dataset.interactive;
    delete root.dataset.pointer;
    active = false;
    wakeLoop = () => {};
  };
}
