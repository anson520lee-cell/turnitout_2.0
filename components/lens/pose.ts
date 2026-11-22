import { chain, mat4, multiply, perspective, rotationX, rotationY, rotationZ, scaling, transform, translation, type Mat4 } from "./mat4";

/**
 * Where the sheet sits on screen, as a function of the scroll stage.
 * Pure maths shared by the renderer (which draws it) and the page (which asks for it).
 */

export interface LensPose {
  /** Sheet centre on the canvas, CSS px. */
  cx: number;
  cy: number;
  /** Sheet units → CSS px. */
  scale: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Vertical field of view of the camera. Narrow, so the sheet reads as an object and not a fisheye. */
export const FOV = (30 * Math.PI) / 180;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The camera: the plane z = 0 is drawn at 1 unit = 1 CSS px. */
export function camera(W: number, H: number) {
  const D = H / 2 / Math.tan(FOV / 2);
  const proj = perspective(mat4(), FOV, W / H, D * 0.2, D * 4);
  return { D, viewProj: multiply(mat4(), proj, translation(0, 0, -D)) };
}

/** Sheet units (u right, v down, origin top-left) → world, for a pose. */
export function sheetModel(p: LensPose, W: number, H: number, w: number, h: number): Mat4 {
  return chain(
    translation(p.cx - W / 2, H / 2 - p.cy, 0),
    rotationY(p.ry),
    rotationX(p.rx),
    rotationZ(p.rz),
    scaling(p.scale, -p.scale, p.scale),
    translation(-w / 2, -h / 2, 0),
  );
}

/** Sheet point → canvas CSS px, for a pose. */
export function projectSheet(p: LensPose, W: number, H: number, w: number, h: number, u: number, v: number) {
  const mvp = multiply(mat4(), camera(W, H).viewProj, sheetModel(p, W, H, w, h));
  const [x, y, , q] = transform(mvp, u, v, 0);
  return { x: ((x / q) * 0.5 + 0.5) * W, y: (1 - ((y / q) * 0.5 + 0.5)) * H };
}

/**
 * The hero pose: the sheet laid back like paper on a desk, its far (top) edge at `topY`
 * and `topW` wide on screen, so it starts right under the call to action whatever the window.
 */
export function laidBack(W: number, H: number, w: number, h: number, rx: number, topY: number, topW: number): LensPose {
  const pose: LensPose = { cx: W / 2, cy: topY, scale: topW / w, rx, ry: 0, rz: 0 };
  for (let pass = 0; pass < 4; pass++) {
    let lo = topY - 4 * H;
    let hi = topY + 6 * H;
    for (let k = 0; k < 36; k++) {
      pose.cy = (lo + hi) / 2;
      if (projectSheet(pose, W, H, w, h, w / 2, 0).y < topY) lo = pose.cy;
      else hi = pose.cy;
    }
    const a = projectSheet(pose, W, H, w, h, 0, 0);
    const b = projectSheet(pose, W, H, w, h, w, 0);
    pose.scale *= topW / Math.max(1, b.x - a.x);
  }
  return pose;
}

export interface StageFrame {
  W: number;
  H: number;
  compact: boolean;
  /** Sheet size, sheet units. */
  w: number;
  h: number;
  /** Viewport y of the sheet's far edge in the hero, and its width there. */
  heroTop: number;
  heroWidth: number;
  /** The Report chart and the scan line's run, sheet units. */
  chartMid: number;
  scanFrom: number;
  scanTo: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: LensPose, b: LensPose, t: number): LensPose => ({
  cx: lerp(a.cx, b.cx, t),
  cy: lerp(a.cy, b.cy, t),
  scale: lerp(a.scale, b.scale, t),
  rx: lerp(a.rx, b.rx, t),
  ry: lerp(a.ry, b.ry, t),
  rz: lerp(a.rz, b.rz, t),
});

function hero(f: StageFrame): LensPose {
  return laidBack(f.W, f.H, f.w, f.h, f.compact ? -0.8 : -0.9, f.heroTop, f.heroWidth);
}

/** Wide screens: the sheet stands to the right of the chapter text, turned a little toward it. */
function wide(f: StageFrame, k: number): LensPose {
  const scale = Math.min((f.H * 0.8) / f.h, (f.W * 0.44) / f.w, 1.05);
  const cx = f.W / 2 + Math.min(f.W * 0.17, 250);
  const cy = f.H * 0.53;
  const turn = [
    { rx: -0.07, ry: -0.24, rz: 0.012 },
    { rx: -0.04, ry: -0.15, rz: 0 },
    { rx: -0.2, ry: -0.05, rz: 0 },
    { rx: -0.05, ry: -0.21, rz: -0.008 },
  ][k];
  return { cx, cy, scale, ...turn };
}

/**
 * Narrow screens: the sheet is shown large and the camera travels along it: the top while you
 * paste, down with the scan line while it reads, to the chart, back to the first paragraph.
 */
function narrow(f: StageFrame, stage: number): LensPose {
  const scale = Math.min((f.W * 0.9) / f.w, 1.1);
  const rx = -0.16;
  const top = f.h * 0.22;
  const scanV = (s: number) => clamp(f.scanFrom + (f.scanTo - f.scanFrom) * easeInOut(clamp(s - 1)), top, f.h * 0.76);
  let v: number;
  if (stage <= 1) v = top;
  else if (stage <= 2) v = scanV(stage);
  else if (stage <= 3) v = lerp(scanV(2), f.chartMid, easeInOut(stage - 2));
  else v = lerp(f.chartMid, f.h * 0.24, easeInOut(clamp(stage - 3)));
  const fy = f.H * 0.37;
  return { cx: f.W / 2, cy: fy + (f.h / 2 - v) * scale * Math.cos(rx), scale, rx, ry: 0, rz: 0 };
}

export function poseAt(stage: number, f: StageFrame): LensPose {
  const s = clamp(stage, 0, 4);
  const chapter = (x: number) => (f.compact ? narrow(f, x) : wide(f, clamp(Math.round(x) - 1, 0, 3)));
  if (s <= 1) return mix(hero(f), chapter(1), easeInOut(s));
  if (f.compact) return narrow(f, s);
  const k = Math.min(3, Math.floor(s));
  return mix(wide(f, k - 1), wide(f, Math.min(3, k)), easeInOut(s - k));
}
