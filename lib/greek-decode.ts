/**
 * The document's text animation, shared by the CSS document and the WebGL
 * hero document. It is a pure function of time, so there is no state to keep.
 *
 * One loop:
 *   1. TYPE  - Greek letters, laid out like Python code, are typed one by one with human
 *              rhythm (uneven pace, hesitations, a pause at each line end)
 *              and a blinking cursor.
 *   2. SCAN  - a beam sweeps down the page; every glyph it crosses flickers
 *              and is re-rolled into a different Greek letter.
 *   3. HOLD  - the page stays Greek for a while, then clears and starts again
 *              with freshly generated Greek.
 */

const GLYPHS = "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΘΛΞΠΣΦΨΩ";

export const CODE = [
  "import numpy as np",
  "from engine import scan",
  "",
  "def analyse(text):",
  "    tokens = tokenize(text)",
  "    score = 0.0",
  "    for t in tokens:",
  "        score += weight(t)",
  "",
  "    if score > LIMIT:",
  "        flag(text)",
  "    return round(score, 2)",
  "result = analyse(doc)",
  "print(result)",
  "assert result < 1",
  "# similarity: 0%",
];

/** Small integer hash -> [0, 1). */
function h(a: number, b: number, c: number): number {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function glyph(a: number, b: number, c: number): string {
  return GLYPHS[Math.floor(h(a, b, c) * GLYPHS.length)];
}

function toGreek(line: string, row: number, epoch: number): string {
  let s = "";
  for (let j = 0; j < line.length; j++) s += line[j] === " " ? " " : glyph(row, j, epoch);
  return s;
}

export interface FrameRow {
  /** settled text: code, or Greek once the beam has passed */
  text: string;
  /** tail drawn in the accent colour: the cursor, or glyphs under the beam */
  noise: string;
  /** true once the row has been converted */
  greek: boolean;
}

/**
 * Where the loop is, read as a tiny ML pipeline: the text arrives and is
 * tokenised (type), a window slides over it extracting features (scan), the
 * signals are weighed into an estimate (hold), then the page clears.
 */
export type FramePhase = "type" | "scan" | "hold" | "clear";

export interface Frame {
  rows: FrameRow[];
  /** beam position in row units (0 = above the first row, n+1 = below the last), or null */
  beam: number | null;
  phase: FramePhase;
  /** progress through the current phase, 0…1 */
  p: number;
  /** characters on the page so far (used for the token counter) */
  chars: number;
}

export function createAnimator(lines: string[]) {
  const n = lines.length;
  const ct: number[][] = [];
  const rowStart: number[] = [];
  const rowEnd: number[] = [];

  let time = 0.7;
  lines.forEach((line, i) => {
    rowStart.push(time);
    const times: number[] = [];
    if (!line) {
      time += 0.25;
    } else {
      for (let j = 0; j < line.length; j++) {
        let d = 0.03 + h(i, j, 5) * 0.06;
        if (line[j] === " ") d *= 0.5;
        if (h(i, j, 9) < 0.07) d += 0.35 + h(i, j, 11) * 0.35; // stops to think
        time += d;
        times.push(time);
      }
      time += 0.35 + h(i, 99, 3) * 0.35; // Enter
    }
    ct.push(times);
    rowEnd.push(time);
  });

  const typeEnd = time;
  const scanStart = typeEnd + 0.9;
  const scanEnd = scanStart + 3.8;
  const holdEnd = scanEnd + 4.5;
  const cycle = holdEnd + 0.8;

  return {
    n,
    cycle,
    /** a finished, fully Greek page, for the server render and reduced motion */
    staticRows(): FrameRow[] {
      return lines.map((l, i) => ({ text: toGreek(l, i, 0), noise: "", greek: true }));
    },
    frame(t: number): Frame {
      const epoch = Math.floor(t / cycle);
      const tt = t - epoch * cycle;
      const fr = Math.floor(t * 18);

      if (tt >= holdEnd) {
        return { rows: lines.map(() => ({ text: "", noise: "", greek: false })), beam: null, phase: "clear", p: 0, chars: 0 };
      }

      if (tt < typeEnd) {
        let active = lines.findIndex((_, i) => tt < rowEnd[i]);
        if (active < 0) active = n - 1;
        const rows = lines.map((line, i): FrameRow => {
          if (i > active || tt < rowStart[i]) return { text: "", noise: "", greek: false };
          if (i < active) return { text: toGreek(line, i, epoch * 2), noise: "", greek: false };
          let k = 0;
          while (k < ct[i].length && ct[i][k] <= tt) k++;
          const lastT = k > 0 ? ct[i][k - 1] : rowStart[i];
          const solid = tt - lastT < 0.5; // cursor stays lit while typing
          const on = solid || Math.floor(tt * 2.2) % 2 === 0;
          return { text: toGreek(line, i, epoch * 2).slice(0, k), noise: line && on ? "▌" : "", greek: false };
        });
        let chars = 0;
        for (const r of rows) chars += r.text.length;
        return { rows, beam: null, phase: "type", p: tt / typeEnd, chars };
      }

      const scanning = tt >= scanStart && tt < scanEnd;
      const p = Math.min(1, Math.max(0, (tt - scanStart) / (scanEnd - scanStart)));
      const pos = tt < scanStart ? -10 : tt >= scanEnd ? n + 10 : p * (n + 1);

      const rows = lines.map((line, i): FrameRow => {
        const d = pos - (i + 0.5);
        if (d < -0.8) return { text: toGreek(line, i, epoch * 2), noise: "", greek: false };
        if (d <= 0.8) {
          let s = "";
          for (let j = 0; j < line.length; j++) s += line[j] === " " ? " " : glyph(i + 5, j, fr);
          return { text: "", noise: s, greek: true };
        }
        return { text: toGreek(line, i, epoch * 2 + 1), noise: "", greek: true };
      });
      const total = lines.reduce((a, l) => a + l.length, 0);
      if (tt < scanEnd) return { rows, beam: scanning ? pos : null, phase: "scan", p, chars: total };
      return { rows, beam: null, phase: "hold", p: (tt - scanEnd) / (holdEnd - scanEnd), chars: total };
    },
  };
}
