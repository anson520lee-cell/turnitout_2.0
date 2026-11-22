// Coordinates are in the paper's own space. Text, hit testing and ink particles
// share this projection, so bending the page never changes what a line means.
type Point = { x: number; y: number };
type Word = { u: number; v: number; end: number; text: string; sentence: number };
type InkLine = { u: number; v: number; end: number; sentence: number };
export type ManuscriptSentence = { text: string; paragraph: number };
type Paper = ReturnType<typeof typeset>;

export function typeset(sentences: readonly ManuscriptSentence[]) {
  const words: Word[] = [];
  const lines: InkLine[] = [];
  const width = 35;
  const advance = 0.389 / width;
  const paragraphs = [...new Set(sentences.map((s) => s.paragraph))];
  const split = Math.ceil(paragraphs.length / 2);
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
          else lines.push({ u, v: row, end, sentence });
          chars += text.length + 1;
        }
      });
      row += 2;
    }
    const lineHeight = Math.min(0.058, 0.72 / Math.max(row - 2, 1));
    for (let i = start; i < words.length; i++) words[i].v = 0.21 + words[i].v * lineHeight;
    for (let i = startLine; i < lines.length; i++) lines[i].v = 0.21 + lines[i].v * lineHeight;
  }
  return { words, lines };
}

export const restPose = { x: 0.5, y: 0.5, tailX: 0.5, tailY: 0.5, lift: 0, pulse: 0 };
export type Pose = typeof restPose;
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

function projection(w: number, h: number, pose: Pose) {
  return (u: number, v: number, depth = 0): Point => {
    const roll = Math.sin(u * 6.1 - v * 1.1 - 0.8);
    const x = 0.135 + 0.745 * u + 0.112 * (0.5 - v) + 0.02 * roll;
    const y = 0.218 + 0.52 * v - 0.127 * (u - 0.5) - 0.105 * roll * (0.65 + v * 0.42);
    const dx = x - pose.x,
      dy = y - pose.y;
    const distance = dx * dx * 11 + dy * dy * 4;
    const near = pose.lift / (1 + distance * distance * 22);
    const wave =
      pose.pulse > 0.002
        ? (pose.pulse * Math.sin(12 * distance - (1 - pose.pulse) * 8)) / (1 + distance * 5)
        : 0;
    return {
      x: (x + near * (0.095 * dx + 0.15 * (pose.x - pose.tailX)) + depth * 0.00095) * w,
      y:
        (y - near * (0.129 + 0.36 * (pose.y - pose.tailY)) + wave * 0.058 + depth * (0.006 + 0.006 * u)) *
        h,
    };
  };
}

const distanceToLine = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
};

export function sentenceAt(paper: Paper, w: number, h: number, x: number, y: number, pose: Pose) {
  const point = projection(w, h, pose);
  const p = { x: x * w, y: y * h };
  let distance = Math.max(11, h * 0.07) ** 2,
    selected = -1;
  for (const l of paper.lines) {
    const d = distanceToLine(p, point(l.u, l.v), point(l.end, l.v));
    if (d < distance) {
      distance = d;
      selected = l.sentence;
    }
  }
  return selected;
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

export function drawManuscript(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  paper: Paper,
  index: number,
  pose: Pose,
  color: Palette,
  plate: HTMLCanvasElement,
) {
  const at = projection(w, h, pose);
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

  // Release ink from the words immediately under the pointer. Its trailing
  // position lags the tip, giving a sweep and a tap different silhouettes.
  const energy = Math.max(pose.lift, pose.pulse);
  if (energy > 0.01) {
    ctx.fillStyle = color.light;
    for (const word of paper.words) {
      const p = at((word.u + word.end) / 2, word.v);
      const dx = p.x / w - pose.x,
        dy = p.y / h - pose.y;
      const influence = energy * Math.max(0, 1 - 11 * dx * dx - 5 * dy * dy);
      if (influence < 0.28) continue;
      for (let j = 0; j < 3; j++) {
        const seed = Math.sin(word.u * 471 + word.v * 173 + j * 37);
        const scatter = influence * influence;
        const x = p.x + (seed * 18 + (pose.x - pose.tailX) * w * 0.45) * scatter;
        const y = p.y - (3 + Math.abs(seed) * 27) * scatter;
        ctx.globalAlpha = scatter * (0.52 + 0.26 * Math.abs(seed));
        ctx.fillRect(x, y, 1.1, 1.1);
      }
    }
  }
  // A leader connects the selected passage to the edge, like an actual proof.
  const active = paper.lines.find((l) => l.sentence === index);
  if (active) {
    const p = at(active.u - 0.012, active.v);
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
  ctx.globalAlpha = 1;
}
