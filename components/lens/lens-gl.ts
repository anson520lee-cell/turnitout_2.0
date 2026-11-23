import { tourOrder, type LensParagraph } from "./essay";
import { invert, mat4, multiply, transform } from "./mat4";
import { camera, easeInOut, sheetModel, type LensPose } from "./pose";
import { GLASS_BOTTOM, GLASS_TOP, layoutPaper, lineIndexRows, paintPaper, riskRGB, riskWeight, type PaperFonts, type PaperLayout } from "./paper";

/**
 * The essay under the lens: a WebGL2 renderer for the home page's sheet.
 *
 * What a visitor sees, in the order it reacts (the layering is the point):
 * 1. the lens: the same frame the pointer moves, the detector's reading shows
 *    through a soft-edged window, ringed by thin contour lines. Moving fast
 *    drags a wider trail; resting shrinks it to a reading loupe; leaving
 *    closes it first.
 * 2. the lines: a beat later the lines of text nearest the lens rise off the
 *    paper like blocks, neighbours later and lower. They rise only if the lens
 *    lingers: a fast sweep leaves them almost still.
 * 3. the light: under flagged sentences blue light comes through the gap,
 *    and it is the last thing to fade.
 * A press pins the sentence and sends a ring through the sheet. On touch the
 * lens answers taps only: a finger that lands on the sheet to scroll the page
 * moves nothing.
 *
 * The same sheet plays the chapters (stage 1…4): a scan line reveals the
 * reading (Read), the lines fold into the paragraph chart (Report), and the
 * flagged lines flip to show suggested rewrites (Refine).
 */

export type { LensPose };

export type LensSource = "pointer" | "tour" | "pin" | "key";

export interface LensHandlers {
  /** The sentence the lens is on changed (null: none). */
  onSentence?: (n: number | null, source: LensSource) => void;
  /** A sentence was pinned or unpinned by a press. */
  onPin?: (n: number | null) => void;
  onContextLost?: () => void;
}

export interface LensLeader {
  /** A polyline in an SVG laid over the canvas: drawn from the sentence index down to the sentence. */
  line: SVGPolylineElement;
  /** A dot where it meets the sentence. */
  dot?: SVGCircleElement | null;
  /** Where the line starts, canvas CSS px (null: nothing to point from). */
  from: (n: number) => { x: number; y: number } | null;
}

export interface LensInit {
  canvas: HTMLCanvasElement;
  /** Element whose pointer events drive the lens (default: the canvas). */
  input?: HTMLElement | null;
  hud?: HTMLElement | null;
  leader?: LensLeader | null;
  paragraphs: LensParagraph[];
  fonts: PaperFonts;
  compact: boolean;
  reduced: boolean;
  handlers: LensHandlers;
}

const MAX_LINES = 48;
const MAX_PTS = 16;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ------------------------------------------------------------------ shaders */

const HEAD = `#version 300 es
precision highp float;
`;

const FIELD_VS = `${HEAD}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

const FIELD_FS = `${HEAD}
uniform vec2 uSize;
uniform vec2 uView;
uniform vec4 uPts[${MAX_PTS}];
uniform int uCount;
uniform vec4 uRing;
uniform float uTime;
uniform float uDpr;
out vec4 outColor;
void main() {
  vec2 p = gl_FragCoord.xy / uSize * uView;
  float f = 0.0;
  for (int i = 0; i < ${MAX_PTS}; i++) {
    if (i >= uCount) break;
    vec4 q = uPts[i];
    vec2 d = p - q.xy;
    float r2 = q.z * q.z;
    f += q.w * r2 / (dot(d, d) + r2 * 0.04);
  }
  // the outline breathes a little instead of being a perfect circle
  float wob = sin(p.x * 0.013 / uDpr + uTime * 1.6) * sin(p.y * 0.016 / uDpr - uTime * 1.25);
  f *= 1.0 + 0.085 * wob;
  float ring = 0.0;
  if (uRing.w > 0.001) {
    float dr = (length(p - uRing.xy) - uRing.z) / (20.0 * uDpr);
    ring = uRing.w * exp(-dr * dr);
  }
  outColor = vec4(clamp(f * 0.25, 0.0, 1.0), clamp(ring, 0.0, 1.0), 0.0, 1.0);
}
`;

/** The sheet arrives as a thin outline, then fills from the top down (uBuild 0 → 1). */
const BUILD_FN = `
uniform float uBuild;
float buildFront(float h) { return uBuild * (h + 260.0) - 130.0; }
float built(float y, float h) { float f = buildFront(h); return smoothstep(f + 110.0, f - 20.0, y); }
`;

const LENS_FN = `
uniform sampler2D uField;
uniform vec2 uView;
uniform float uLensOn;
float lensF() { return texture(uField, gl_FragCoord.xy / uView).r * 4.0; }
float lensMask() { return smoothstep(0.9, 1.1, lensF()) * uLensOn; }
`;

const SHEET_VS = `${HEAD}
in vec2 aPos;
uniform mat4 uMVP;
out vec2 vS;
void main() {
  vS = aPos;
  gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
}
`;

const BASE_FS = `${HEAD}
uniform sampler2D uTexH;
uniform sampler2D uTexM;
uniform sampler2D uTexR;
uniform sampler2D uRows;
uniform vec2 uSheet;
uniform vec4 uLine[${MAX_LINES}];
uniform vec4 uFx[${MAX_LINES}];
uniform float uScan;
uniform float uRefine;
uniform float uSlots;
uniform vec4 uGlassTop;
uniform vec4 uGlassBot;
uniform float uDim;
${LENS_FN}
${BUILD_FN}
in vec2 vS;
out vec4 o;
void main() {
  vec2 uv = vS / uSheet;
  vec4 h = texture(uTexH, uv);
  vec4 m = texture(uTexM, uv);
  float scan = uScan < 0.0 ? 0.0 : smoothstep(uScan + 3.0, uScan - 3.0, vS.y);
  float k = max(lensMask(), scan);
  vec4 c = mix(h, m, k);
  if (uRefine > 0.0) c = mix(c, texture(uTexR, uv), uRefine);

  int li = int(texture(uRows, vec2(0.5, (floor(vS.y) + 0.5) / uSheet.y)).r * 255.0 + 0.5);
  vec4 L = uLine[li];
  vec4 F = uFx[li];
  vec2 q = clamp(vS, L.xy, L.zw);
  float d = length(vS - q);
  float t = clamp(vS.y / uSheet.y, 0.0, 1.0);
  vec4 g = mix(uGlassTop, uGlassBot, t);
  vec4 glass = vec4(g.rgb * g.a, g.a);
  float inside = (1.0 - step(0.001, d)) * uSlots;
  // light from under the paper: grey-blue for calm lines, strong blue for flagged ones.
  // It leaks round the edges of the lifted line, so it is brightest at the rim of the slot.
  vec3 lightCol = mix(vec3(0.56, 0.64, 0.86), vec3(0.24, 0.47, 1.0), F.z);
  float rimD = min(min(vS.x - L.x, L.z - vS.x), min(vS.y - L.y, L.w - vS.y));
  float leak = 1.0 - smoothstep(0.0, 7.0, rimD);
  float px = max(fwidth(vS.y), 1e-3);
  float groove = (1.0 - smoothstep(0.0, 1.2 * px, rimD)) * F.w;
  vec4 slot = vec4(glass.rgb * 0.74 + lightCol * F.y * (0.1 + 0.5 * leak) + vec3(0.5, 0.6, 1.0) * 0.2 * groove, glass.a);
  c = mix(c, slot, inside);
  c.rgb += lightCol * F.y * 0.32 * exp(-d * d / 140.0) * (1.0 - inside) * uSlots;
  c.rgb *= 1.0 - uDim;
  o = c * built(vS.y, uSheet.y);
}
`;

const STRIP_VS = `${HEAD}
in vec2 aCorner;
in vec4 iRect;
in vec4 iBar;
in vec4 iFx;
in vec4 iCol;
in float iRef;
uniform mat4 uMVP;
out vec2 vS;
out vec2 vLocal;
out vec4 vRect;
out float vMorph;
out vec3 vBar;
out float vLift;
out float vFace;
out float vRef;
void main() {
  float m = iFx.w;
  vec4 r = mix(iRect, iBar, m);
  vec2 pos = mix(r.xy, r.zw, aCorner);
  float cy = (r.y + r.w) * 0.5;
  float ang = iFx.y + iFx.z;
  float yy = pos.y - cy;
  vec3 p = vec3(pos.x, cy + yy * cos(ang), iFx.x - yy * sin(ang));
  vS = mix(iRect.xy, iRect.zw, aCorner);
  vLocal = aCorner;
  vRect = iRect;
  vMorph = m;
  vBar = iCol.rgb;
  vLift = iFx.x;
  vFace = cos(ang);
  vRef = iRef;
  gl_Position = uMVP * vec4(p, 1.0);
}
`;

const STRIP_FS = `${HEAD}
uniform sampler2D uTexH;
uniform sampler2D uTexM;
uniform sampler2D uTexR;
uniform vec2 uSheet;
uniform float uScan;
uniform float uPx;
${LENS_FN}
${BUILD_FN}
in vec2 vS;
in vec2 vLocal;
in vec4 vRect;
in float vMorph;
in vec3 vBar;
in float vLift;
in float vFace;
in float vRef;
out vec4 o;
void main() {
  vec2 uv = vS / uSheet;
  vec4 h = texture(uTexH, uv);
  vec4 m = texture(uTexM, uv);
  float scan = uScan < 0.0 ? 0.0 : smoothstep(uScan + 3.0, uScan - 3.0, vS.y);
  float k = max(lensMask(), scan);
  vec4 c = mix(h, m, k);
  if (vRef > 0.0) c = mix(c, texture(uTexR, uv), vRef);
  // a lifted line is a block: its rim catches the light
  float lifted = clamp(vLift / 18.0, 0.0, 1.0);
  vec2 e = min(vS - vRect.xy, vRect.zw - vS);
  float rim = 1.0 - smoothstep(0.0, 1.4 * uPx, min(e.x, e.y));
  c.rgb += vec3(0.6, 0.72, 1.0) * rim * lifted * 0.32;
  c.rgb *= 1.0 + lifted * 0.12;
  // folding into the paragraph chart
  float solid = smoothstep(0.2, 0.75, vMorph);
  c = mix(c, vec4(vBar * 0.9, 0.9), solid);
  // turning edge-on while it flips
  c.rgb *= mix(0.45, 1.0, abs(vFace));
  o = c * built(vS.y, uSheet.y);
}
`;

const OVERLAY_FS = `${HEAD}
uniform vec2 uSheet;
uniform float uScan;
uniform float uScanX0;
uniform float uScanX1;
${LENS_FN}
${BUILD_FN}
in vec2 vS;
out vec4 o;
void main() {
  vec4 fv = texture(uField, gl_FragCoord.xy / uView);
  float f = fv.r * 4.0;
  float w = max(fwidth(f), 1e-4);
  float edge = 1.0 - smoothstep(0.0, 1.25 * w, abs(f - 1.0));
  float c1 = 1.0 - smoothstep(0.0, 1.0 * w, abs(f - 0.62));
  float c2 = 1.0 - smoothstep(0.0, 1.0 * w, abs(f - 0.4));
  float c3 = 1.0 - smoothstep(0.0, 1.0 * w, abs(f - 0.26));
  float a = (edge * 0.8 + c1 * 0.3 + c2 * 0.18 + c3 * 0.1) * uLensOn;
  a += fv.g * 0.5;
  if (uScan >= 0.0 && vS.x > uScanX0 && vS.x < uScanX1) {
    float dy = vS.y - uScan;
    a += exp(-dy * dy / 2.2) * 0.95 + exp(-dy * dy / 500.0) * 0.16 * step(dy, 0.0);
  }
  if (uBuild < 1.0) {
    // the outline first, then a bright edge running down as the glass fills in
    float px = max(fwidth(vS.x), 1e-3);
    float e = min(min(vS.x, uSheet.x - vS.x), min(vS.y, uSheet.y - vS.y));
    float outline = 1.0 - smoothstep(0.6 * px, 1.8 * px, e);
    float dy = vS.y - buildFront(uSheet.y);
    a += outline * 0.7 * (1.0 - smoothstep(0.75, 1.0, uBuild));
    a += exp(-dy * dy / 3.0) * 0.9 * step(0.001, uBuild) * (1.0 - smoothstep(0.85, 1.0, uBuild));
  }
  a = clamp(a, 0.0, 1.0);
  o = vec4(vec3(0.6, 0.73, 1.0) * a, 0.0);
}
`;

/* ------------------------------------------------------------------ helpers */

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  const u = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u: (name: string) => {
      if (!u.has(name)) u.set(name, gl.getUniformLocation(p, name));
      return u.get(name)!;
    },
  };
}
type Program = ReturnType<typeof compile>;

interface TrailPt {
  x: number;
  y: number;
  r: number;
  t: number;
}

interface LineState {
  lift: number;
  vel: number;
  glow: number;
  dwell: number;
  kicked: number;
  seed: number;
}

/* ------------------------------------------------------------------ renderer */

export class LensRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private init: LensInit;
  private layout!: PaperLayout;
  private progs!: { field: Program; base: Program; strip: Program; overlay: Program };
  private tex: { h: WebGLTexture | null; m: WebGLTexture | null; r: WebGLTexture | null; rows: WebGLTexture | null; field: WebGLTexture | null } = { h: null, m: null, r: null, rows: null, field: null };
  private fbo: WebGLFramebuffer | null = null;
  private fieldSize = [1, 1];
  private vaoSheet: WebGLVertexArrayObject | null = null;
  private vaoStrip: WebGLVertexArrayObject | null = null;
  private vaoField: WebGLVertexArrayObject | null = null;
  private instBuf: WebGLBuffer | null = null;
  private inst = new Float32Array(0);
  private lines: LineState[] = [];
  private ready = false;
  private disposed = false;
  private raf = 0;
  private visible = true;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;

  private W = 1;
  private H = 1;
  private dpr = 1;
  private viewProj = mat4();
  private mvp = mat4();
  private inv = mat4();

  private poseTarget: LensPose = { cx: 0, cy: 0, scale: 1, rx: 0, ry: 0, rz: 0 };
  /** The pose drawn: eased toward the target, so wheel steps glide instead of jump. */
  private pose: LensPose = { cx: 0, cy: 0, scale: 1, rx: 0, ry: 0, rz: 0 };
  private posed = false;
  private lean = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Stage drawn (eased) and asked for. */
  private stage = 0;
  private stageTarget = 0;
  private settled = true;
  private order: number[] = [];
  /** Arrival: 0 → 1 over the first second and a bit. */
  private build = 0;
  private builtAt = -1;

  private time = 0;
  private last = 0;
  // pointer
  private pointer = { x: -1, y: -1, over: false, inCanvas: false, lastMove: -1e9, type: "mouse", downAt: -1, downX: 0, downY: 0 };
  private head = { x: 0, y: 0, w: 0, r: 0, boost: 0, speed: 0, px: 0, py: 0, has: false };
  private trail: TrailPt[] = [];
  private pinned: { n: number; u: number; v: number; w: number } | null = null;
  private pinGlide: { fromU: number; fromV: number; t: number } | null = null;
  private ring = { x: 0, y: 0, t0: -1, u: 0, v: 0 };
  private tour = { on: false, idx: 0, phase: 0, t: 0, fromU: 0, fromV: 0, toU: 0, toV: 0, u: 0, v: 0, started: false };
  private current: number | null = null;
  private hudItems: { el: HTMLElement; x: number; y: number; show: (s: number) => number }[] = [];

  private get input(): HTMLElement {
    return this.init.input ?? this.canvas;
  }

  constructor(init: LensInit) {
    this.init = init;
    this.canvas = init.canvas;
    const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    this.canvas.addEventListener("webglcontextlost", this.onLost);
  }

  /** Lays out and paints the paper, uploads it, and starts drawing. */
  async start() {
    const { gl, init } = this;
    this.progs = {
      field: compile(gl, FIELD_VS, FIELD_FS),
      base: compile(gl, SHEET_VS, BASE_FS),
      strip: compile(gl, STRIP_VS, STRIP_FS),
      overlay: compile(gl, SHEET_VS, OVERLAY_FS),
    };
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`20px ${init.fonts.serif}`), document.fonts.load(`11px ${init.fonts.mono}`), document.fonts.load(`11px ${init.fonts.sans}`)]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* draw with whatever fonts are there */
    }
    if (this.disposed) return;
    this.layout = layoutPaper(init.paragraphs, init.fonts, init.compact);
    this.lines = this.layout.lines.map((l) => ({ lift: 0, vel: 0, glow: 0, dwell: 0, kicked: -1, seed: hash(l.i + 3) }));
    this.upload();
    this.buildGeometry();
    this.buildHud();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.wake();
    });
    this.io.observe(this.canvas);
    document.addEventListener("visibilitychange", this.wake);
    const c = this.input;
    c.addEventListener("pointermove", this.onMove, { passive: true });
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointerleave", this.onLeave);
    c.addEventListener("pointercancel", this.onLeave);
    this.order = this.layout.lines.map((l) => l.i);
    this.build = init.reduced ? 1 : 0;
    this.ready = true;
    this.last = performance.now();
    this.tour.on = !init.reduced;
    if (init.reduced) {
      // a still picture: the lens resting on the first marked sentence
      const s = this.layout.sentences.get(1)!;
      this.pinned = { n: 1, u: s.cx, v: s.cy, w: 1 };
      this.head.w = 0;
    }
    this.wake();
  }

  /** Where the sheet should be (scroll-driven; eased toward). */
  setPose(p: LensPose) {
    const t = this.poseTarget;
    if (this.posed && t.cx === p.cx && t.cy === p.cy && t.scale === p.scale && t.rx === p.rx && t.ry === p.ry && t.rz === p.rz) return;
    this.poseTarget = { ...p };
    if (!this.posed || this.init.reduced) {
      this.pose = { ...p };
      this.posed = true;
    }
    this.settled = false;
    this.wake();
  }

  /** 0 hero · 1 paste · 2 read · 3 report · 4 refine (fractions scrub between). */
  setStage(s: number) {
    if (Math.abs(s - this.stageTarget) < 1e-4) return;
    this.stageTarget = s;
    if (this.init.reduced) this.stage = s;
    if (s > 0.35) {
      this.tour.on = false;
    }
    this.settled = false;
    this.wake();
  }

  /** Keyboard: move the lens to a sentence and pin it. */
  focusSentence(n: number | null) {
    if (!this.ready) return;
    if (n === null) {
      this.pinned = null;
      this.wake();
      return;
    }
    const s = this.layout.sentences.get(n);
    if (!s) return;
    const from = this.pinned ? { u: this.pinned.u, v: this.pinned.v } : this.tour.started ? { u: this.tour.u, v: this.tour.v } : { u: s.cx, v: s.cy };
    this.pinned = { n, u: s.cx, v: s.cy, w: this.pinned?.w ?? 0 };
    this.pinGlide = this.init.reduced ? null : { fromU: from.u, fromV: from.v, t: 0 };
    this.tour.on = false;
    this.pointer.lastMove = this.time;
    this.setCurrent(n, "key");
    this.wake();
  }

  /** Sheet point → canvas CSS px (for DOM labels that follow the sheet). */
  project(u: number, v: number, z = 0) {
    const [x, y, , w] = transform(this.mvp, u, v, z);
    return { x: ((x / w) * 0.5 + 0.5) * this.W, y: (1 - ((y / w) * 0.5 + 0.5)) * this.H };
  }

  get sheet() {
    return this.layout;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.ro?.disconnect();
    document.removeEventListener("visibilitychange", this.wake);
    const c = this.input;
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointerleave", this.onLeave);
    c.removeEventListener("pointercancel", this.onLeave);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    if (this.init.leader) this.init.leader.line.style.opacity = "0";
    for (const item of this.hudItems) item.el.remove();
    const gl = this.gl;
    for (const t of Object.values(this.tex)) if (t) gl.deleteTexture(t);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /* -------------------------------------------------------------- setup */

  private onLost = (e: Event) => {
    e.preventDefault();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.init.handlers.onContextLost?.();
  };

  private texture(src: TexImageSource | null, w = 0, h = 0, format: "rgba" | "r8" = "rgba", data?: Uint8Array) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (src) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    } else if (format === "r8") {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data ?? null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if (src || format !== "r8") gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private upload() {
    const { layout, init } = this;
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Painted a little above the size it is shown at, so the mipmaps keep the serif crisp at a slant.
    let k = clamp(dpr * (init.compact ? 1.05 : 1.15), 1, 2);
    k = Math.min(k, (max - 8) / layout.w, (max - 8) / layout.h);
    this.tex.h = this.texture(paintPaper(layout, init.paragraphs, init.fonts, "human", k));
    this.tex.m = this.texture(paintPaper(layout, init.paragraphs, init.fonts, "machine", k));
    this.tex.r = this.texture(paintPaper(layout, init.paragraphs, init.fonts, "refined", k));
    const rows = lineIndexRows(layout);
    this.tex.rows = this.texture(null, 1, rows.length, "r8", rows);
  }

  private buildGeometry() {
    const gl = this.gl;
    const { w, h, lines } = this.layout;
    // sheet quad (sheet units, y down)
    this.vaoSheet = gl.createVertexArray();
    gl.bindVertexArray(this.vaoSheet);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, w, 0, 0, h, w, h]), gl.STATIC_DRAW);
    for (const prog of [this.progs.base, this.progs.overlay]) {
      const loc = gl.getAttribLocation(prog.p, "aPos");
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    }
    // strips: one instanced quad per line
    this.vaoStrip = gl.createVertexArray();
    gl.bindVertexArray(this.vaoStrip);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const sp = this.progs.strip.p;
    const aCorner = gl.getAttribLocation(sp, "aCorner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
    this.inst = new Float32Array(lines.length * 17);
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    const attrs: [string, number, number][] = [
      ["iRect", 4, 0],
      ["iBar", 4, 4],
      ["iFx", 4, 8],
      ["iCol", 4, 12],
      ["iRef", 1, 16],
    ];
    for (const [name, size, off] of attrs) {
      const loc = gl.getAttribLocation(sp, name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 17 * 4, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.vaoField = gl.createVertexArray();
    gl.bindVertexArray(null);
  }

  private buildHud() {
    const hud = this.init.hud;
    if (!hud) return;
    const { bars, chart } = this.layout;
    const add = (text: string, x: number, y: number, show: (s: number) => number, cls = "") => {
      const el = document.createElement("span");
      el.className = `lens-hud ${cls}`;
      el.textContent = text;
      el.setAttribute("aria-hidden", "true");
      hud.appendChild(el);
      this.hudItems.push({ el, x, y, show });
    };
    const reportIn = (s: number) => smooth(2.45, 2.85, s) * (1 - smooth(3.05, 3.3, s));
    for (const b of bars) {
      add(`${b.share}%`, (b.rect.x0 + b.rect.x1) / 2, b.rect.y0 - 14, reportIn, "lens-hud-value");
      add(`P${b.p}`, (b.rect.x0 + b.rect.x1) / 2, chart.y1 + 18, reportIn, "lens-hud-axis");
    }
    add("SHARE OF SENTENCES FLAGGED, BY PARAGRAPH", (chart.x0 + chart.x1) / 2, chart.y0 - 34, reportIn, "lens-hud-title");
  }

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.init.compact ? 1.75 : 2);
    const cw = Math.round(this.W * this.dpr);
    const ch = Math.round(this.H * this.dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const gl = this.gl;
    const fw = Math.max(2, Math.ceil(cw / 4));
    const fh = Math.max(2, Math.ceil(ch / 4));
    if (fw !== this.fieldSize[0] || fh !== this.fieldSize[1] || !this.tex.field) {
      if (this.tex.field) gl.deleteTexture(this.tex.field);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
      this.tex.field = this.texture(null, fw, fh, "rgba");
      this.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex.field, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fieldSize = [fw, fh];
    }
    this.viewProj = camera(this.W, this.H).viewProj;
    this.wake();
  };

  /* -------------------------------------------------------------- input */

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Canvas CSS px → sheet units on the sheet plane, or null when off the sheet. */
  private toSheet(x: number, y: number, margin = 0) {
    const nx = (x / this.W) * 2 - 1;
    const ny = 1 - (y / this.H) * 2;
    const a = transform(this.inv, nx, ny, -1);
    const b = transform(this.inv, nx, ny, 1);
    const ax = a[0] / a[3], ay = a[1] / a[3], az = a[2] / a[3];
    const bx = b[0] / b[3], by = b[1] / b[3], bz = b[2] / b[3];
    const t = az / (az - bz);
    if (!Number.isFinite(t)) return null;
    const u = ax + (bx - ax) * t;
    const v = ay + (by - ay) * t;
    if (u < -margin || v < -margin || u > this.layout.w + margin || v > this.layout.h + margin) return null;
    return { u, v };
  }

  private onMove = (e: PointerEvent) => {
    // A finger moving on the page is scrolling it: the lens answers to taps only (onUp).
    if (!this.ready || e.pointerType === "touch") return;
    const p = this.local(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.type = e.pointerType;
    this.pointer.inCanvas = p.x >= 0 && p.y >= 0 && p.x <= this.W && p.y <= this.H;
    this.pointer.over = this.pointer.inCanvas && this.stageTarget < 0.35 && !overControl(e.target) && !!this.toSheet(p.x, p.y, 6);
    if (this.pointer.over) {
      this.pointer.lastMove = this.time;
      this.tour.on = false;
    }
    this.wake();
  };

  private onDown = (e: PointerEvent) => {
    if (!this.ready || this.stageTarget > 0.35 || e.button > 0 || overControl(e.target)) return;
    const p = this.local(e);
    const hit = this.toSheet(p.x, p.y, 4);
    this.pointer.downAt = this.time;
    this.pointer.downX = p.x;
    this.pointer.downY = p.y;
    this.pointer.type = e.pointerType;
    // A finger landing on the sheet is usually starting a scroll: nothing moves until it lifts as a tap.
    if (!hit || e.pointerType === "touch") return;
    // visible at once: the ring starts on this frame, whatever the press turns out to be
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.over = true;
    this.pointer.lastMove = this.time;
    this.press(p.x, p.y, hit);
  };

  /** The ring through the sheet from a press point. */
  private press(x: number, y: number, hit: { u: number; v: number }) {
    this.tour.on = false;
    if (!this.init.reduced) this.ring = { x, y, t0: this.time, u: hit.u, v: hit.v };
    for (const l of this.lines) l.kicked = -1;
    this.wake();
  }

  private onUp = (e: PointerEvent) => {
    if (!this.ready || this.pointer.downAt < 0) return;
    const p = this.local(e);
    const moved = Math.hypot(p.x - this.pointer.downX, p.y - this.pointer.downY);
    this.pointer.downAt = -1;
    if (moved > 14) return;
    const hit = this.toSheet(p.x, p.y, 4);
    if (e.pointerType === "touch" && hit) {
      // a tap: the ring starts now, as the finger lifts
      this.pointer.lastMove = this.time;
      this.press(p.x, p.y, hit);
    }
    const n = hit ? this.sentenceAt(hit.u, hit.v) : null;
    if (n === null || (this.pinned && this.pinned.n === n)) {
      this.pinned = null;
      this.init.handlers.onPin?.(null);
    } else if (hit) {
      this.pinned = { n, u: hit.u, v: hit.v, w: 1 };
      this.pinGlide = null;
      this.init.handlers.onPin?.(n);
      this.setCurrent(n, "pin");
    }
    if (e.pointerType !== "mouse") {
      // fingers lift off: keep the pinned window, drop the moving one
      this.pointer.over = false;
    }
    this.wake();
  };

  private onLeave = () => {
    this.pointer.over = false;
    this.pointer.inCanvas = false;
    this.pointer.downAt = -1;
    this.wake();
  };

  /** Which sentence sits at a sheet point (nearest stretch of text on the nearest line). */
  private sentenceAt(u: number, v: number): number | null {
    let best: number | null = null;
    let bd = Infinity;
    for (const l of this.layout.lines) {
      const dy = v < l.y0 ? l.y0 - v : v > l.y1 ? v - l.y1 : 0;
      if (dy > 22) continue;
      for (const seg of l.segs) {
        const dx = u < seg.x0 ? seg.x0 - u : u > seg.x1 ? u - seg.x1 : 0;
        const d = dx + dy * 2;
        if (d < bd) {
          bd = d;
          best = seg.n;
        }
      }
    }
    return bd < 60 ? best : null;
  }

  private setCurrent(n: number | null, source: LensSource) {
    if (n === this.current && source !== "key" && source !== "pin") return;
    this.current = n;
    this.init.handlers.onSentence?.(n, source);
  }

  /* -------------------------------------------------------------- frame */

  private wake = () => {
    if (this.disposed || !this.ready || this.raf) return;
    if (document.hidden || !this.visible) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = clamp((now - this.last) / 1000, 0, 1 / 20);
    this.last = now;
    this.time += dt;
    const busy = this.update(dt);
    this.render();
    this.updateHud();
    if (busy) this.wake();
  };

  private update(dt: number) {
    const { init, layout } = this;
    const reduced = init.reduced;
    const t = this.time;

    // scroll asks for a stage and a pose; both glide there (a wheel step is a jump otherwise)
    const ease = reduced ? 1 : 1 - Math.exp(-dt / 0.13);
    const ds = this.stageTarget - this.stage;
    this.stage = Math.abs(ds) < 1e-4 ? this.stageTarget : this.stage + ds * ease;
    const P = this.pose;
    const T = this.poseTarget;
    let moving = Math.abs(ds) >= 1e-4;
    for (const key of ["cx", "cy", "scale", "rx", "ry", "rz"] as const) {
      const d = T[key] - P[key];
      const tiny = key === "cx" || key === "cy" ? 0.05 : 1e-4;
      if (Math.abs(d) < tiny) P[key] = T[key];
      else {
        P[key] += d * ease;
        moving = true;
      }
    }
    this.settled = !moving;
    if (this.build < 1) {
      if (this.builtAt < 0) this.builtAt = t;
      this.build = clamp((t - this.builtAt) / 1.35);
      moving = true;
    }
    const lensStage = 1 - smooth(0.12, 0.35, this.stage);

    // the sheet leans a little toward the pointer, and breathes when left alone
    const target = this.pose;
    let lx = 0;
    let ly = 0;
    if (!reduced && this.pointer.inCanvas && this.pointer.type === "mouse") {
      lx = clamp((this.pointer.x / this.W) * 2 - 1, -1, 1);
      ly = clamp((this.pointer.y / this.H) * 2 - 1, -1, 1);
    }
    const k = 40;
    const c = 2 * Math.sqrt(k) * 0.9;
    this.lean.vx += (k * (lx - this.lean.x) - c * this.lean.vx) * dt;
    this.lean.vy += (k * (ly - this.lean.y) - c * this.lean.vy) * dt;
    this.lean.x += this.lean.vx * dt;
    this.lean.y += this.lean.vy * dt;
    const breathe = reduced ? 0 : lensStage;
    const rx = target.rx + this.lean.y * 0.035 * lensStage + Math.sin(t * 0.37) * 0.006 * breathe;
    const ry = target.ry + this.lean.x * 0.055 * lensStage + Math.sin(t * 0.23 + 1) * 0.01 * breathe;
    const s = target.scale;
    const model = sheetModel({ ...target, rx, ry }, this.W, this.H, layout.w, layout.h);
    multiply(this.mvp, this.viewProj, model);
    invert(this.inv, this.mvp);

    // where the lens is: the pointer, a pinned sentence, or the idle tour
    const idleFor = t - this.pointer.lastMove;
    if (!reduced && !this.pointer.over && !this.pinned && this.stage < 0.12 && idleFor > (this.pointer.type === "mouse" ? 3.2 : 6)) this.tour.on = true;
    let src: { x: number; y: number } | null = null;
    let source: LensSource = "pointer";
    if (this.pointer.over && lensStage > 0.5) {
      src = { x: this.pointer.x, y: this.pointer.y };
    } else if (this.tour.on && lensStage > 0.5 && this.build > 0.8) {
      this.stepTour(dt);
      src = this.project(this.tour.u, this.tour.v);
      source = "tour";
    }

    // the head of the lens: on the source, growing with speed (a wider trail when you sweep), closing fast when it goes
    const h = this.head;
    const r0 = (init.compact ? 52 : 70) * s + (init.compact ? 30 : 34);
    if (src) {
      if (!h.has) {
        h.x = h.px = src.x;
        h.y = h.py = src.y;
        h.has = true;
      }
      h.x = src.x;
      h.y = src.y;
      h.w += (1 - h.w) * (1 - Math.exp(-dt / 0.035));
    } else {
      h.w += (0 - h.w) * (1 - Math.exp(-dt / (reduced ? 0.001 : 0.085)));
      if (h.w < 0.01) h.has = false;
    }
    const dist = Math.hypot(h.x - h.px, h.y - h.py);
    const speed = dt > 0 ? dist / dt : 0;
    h.speed += (speed - h.speed) * (1 - Math.exp(-dt / 0.06));
    h.px = h.x;
    h.py = h.y;
    const want = reduced ? 0 : clamp(h.speed / 1500);
    h.boost += (want - h.boost) * (1 - Math.exp(-dt / (want > h.boost ? 0.05 : 0.32)));
    h.r = r0 * (1 + h.boost * 0.85);
    if (src && !reduced) {
      const lastPt = this.trail[this.trail.length - 1];
      if (!lastPt || Math.hypot(lastPt.x - h.x, lastPt.y - h.y) > 7) {
        this.trail.push({ x: h.x, y: h.y, r: h.r * 0.92, t });
        if (this.trail.length > MAX_PTS - 3) this.trail.shift();
      }
    }
    this.trail = this.trail.filter((p) => t - p.t < 0.6);

    // pinned window
    let pinPt: { x: number; y: number; u: number; v: number } | null = null;
    if (this.pinned) {
      const pin = this.pinned;
      let u = pin.u;
      let v = pin.v;
      if (this.pinGlide) {
        this.pinGlide.t = Math.min(1, this.pinGlide.t + dt / 0.42);
        const e = easeInOut(this.pinGlide.t);
        u = this.pinGlide.fromU + (pin.u - this.pinGlide.fromU) * e;
        v = this.pinGlide.fromV + (pin.v - this.pinGlide.fromV) * e;
        if (this.pinGlide.t >= 1) this.pinGlide = null;
      }
      pin.w += ((lensStage > 0.5 ? 1 : 0) - pin.w) * (1 - Math.exp(-dt / (reduced ? 0.001 : 0.06)));
      pinPt = { ...this.project(u, v), u, v };
    }

    // which sentence the lens is reading
    if (src) {
      const hit = this.toSheet(src.x, src.y, 10);
      const n = hit ? this.sentenceAt(hit.u, hit.v) : null;
      if (source === "tour") {
        const near = this.tour.phase === 1 ? this.tour.idx : null;
        if (near !== null) this.setCurrent(tourOrder[near], "tour");
      } else if (!this.pinned || n !== null) this.setCurrent(n ?? this.pinned?.n ?? null, "pointer");
    } else if (this.pinned && this.current !== this.pinned.n) {
      this.setCurrent(this.pinned.n, "pin");
    }

    // lines: lift where the lens lingers, light where it reads a flagged sentence
    const centers: { u: number; v: number; R: number; w: number }[] = [];
    if (src && h.w > 0.02) {
      const hit = this.toSheet(h.x, h.y, 200);
      if (hit) centers.push({ u: hit.u, v: hit.v, R: h.r / s, w: h.w });
    }
    if (pinPt && this.pinned) centers.push({ u: pinPt.u, v: pinPt.v, R: r0 / s, w: this.pinned.w });
    const slow = h.speed < 700;
    const ringAge = this.ring.t0 >= 0 ? t - this.ring.t0 : -1;
    const ringR = ringAge >= 0 ? (40 + 1100 * (1 - Math.exp(-ringAge / 0.5))) / s : -1;
    const liftMax = init.compact ? 16 : 24;
    // the hero breathes, so it keeps drawing; the chapters draw only while something moves
    let busy = moving || h.w > 0.01 || this.trail.length > 0 || this.tour.on || (ringAge >= 0 && ringAge < 2.2) || !!this.pinGlide || (!reduced && lensStage > 0.01);
    for (const l of layout.lines) {
      const st = this.lines[l.i];
      let inf = 0;
      for (const cc of centers) {
        const dx = cc.u < l.x0 ? l.x0 - cc.u : cc.u > l.x1 ? cc.u - l.x1 : 0;
        const dy = cc.v < l.y0 ? l.y0 - cc.v : cc.v > l.y1 ? cc.v - l.y1 : 0;
        const d = Math.hypot(dx, dy);
        inf = Math.max(inf, (1 - smooth(cc.R * 0.3, cc.R * 1.25, d)) * cc.w);
      }
      inf *= lensStage;
      // dwell builds while the lens rests near, so a quick sweep barely moves a line
      st.dwell = clamp(st.dwell + (inf > 0.3 && slow ? dt / 0.32 : -dt / 0.5));
      const targetLift = reduced ? 0 : liftMax * inf * (0.25 + 0.75 * st.dwell);
      // rising is quick and firm; settling back is slower and a little uneven from line to line
      const kk = targetLift > st.lift ? 120 - 50 * (1 - inf) : 34 + 26 * st.seed + (targetLift > 0.01 ? 20 : 0);
      const cc2 = 2 * Math.sqrt(kk) * 0.72;
      st.vel += (kk * (targetLift - st.lift) - cc2 * st.vel) * dt;
      // the ring of a press lifts each line as it passes
      if (ringR > 0 && st.kicked < 0 && !reduced) {
        const cy = (l.y0 + l.y1) / 2;
        const cx = clamp(this.ring.u, l.x0, l.x1);
        if (Math.hypot(cx - this.ring.u, cy - this.ring.v) < ringR) {
          st.kicked = t;
          st.vel += 120 * Math.exp(-ringAge / 0.8);
        }
      }
      st.lift += st.vel * dt;
      if (Math.abs(st.lift) < 0.01 && Math.abs(st.vel) < 0.01) {
        st.lift = 0;
        st.vel = 0;
      }
      // the light rises with the lift and fades last
      const gTarget = reduced ? 0 : inf * riskWeight[l.risk] * (0.3 + 0.7 * st.dwell);
      st.glow += (gTarget - st.glow) * (1 - Math.exp(-dt / (gTarget > st.glow ? 0.22 : lensStage > 0.5 ? 1.3 : 0.3)));
      if (st.glow < 0.002) st.glow = 0;
      if (st.lift !== 0 || st.glow > 0.004 || (st.dwell > 0 && st.dwell < 1 && !reduced)) busy = true;
    }

    // the field points for the GPU
    const pts: number[] = [];
    const dpr = this.dpr;
    const push = (x: number, y: number, r: number, w: number) => {
      if (w < 0.01 || pts.length / 4 >= MAX_PTS) return;
      pts.push(x * dpr, (this.H - y) * dpr, r * dpr, w);
    };
    if (h.w > 0.01) push(h.x, h.y, h.r, h.w * lensStage);
    for (const p of this.trail) {
      const age = t - p.t;
      push(p.x, p.y, p.r, Math.exp(-age / 0.17) * 0.85 * lensStage);
    }
    if (pinPt && this.pinned) push(pinPt.x, pinPt.y, r0, this.pinned.w * lensStage);
    this.fieldPts = pts;
    this.ringU = ringAge >= 0 && ringAge < 2.2 ? [this.ring.x * dpr, (this.H - this.ring.y) * dpr, (40 + 1100 * (1 - Math.exp(-ringAge / 0.5))) * dpr, Math.exp(-ringAge / 0.55) * 0.9] : [0, 0, 0, 0];
    return busy;
  }

  private fieldPts: number[] = [];
  private ringU = [0, 0, 0, 0];

  private stepTour(dt: number) {
    const tr = this.tour;
    const L = this.layout;
    const target = (i: number) => {
      const s = L.sentences.get(tourOrder[i % tourOrder.length])!;
      return { u: s.cx, v: s.cy };
    };
    if (!tr.started) {
      const a = target(0);
      tr.u = tr.fromU = a.u - 160;
      tr.v = tr.fromV = a.v + 40;
      tr.toU = a.u;
      tr.toV = a.v;
      tr.idx = 0;
      tr.phase = 0;
      tr.t = 0;
      tr.started = true;
    }
    tr.t += dt;
    if (tr.phase === 0) {
      const e = easeInOut(clamp(tr.t / 1.0));
      tr.u = tr.fromU + (tr.toU - tr.fromU) * e;
      tr.v = tr.fromV + (tr.toV - tr.fromV) * e;
      if (tr.t >= 1.0) {
        tr.phase = 1;
        tr.t = 0;
      }
    } else {
      // read along the sentence while resting on it
      tr.u = tr.toU + Math.sin(tr.t * 0.9) * 26;
      tr.v = tr.toV + Math.sin(tr.t * 0.6) * 3;
      if (tr.t >= 1.9) {
        tr.idx = (tr.idx + 1) % tourOrder.length;
        tr.fromU = tr.u;
        tr.fromV = tr.v;
        const b = target(tr.idx);
        tr.toU = b.u;
        tr.toV = b.v;
        tr.phase = 0;
        tr.t = 0;
      }
    }
  }

  private render() {
    const gl = this.gl;
    const { layout } = this;
    const [fw, fh] = this.fieldSize;
    const stage = this.stage;
    const lensOn = 1 - smooth(0.12, 0.35, stage);

    // 1. the lens field, at a quarter of the resolution
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, fw, fh);
    gl.disable(gl.BLEND);
    const F = this.progs.field;
    gl.useProgram(F.p);
    gl.uniform2f(F.u("uSize"), fw, fh);
    gl.uniform2f(F.u("uView"), this.canvas.width, this.canvas.height);
    const pts = new Float32Array(MAX_PTS * 4);
    pts.set(this.fieldPts.slice(0, MAX_PTS * 4));
    gl.uniform4fv(F.u("uPts"), pts);
    gl.uniform1i(F.u("uCount"), this.fieldPts.length / 4);
    gl.uniform4fv(F.u("uRing"), new Float32Array(this.ringU));
    // with reduced motion the lens outline holds still (no breathing wobble)
    gl.uniform1f(F.u("uTime"), this.init.reduced ? 0 : this.time);
    gl.uniform1f(F.u("uDpr"), this.dpr);
    gl.bindVertexArray(this.vaoField);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. the sheet
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // stage → scan line, chart fold, refine flip
    const lastLine = layout.lines[layout.lines.length - 1];
    const scanSpan = lastLine.y1 + 14 - (layout.header - 8);
    const scanY = stage <= 1 ? -1 : stage >= 2 ? -1 : layout.header - 8 + scanSpan * easeInOut(clamp(stage - 1));
    const revealAll = stage >= 2 ? 1 : 0;
    const morphOf = (i: number) => {
      const out = clamp((stage - 2) * 1.35 - i * 0.012);
      const back = clamp((stage - 3) * 2.2 - i * 0.01);
      return easeInOut(clamp(out - back));
    };
    const refineOf = (i: number) => clamp((stage - 3.35) * 2.2 - i * 0.025);
    const refineAll = smooth(3.4, 3.9, stage);

    const buildE = easeInOut(this.build);
    const bind = (prog: Program) => {
      gl.useProgram(prog.p);
      gl.uniform1f(prog.u("uBuild"), buildE);
      gl.uniformMatrix4fv(prog.u("uMVP"), false, this.mvp);
      gl.uniform2f(prog.u("uSheet"), layout.w, layout.h);
      gl.uniform2f(prog.u("uView"), this.canvas.width, this.canvas.height);
      gl.uniform1f(prog.u("uLensOn"), lensOn);
      gl.uniform1f(prog.u("uScan"), revealAll ? 1e5 : scanY);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.h);
      gl.uniform1i(prog.u("uTexH"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.m);
      gl.uniform1i(prog.u("uTexM"), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.r);
      gl.uniform1i(prog.u("uTexR"), 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.field);
      gl.uniform1i(prog.u("uField"), 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.rows);
      gl.uniform1i(prog.u("uRows"), 4);
    };

    // base: paper, notes, and the slots under the lines
    const B = this.progs.base;
    bind(B);
    const lineU = new Float32Array(MAX_LINES * 4);
    const fxU = new Float32Array(MAX_LINES * 4);
    for (const l of layout.lines) {
      const st = this.lines[l.i];
      lineU.set([l.x0 - 4, l.y0 + 1, l.x1 + 4, l.y1 - 1], l.i * 4);
      fxU.set([st.lift, st.glow, riskWeight[l.risk], morphOf(l.i)], l.i * 4);
    }
    gl.uniform4fv(B.u("uLine"), lineU);
    gl.uniform4fv(B.u("uFx"), fxU);
    gl.uniform1f(B.u("uRefine"), stage > 3 ? refineAll * 0.999 : 0);
    gl.uniform1f(B.u("uSlots"), 1);
    gl.uniform1f(B.u("uDim"), 0.42 * smooth(2.25, 2.8, stage) * (1 - smooth(3.05, 3.45, stage)));
    gl.uniform4f(B.u("uGlassTop"), GLASS_TOP[0] / 255, GLASS_TOP[1] / 255, GLASS_TOP[2] / 255, GLASS_TOP[3]);
    gl.uniform4f(B.u("uGlassBot"), GLASS_BOTTOM[0] / 255, GLASS_BOTTOM[1] / 255, GLASS_BOTTOM[2] / 255, GLASS_BOTTOM[3]);
    gl.bindVertexArray(this.vaoSheet);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // strips: the lines of text, as blocks
    const S = this.progs.strip;
    bind(S);
    gl.uniform1f(S.u("uPx"), 1 / Math.max(0.2, this.poseTarget.scale));
    const inst = this.inst;
    // nearer blocks are drawn last, so a lifted line is never hidden under its neighbour
    const zOf = (i: number) => this.lines[i].lift + Math.sin(Math.PI * morphOf(i)) * 30;
    this.order.sort((a, b) => zOf(a) - zOf(b));
    for (let k = 0; k < this.order.length; k++) {
      const l = layout.lines[this.order[k]];
      const st = this.lines[l.i];
      const o = k * 17;
      const m = morphOf(l.i);
      const flagged = l.segs.some((g) => g.risk !== "low");
      const rf = flagged ? refineOf(l.i) : 0;
      const flip = flagged ? Math.sin(Math.PI * rf) * (Math.PI / 2) : 0;
      const tilt = (st.lift / 24) * 0.1 * (st.seed > 0.5 ? 1 : -1);
      const col = riskRGB[l.pRisk];
      inst[o] = l.x0 - 4;
      inst[o + 1] = l.y0 + 1;
      inst[o + 2] = l.x1 + 4;
      inst[o + 3] = l.y1 - 1;
      inst[o + 4] = l.bar.x0;
      inst[o + 5] = l.bar.y0;
      inst[o + 6] = l.bar.x1;
      inst[o + 7] = l.bar.y1;
      inst[o + 8] = st.lift + Math.sin(Math.PI * m) * 30;
      inst[o + 9] = tilt;
      inst[o + 10] = flip;
      inst[o + 11] = m;
      inst[o + 12] = col[0] / 255;
      inst[o + 13] = col[1] / 255;
      inst[o + 14] = col[2] / 255;
      inst[o + 15] = st.glow;
      inst[o + 16] = stage > 3 ? (flagged ? (rf > 0.5 ? 1 : 0) : refineAll) : 0;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst);
    gl.bindVertexArray(this.vaoStrip);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, layout.lines.length);

    // overlay: contour lines round the lens, the ring of a press, the scan line
    const O = this.progs.overlay;
    bind(O);
    gl.uniform1f(O.u("uScanX0"), 18);
    gl.uniform1f(O.u("uScanX1"), layout.w - 18);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vaoSheet);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private updateHud() {
    const leader = this.init.leader;
    if (leader) {
      const lensOn = 1 - smooth(0.12, 0.35, this.stage);
      const s = this.current !== null ? this.layout.sentences.get(this.current) : undefined;
      const from = s && lensOn > 0.5 ? leader.from(s.n) : null;
      if (!s || !from) {
        if (leader.line.style.opacity !== "0") leader.line.style.opacity = "0";
        if (leader.dot && leader.dot.style.opacity !== "0") leader.dot.style.opacity = "0";
      } else {
        // straight down out of the index, then across to where the sentence starts
        const to = this.project(s.ax - 6, s.cy, 0);
        const drop = Math.min(14, Math.max(0, (to.y - from.y) * 0.4));
        const pts = `${from.x.toFixed(1)},${from.y.toFixed(1)} ${from.x.toFixed(1)},${(from.y + drop).toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
        if (leader.line.getAttribute("points") !== pts) leader.line.setAttribute("points", pts);
        leader.line.style.opacity = lensOn.toFixed(3);
        if (leader.dot) {
          leader.dot.setAttribute("cx", to.x.toFixed(1));
          leader.dot.setAttribute("cy", to.y.toFixed(1));
          leader.dot.style.opacity = lensOn.toFixed(3);
        }
      }
    }
    for (const item of this.hudItems) {
      const a = item.show(this.stage);
      if (a <= 0.001) {
        if (item.el.style.opacity !== "0") item.el.style.opacity = "0";
        continue;
      }
      const p = this.project(item.x, item.y, 0);
      item.el.style.opacity = a.toFixed(3);
      item.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }
}

/** Presses and hovers on links, buttons and text the visitor reads are theirs, not the lens's. */
function overControl(t: EventTarget | null) {
  return t instanceof Element && !!t.closest("a,button,input,textarea,select,label,[data-lens-ignore]");
}

export function webgl2Available() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

