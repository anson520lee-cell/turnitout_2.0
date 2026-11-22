// Coordinates are in the paper's own space. Text, hit testing and ink particles
// share this projection, so bending the page never changes what a line means.
import { ringLift, type Field } from "./manuscript-motion";

type Point = { x: number; y: number };
type Word = { u: number; v: number; end: number; text: string; sentence: number };
/** One row of one sentence. `row` counts the sentence's rows from 0. */
type InkLine = { u: number; v: number; end: number; sentence: number; row: number };
export type ManuscriptSentence = { text: string; paragraph: number };
export type Paper = ReturnType<typeof typeset>;

/** Size of the plate the type is printed on, px. */
export const PLATE = { w: 1008, h: 576 } as const;

export function typeset(sentences: readonly ManuscriptSentence[]) {
  const words: Word[] = [];
  const lines: InkLine[] = [];
  const width = 35;
  const advance = 0.389 / width;
  const paragraphs = [...new Set(sentences.map((s) => s.paragraph))];
  const split = Math.ceil(paragraphs.length / 2);
  const rowsOf = new Array<number>(sentences.length).fill(0);
  for (let column = 0; column < 2; column++) {
    const margin = 0.064 + column * 0.48;
    const groups = paragraphs.slice(column * split, (column + 1) * split);
    let row = 0;
    const start = words.length;
    const startLine = lines.length;
    for (const paragraph of groups) {
      let chars = 0;
      sentences.forEach((s, sentence) => {
        if (s.paragraph !== paragraph) return;
        for (const text of s.text.split(/\s+/)) {
          if (chars && chars + text.length > width) {
            row++;
            chars = 0;
          }
          const u = margin + chars * advance;
          const end = u + text.length * advance;
          words.push({ u, v: row, end, text, sentence });
          const last = lines.at(-1);
          if (last && last.v === row && last.sentence === sentence) last.end = end;
          else lines.push({ u, v: row, end, sentence, row: rowsOf[sentence]++ });
          chars += text.length + 1;
        }
      });
      row += 2;
    }
    const lineHeight = Math.min(0.058, 0.72 / Math.max(row - 2, 1));
    for (let i = start; i < words.length; i++) words[i].v = 0.21 + words[i].v * lineHeight;
    for (let i = startLine; i < lines.length; i++) lines[i].v = 0.21 + lines[i].v * lineHeight;
  }
  // Centre of each sentence on the sheet, for the neighbours' lift and the release wave.
  const centres = sentences.map((_, s) => {
    const own = lines.filter((l) => l.sentence === s);
    return {
      u: own.reduce((a, l) => a + (l.u + l.end) / 2, 0) / Math.max(own.length, 1),
      v: own.reduce((a, l) => a + l.v, 0) / Math.max(own.length, 1),
    };
  });
  return { words, lines, rows: rowsOf, centres };
}

type Palette = { dark: string; surface: string; edge: string; ink: string; blue: string; light: string };

export function paperPalette(node: HTMLElement): Palette {
  const styles = getComputedStyle(node);
  const token = (name: string) => styles.getPropertyValue("--color-" + name).trim();
  return {
    dark: token("ink-900"),
    surface: token("ink-700"),
    edge: token("fg-subtle"),
    ink: token("fg"),
    blue: token("accent"),
    light: token("cyan"),
  };
}

/** The same colour with an alpha, so gradients fade without passing through black. */
function withAlpha(color: string, alpha: number) {
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return color;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

type Bend = Pick<Field, "x" | "y" | "tailX" | "tailY" | "bend">;

function projection(w: number, h: number, field: Bend) {
  return (u: number, v: number, depth = 0): Point => {
    const roll = Math.sin(u * 6.1 - v * 1.1 - 0.8);
    const x = 0.135 + 0.745 * u + 0.112 * (0.5 - v) + 0.02 * roll;
    const y = 0.218 + 0.52 * v - 0.127 * (u - 0.5) - 0.105 * roll * (0.65 + v * 0.42);
    const dx = x - field.x,
      dy = y - field.y;
    const distance = dx * dx * 11 + dy * dy * 4;
    const near = field.bend / (1 + distance * distance * 22);
    // The sheet swells toward the reader around the pointer like paper under a
    // lens: it spreads away from the pointer and rises only a little, so the
    // line under the pointer stays under it. The trailing terms drag the swell
    // behind a moving pointer.
    return {
      x: (x + near * (0.08 * dx + 0.12 * (field.x - field.tailX)) + depth * 0.00095) * w,
      y: (y + near * (0.1 * dy - 0.03 - 0.3 * (field.y - field.tailY)) + depth * (0.006 + 0.006 * u)) * h,
    };
  };
}

const distanceToLine = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
};

/** How much closer, px, another sentence must be before the pointer leaves the one it is reading. */
const STICKY = 3;

/** Sentence under a point (canvas units 0…1), or -1. `keep` is the sentence already being read. */
export function sentenceAt(paper: Paper, w: number, h: number, x: number, y: number, field: Bend, keep = -1) {
  const point = projection(w, h, field);
  const p = { x: x * w, y: y * h };
  const reach = Math.max(11, h * 0.07) ** 2;
  let distance = reach,
    selected = -1,
    kept = Infinity;
  for (const l of paper.lines) {
    const d = distanceToLine(p, point(l.u, l.v), point(l.end, l.v));
    if (d < distance) {
      distance = d;
      selected = l.sentence;
    }
    if (l.sentence === keep && d < kept) kept = d;
  }
  if (kept < reach && Math.sqrt(kept) < Math.sqrt(distance) + STICKY) return keep;
  return selected;
}

/** How close each sentence is to the pointer, 0…1, written into `out`. */
export function nearness(paper: Paper, w: number, h: number, field: Bend, out: Float32Array) {
  const at = projection(w, h, field);
  out.fill(0);
  const reach = 0.1 * w;
  for (const l of paper.lines) {
    const a = at(l.u, l.v),
      b = at(l.end, l.v);
    const d = Math.sqrt(distanceToLine({ x: field.x * w, y: field.y * h }, a, b));
    const n = Math.exp(-((d / reach) ** 2));
    if (n > out[l.sentence]) out[l.sentence] = n;
  }
}

// Rasterise the type once per selection. During pointer movement the canvas
// bends this plate as a mesh, without laying out or drawing 200 words per frame.
export function printInk(plate: HTMLCanvasElement, paper: Paper, index: number, color: Palette) {
  const ink = plate.getContext("2d");
  if (!ink) return;
  const w = plate.width,
    h = plate.height;
  ink.clearRect(0, 0, w, h);
  ink.fillStyle = color.light;
  ink.globalAlpha = 0.27;
  for (let i = 0; i < 38; i++) {
    for (let j = 0; j < 21; j++) {
      ink.fillRect(((i + 0.4 + 0.25 * Math.sin(j * 5 + i)) * w) / 38, ((j + 0.5) * h) / 21, 1.6, 1.6);
    }
  }
  ink.globalAlpha = 0.62;
  ink.fillRect(0.062 * w, 0.142 * h, 0.875 * w, 1.8);
  ink.globalAlpha = 0.24;
  ink.fillRect(0.507 * w, 0.18 * h, 1.5, 0.74 * h);
  ink.globalAlpha = 1;
  ink.fillStyle = color.ink;
  ink.font = "36px Georgia, serif";
  ink.fillText("Urban transport", 0.064 * w, 0.105 * h);
  ink.fillStyle = color.blue;
  ink.globalAlpha = 0.68;
  for (const l of paper.lines) {
    if (l.sentence === index) ink.fillRect(l.u * w - 2, l.v * h - 12, (l.end - l.u) * w + 3, 16);
  }
  ink.font = "15px monospace";
  for (const word of paper.words) {
    const marked = word.sentence === index;
    ink.fillStyle = marked ? color.ink : color.light;
    ink.globalAlpha = marked ? 1 : 0.88;
    ink.fillText(word.text, word.u * w, word.v * h, (word.end - word.u) * w);
  }
  ink.globalAlpha = 1;
}

/** A row of type lifted off the sheet: where it sits on the page and where it floats now. */
type Strip = {
  sentence: number;
  lift: number;
  /** Footprint on the page, top edge then bottom edge, both left to right. */
  top: Point[];
  bottom: Point[];
  /** Floating parallelogram: top-left, top-right, bottom-left. */
  a: Point;
  b: Point;
  c: Point;
  /** Plate rectangle it shows. */
  src: [number, number, number, number];
};

function liftStrips(paper: Paper, field: Field, at: ReturnType<typeof projection>, w: number, h: number) {
  const centre = paper.centres.map((c) => at(c.u, c.v));
  const lifts = paper.centres.map((_, s) => {
    const p = centre[s];
    const wave = ringLift(field, Math.hypot(p.x / w - field.ringX, (p.y / h - field.ringY) * (h / w)));
    return field.lift[s] + wave;
  });
  const strips: Strip[] = [];
  for (const l of paper.lines) {
    const lift = lifts[l.sentence];
    if (lift < 0.015 && !(l.sentence === field.probe && field.probeAlpha > 0.01)) continue;
    const sx = l.u * PLATE.w - 4,
      sy = l.v * PLATE.h - 14,
      sw = (l.end - l.u) * PLATE.w + 8,
      sh = 19;
    const u0 = sx / PLATE.w,
      u1 = (sx + sw) / PLATE.w,
      v0 = sy / PLATE.h,
      v1 = (sy + sh) / PLATE.h;
    const steps = Math.max(1, Math.ceil((u1 - u0) / 0.06));
    const top: Point[] = [],
      bottom: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      top.push(at(u, v0));
      bottom.push(at(u, v1));
    }
    const A = top[0],
      B = top[top.length - 1],
      C = bottom[0],
      D = bottom[bottom.length - 1];
    const k = Math.min(1, lift);
    const along = { x: B.x - A.x, y: B.y - A.y };
    const length = Math.hypot(along.x, along.y) || 1;
    // Turn toward the reader as it rises: less slant, less foreshortening.
    const cx = (A.x + B.x + C.x + D.x) / 4,
      cy = (A.y + B.y + C.y + D.y) / 4;
    const side = Math.max(-0.5, Math.min(0.5, cx / w - field.x));
    const angle = Math.atan2(along.y, along.x) * (1 - 0.45 * k) + side * 0.1 * k;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const down0 = { x: (C.x - A.x + D.x - B.x) / 2, y: (C.y - A.y + D.y - B.y) / 2 };
    const upright = (sh / sw) * length;
    const blend = 0.6 * k;
    const down = {
      x: down0.x + (-dir.y * upright - down0.x) * blend,
      y: down0.y + (dir.x * upright - down0.y) * blend,
    };
    const grow = 1 + 0.1 * k;
    const rows = paper.rows[l.sentence];
    const spread = (l.row - (rows - 1) / 2) * 0.016 * h * k;
    const ox = side * 10 * k,
      oy = -0.052 * h * lift + spread;
    const a = {
      x: cx + ox - (dir.x * length * grow) / 2 - down.x / 2,
      y: cy + oy - (dir.y * length * grow) / 2 - down.y / 2,
    };
    strips.push({
      sentence: l.sentence,
      lift,
      top,
      bottom,
      a,
      b: { x: a.x + dir.x * length * grow, y: a.y + dir.y * length * grow },
      c: { x: a.x + down.x, y: a.y + down.y },
      src: [sx, sy, sw, sh],
    });
  }
  return strips.sort((p, q) => p.lift - q.lift);
}

function parallelogram(ctx: CanvasRenderingContext2D, s: Strip, dx = 0, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(s.a.x + dx, s.a.y + dy);
  ctx.lineTo(s.b.x + dx, s.b.y + dy);
  ctx.lineTo(s.b.x + s.c.x - s.a.x + dx, s.b.y + s.c.y - s.a.y + dy);
  ctx.lineTo(s.c.x + dx, s.c.y + dy);
  ctx.closePath();
}

export function drawManuscript(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  paper: Paper,
  index: number,
  field: Field,
  color: Palette,
  plate: HTMLCanvasElement,
) {
  const at = projection(w, h, field);
  function trace(u: number, v: number, toU: number, toV: number, depth = 0, start = true) {
    const steps = Math.abs(toU - u) > 0.12 ? 28 : 7;
    for (let i = start ? 0 : 1; i <= steps; i++) {
      const t = i / steps;
      const p = at(u + (toU - u) * t, v + (toV - v) * t, depth);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }
  function outline(d: number) {
    ctx.beginPath();
    trace(0, 0, 1, 0, d);
    trace(1, 0, 1, 1, d, false);
    trace(1, 1, 0, 1, d, false);
    trace(0, 1, 0, 0, d, false);
    ctx.closePath();
  }
  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = "round";
  for (let d = 7; d > 0; d--) {
    outline(d);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = color.dark;
    ctx.fill();
    ctx.globalAlpha = 0.2 + (7 - d) * 0.034;
    ctx.strokeStyle = color.light;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  const wash = ctx.createLinearGradient(w * 0.14, h * 0.45, w * 0.9, h * 0.65);
  wash.addColorStop(0, color.surface);
  wash.addColorStop(0.37, color.dark);
  wash.addColorStop(0.73, color.surface);
  wash.addColorStop(1, color.dark);
  outline(0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = wash;
  ctx.fill();
  ctx.strokeStyle = color.edge;
  ctx.lineWidth = 1;
  ctx.stroke();

  const sheen = ctx.createLinearGradient(w * 0.1, h, w * 0.9, 0);
  sheen.addColorStop(0, color.light);
  sheen.addColorStop(0.39, color.dark);
  sheen.addColorStop(0.68, color.light);
  sheen.addColorStop(1, color.surface);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = sheen;
  ctx.fill();

  // Light under the paper: builds where the reader rests, and outlasts the lines.
  if (field.energy > 0.01) {
    ctx.save();
    outline(0);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const px = field.x * w,
      py = field.y * h;
    const light = ctx.createRadialGradient(px, py, 0, px, py, w * 0.34);
    light.addColorStop(0, withAlpha(color.blue, 0.3 * Math.min(1.2, field.energy)));
    light.addColorStop(0.45, withAlpha(color.blue, 0.1 * Math.min(1.2, field.energy)));
    light.addColorStop(1, withAlpha(color.blue, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  // Each projected patch uses the real corner positions of the paper. The
  // plate is transparent between words, so the continuous surface shows through.
  const columns = 24,
    bands = 3;
  const sw = plate.width / columns,
    sh = plate.height / bands;
  const mesh = Array.from({ length: bands + 1 }, (_, j) =>
    Array.from({ length: columns + 1 }, (_, i) => at(i / columns, j / bands)),
  );
  for (let j = 0; j < bands; j++) {
    for (let i = 0; i < columns; i++) {
      const a = mesh[j][i],
        across = mesh[j][i + 1],
        down = mesh[j + 1][i];
      ctx.save();
      ctx.transform(
        (across.x - a.x) / sw,
        (across.y - a.y) / sw,
        (down.x - a.x) / sh,
        (down.y - a.y) / sh,
        a.x,
        a.y,
      );
      ctx.drawImage(plate, i * sw, j * sh, sw, sh, 0, 0, sw + 0.25, sh + 0.25);
      ctx.restore();
    }
  }

  // Ink thrown off by a quick sweep: dust from the words under the pointer,
  // trailing the direction of travel. Resting on a line raises it instead.
  const dust = Math.min(1, field.speed / 2.4);
  if (dust > 0.04) {
    ctx.fillStyle = color.light;
    for (const word of paper.words) {
      const p = at((word.u + word.end) / 2, word.v);
      const dx = p.x / w - field.x,
        dy = p.y / h - field.y;
      const influence = dust * Math.max(0, 1 - 11 * dx * dx - 5 * dy * dy);
      if (influence < 0.28) continue;
      for (let j = 0; j < 3; j++) {
        const seed = Math.sin(word.u * 471 + word.v * 173 + j * 37);
        const scatter = influence * influence;
        const x = p.x + (seed * 18 + (field.x - field.tailX) * w * 0.45) * scatter;
        const y = p.y - (3 + Math.abs(seed) * 27) * scatter;
        ctx.globalAlpha = scatter * (0.52 + 0.26 * Math.abs(seed));
        ctx.fillRect(x, y, 1.1, 1.1);
      }
    }
  }

  // Lifted rows: the gap they leave glows from under the page, the row floats
  // above it with its own shadow and a lit top edge.
  const strips = liftStrips(paper, field, at, w, h);
  for (const s of strips) {
    const k = Math.min(1, s.lift);
    if (k < 0.015) continue;
    ctx.beginPath();
    s.top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    for (let i = s.bottom.length - 1; i >= 0; i--) ctx.lineTo(s.bottom[i].x, s.bottom[i].y);
    ctx.closePath();
    ctx.globalAlpha = Math.min(1, k * 2.2) * 0.9;
    ctx.fillStyle = color.dark;
    ctx.fill();
    const mid = s.top.length >> 1;
    const slit = ctx.createLinearGradient(s.bottom[mid].x, s.bottom[mid].y, s.top[mid].x, s.top[mid].y);
    const glow = k * (0.3 + 0.6 * Math.min(1.2, field.energy));
    slit.addColorStop(0, withAlpha(color.light, Math.min(1, glow)));
    slit.addColorStop(1, withAlpha(color.blue, glow * 0.35));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    ctx.fillStyle = slit;
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    const rise = 0.052 * h * s.lift;
    parallelogram(ctx, s, 1.5, rise * 0.5);
    ctx.globalAlpha = 0.5 * k;
    ctx.fillStyle = color.dark;
    ctx.fill();
    parallelogram(ctx, s);
    ctx.globalAlpha = Math.min(1, k * 1.8) * 0.94;
    ctx.fillStyle = color.surface;
    ctx.fill();
    ctx.globalAlpha = 1;
    const [x, y, rw, rh] = s.src;
    ctx.save();
    ctx.transform((s.b.x - s.a.x) / rw, (s.b.y - s.a.y) / rw, (s.c.x - s.a.x) / rh, (s.c.y - s.a.y) / rh, s.a.x, s.a.y);
    ctx.drawImage(plate, x, y, rw, rh, 0, 0, rw, rh);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.globalAlpha = 0.5 * k;
    ctx.strokeStyle = color.light;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // The hairline: the reader's mark under the sentence being read, drawn on
  // the row wherever it floats. It moves in the same frame as the pointer.
  if (field.probe >= 0 && field.probeAlpha > 0.01) {
    ctx.beginPath();
    for (const s of strips) {
      if (s.sentence !== field.probe) continue;
      const lifted = s.lift >= 0.015;
      const left = lifted ? s.c : s.bottom[0];
      const right = lifted ? { x: s.b.x + s.c.x - s.a.x, y: s.b.y + s.c.y - s.a.y } : s.bottom[s.bottom.length - 1];
      ctx.moveTo(left.x, left.y + 1);
      ctx.lineTo(right.x, right.y + 1);
    }
    ctx.globalAlpha = field.probeAlpha;
    ctx.strokeStyle = color.light;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // A leader connects the selected passage to the edge, like an actual proof.
  const first = strips.find((s) => s.sentence === index && s.lift >= 0.015);
  const active = paper.lines.find((l) => l.sentence === index);
  if (active) {
    const p = first ? { x: (first.a.x + first.c.x) / 2, y: (first.a.y + first.c.y) / 2 } : at(active.u - 0.012, active.v);
    const side = active.u < 0.5 ? -1 : 1;
    const edge = at(side < 0 ? 0 : 1, active.v);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(edge.x + side * 6, edge.y);
    ctx.lineTo(edge.x + side * 15, edge.y - 8);
    ctx.strokeStyle = color.light;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.fillStyle = color.ink;
    ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
  }

  // A finger leaves a drop of ink that spreads from where it landed.
  if (field.tap >= 0) {
    const t = field.tap / 520;
    const r = 3 + 21 * Math.pow(t, 0.6);
    ctx.beginPath();
    ctx.arc(field.tapX * w, field.tapY * h, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.85 * (1 - t);
    ctx.strokeStyle = color.light;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(field.tapX * w, field.tapY * h, 2.6 * (1 - t), 0, Math.PI * 2);
    ctx.fillStyle = color.ink;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
