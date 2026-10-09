/**
 * The document's text animation, shared by the CSS document and the WebGL
 * hero document. It is a pure function of time, so there is no state to keep.
 *
 * One loop:
 *   1. WRITE - Greek letters, laid out like Python code, are typed one by one with human
 *              rhythm (uneven pace, hesitations, a pause at each line end)
 *              and a blinking cursor. Now and then the writer mistypes a few
 *              letters, stops, backspaces them and carries on.
 *      AGENT - a couple of rows behind the writer, an editing agent goes
 *              back over finished lines: it selects a span, deletes it and
 *              types a revision, which stays marked. Writer and agent work at
 *              the same time.
 *   2. SCAN  - a beam sweeps down the page; every glyph it crosses flickers
 *              and is re-rolled into a different Greek letter.
 *   3. HOLD  - the page stays Greek for a while, then clears and starts again
 *              with freshly generated Greek.
 *
 * Alongside the text it reports an attention weight per row (which rows the
 * model is "looking at": the line being written and the line being revised
 * weigh most), for the ML read-outs drawn beside the page.
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
  /** span the agent has selected, [start, end) in `text` */
  sel?: [number, number];
  /** span the agent has written, [start, end) in `text`: drawn as a revision */
  edit?: [number, number];
  /** column of the agent's caret in `text` */
  agent?: number;
}

/**
 * Where the loop is, read as a tiny ML pipeline: the text arrives and is
 * tokenised while an agent revises it (type), a window slides over it
 * extracting features (scan), the signals are weighed into an estimate
 * (hold), then the page clears.
 */
export type FramePhase = "type" | "scan" | "hold" | "clear";
export type AgentStep = "focus" | "select" | "delete" | "rewrite" | "done";

export interface Frame {
  rows: FrameRow[];
  /** beam position in row units (0 = above the first row, n+1 = below the last), or null */
  beam: number | null;
  phase: FramePhase;
  /** progress through the current phase, 0…1 */
  p: number;
  /** characters on the page so far (used for the token counter) */
  chars: number;
  /** what the agent is doing right now, if anything */
  agent: { row: number; step: AgentStep } | null;
  /** revisions the agent has finished in this loop */
  edits: number;
  /** attention weight per row, 0…1 (the strongest row is 1) */
  attn: number[];
}

interface TypeEvent {
  t: number;
  /** correct characters typed */
  k: number;
  /** mistyped characters showing after them */
  w: number;
}

interface Plan {
  row: number;
  a: number;
  b: number;
  t0: number;
  tSel: number;
  tDel: number;
  tRw: number;
  tDone: number;
  tEnd: number;
}

const REWRITE_CHAR = 0.055;

export function createAnimator(lines: string[]) {
  const n = lines.length;
  const evs: TypeEvent[][] = [];
  const rowStart: number[] = [];
  const rowEnd: number[] = [];

  let time = 0.7;
  lines.forEach((line, i) => {
    rowStart.push(time);
    const e: TypeEvent[] = [];
    if (!line) {
      time += 0.25;
    } else {
      // about half the longer lines get a typo: a few wrong letters, a pause, backspaces
      const typoAt = line.trim().length > 8 && h(i, 3, 1) < 0.5 ? Math.floor(line.length * (0.3 + h(i, 4, 1) * 0.4)) : -1;
      const typoLen = 2 + Math.floor(h(i, 5, 1) * 3);
      for (let j = 0; j < line.length; j++) {
        if (j === typoAt && line[j] !== " ") {
          for (let w = 1; w <= typoLen; w++) {
            time += 0.04 + h(i, w, 21) * 0.05;
            e.push({ t: time, k: j, w });
          }
          time += 0.3 + h(i, 6, 1) * 0.3; // notices
          for (let w = typoLen - 1; w >= 0; w--) {
            time += 0.06;
            e.push({ t: time, k: j, w });
          }
          time += 0.12;
        }
        let d = 0.03 + h(i, j, 5) * 0.06;
        if (line[j] === " ") d *= 0.5;
        if (h(i, j, 9) < 0.07) d += 0.35 + h(i, j, 11) * 0.35; // stops to think
        time += d;
        e.push({ t: time, k: j + 1, w: 0 });
      }
      time += 0.35 + h(i, 99, 3) * 0.35; // Enter
    }
    evs.push(e);
    rowEnd.push(time);
  });

  // The agent: a few finished lines, revised one after another, two rows behind the writer.
  const plans: Plan[] = [];
  let agentFree = 0;
  for (let i = 0; i < n && plans.length < 3; i++) {
    const line = lines[i];
    if (!line || line.trim().length < 10 || h(i, 7, 7) > 0.42) continue;
    const lead = line.length - line.trimStart().length;
    const avail = line.length - lead;
    const len = Math.min(avail - 1, 4 + Math.floor(h(i, 8, 8) * 5));
    const a = lead + Math.floor(h(i, 9, 9) * (avail - len));
    const t0 = Math.max(rowEnd[Math.min(i + 2, n - 1)], agentFree) + 0.25;
    const tSel = t0 + 0.4;
    const tDel = tSel + 0.6;
    const tRw = tDel + 0.25;
    const tDone = tRw + len * REWRITE_CHAR;
    const tEnd = tDone + 0.45;
    plans.push({ row: i, a, b: a + len, t0, tSel, tDel, tRw, tDone, tEnd });
    agentFree = tEnd;
  }
  const planOf = new Map(plans.map((p) => [p.row, p]));

  const typeEnd = Math.max(time, agentFree) + 0.2;
  const scanStart = typeEnd + 0.9;
  const scanEnd = scanStart + 3.8;
  const holdEnd = scanEnd + 4.5;
  const cycle = holdEnd + 0.8;

  /** The line as it stands once the agent has revised it (same length, new glyphs in the span). */
  const revised = (i: number, epoch: number, greekEpoch: number) => {
    const base = toGreek(lines[i], i, greekEpoch);
    const p = planOf.get(i);
    if (!p) return base;
    let span = "";
    for (let j = p.a; j < p.b; j++) span += lines[i][j] === " " ? " " : glyph(i + 60, j, epoch);
    return base.slice(0, p.a) + span + base.slice(p.b);
  };

  const attention = (t: number, focus: number[]): number[] => {
    const tick = Math.floor(t * 2.5);
    const w = lines.map((l, i) => (l ? 0.12 + 0.45 * h(i, tick, 31) : 0));
    focus.forEach((r, k) => {
      if (r >= 0 && r < n) {
        w[r] = Math.max(w[r], k === 0 ? 1 : 0.85);
        if (r > 0) w[r - 1] = Math.max(w[r - 1], 0.5);
        if (r < n - 1) w[r + 1] = Math.max(w[r + 1], 0.4);
      }
    });
    const m = Math.max(...w, 0.001);
    return w.map((x) => x / m);
  };

  return {
    n,
    cycle,
    /** a finished, fully Greek page, for the server render and reduced motion */
    staticRows(): FrameRow[] {
      return lines.map((l, i) => {
        const p = planOf.get(i);
        return { text: revised(i, 0, 0), noise: "", greek: true, edit: p ? [p.a, p.b] : undefined };
      });
    },
    frame(t: number): Frame {
      const epoch = Math.floor(t / cycle);
      const tt = t - epoch * cycle;
      const fr = Math.floor(t * 18);
      const ge = epoch * 2;

      if (tt >= holdEnd) {
        return {
          rows: lines.map(() => ({ text: "", noise: "", greek: false })),
          beam: null,
          phase: "clear",
          p: 0,
          chars: 0,
          agent: null,
          edits: 0,
          attn: lines.map(() => 0),
        };
      }

      const edits = plans.filter((p) => tt >= p.tDone).length;

      if (tt < typeEnd) {
        let active = lines.findIndex((_, i) => tt < rowEnd[i]);
        if (active < 0) active = n; // the writer is done; the agent may still be working
        let agent: Frame["agent"] = null;

        const rows = lines.map((line, i): FrameRow => {
          if (i > active || tt < rowStart[i]) return { text: "", noise: "", greek: false };
          const base = toGreek(line, i, ge);
          if (i === active) {
            // the writer's line: typed so far, plus any mistyped letters
            let ev: TypeEvent = { t: 0, k: 0, w: 0 };
            for (const e of evs[i]) {
              if (e.t > tt) break;
              ev = e;
            }
            let wrong = "";
            for (let w = 0; w < ev.w; w++) wrong += glyph(i + 40, ev.k + w, epoch + 3);
            const lastT = ev.t || rowStart[i];
            const solid = tt - lastT < 0.5; // cursor stays lit while typing
            const on = solid || Math.floor(tt * 2.2) % 2 === 0;
            return { text: base.slice(0, ev.k) + wrong, noise: line && on ? "▌" : "", greek: false };
          }
          const p = planOf.get(i);
          if (!p || tt < p.t0) return { text: base, noise: "", greek: false };
          const done = revised(i, epoch, ge);
          const span = done.slice(p.a, p.b);
          if (tt < p.tEnd) agent = { row: i, step: tt < p.tSel ? "focus" : tt < p.tDel ? "select" : tt < p.tRw ? "delete" : tt < p.tDone ? "rewrite" : "done" };
          if (tt < p.tSel) return { text: base, noise: "", greek: false, agent: p.a };
          if (tt < p.tDel) {
            const e = p.a + Math.round((p.b - p.a) * Math.min(1, (tt - p.tSel) / 0.45));
            return { text: base, noise: "", greek: false, sel: [p.a, e], agent: e };
          }
          if (tt < p.tRw) return { text: base.slice(0, p.a) + base.slice(p.b), noise: "", greek: false, agent: p.a };
          if (tt < p.tDone) {
            const m = Math.min(p.b - p.a, Math.floor((tt - p.tRw) / REWRITE_CHAR));
            return { text: base.slice(0, p.a) + span.slice(0, m) + base.slice(p.b), noise: "", greek: false, edit: [p.a, p.a + m], agent: p.a + m };
          }
          return { text: done, noise: "", greek: false, edit: [p.a, p.b], agent: tt < p.tEnd ? p.b : undefined };
        });
        let chars = 0;
        for (const r of rows) chars += r.text.length;
        const ag = agent as Frame["agent"];
        return { rows, beam: null, phase: "type", p: tt / typeEnd, chars, agent: ag, edits, attn: attention(t, [ag ? ag.row : -1, active]) };
      }

      const scanning = tt >= scanStart && tt < scanEnd;
      const p = Math.min(1, Math.max(0, (tt - scanStart) / (scanEnd - scanStart)));
      const pos = tt < scanStart ? -10 : tt >= scanEnd ? n + 10 : p * (n + 1);

      const rows = lines.map((line, i): FrameRow => {
        const pl = planOf.get(i);
        const edit: [number, number] | undefined = pl ? [pl.a, pl.b] : undefined;
        const d = pos - (i + 0.5);
        if (d < -0.8) return { text: revised(i, epoch, ge), noise: "", greek: false, edit };
        if (d <= 0.8) {
          let s = "";
          for (let j = 0; j < line.length; j++) s += line[j] === " " ? " " : glyph(i + 5, j, fr);
          return { text: "", noise: s, greek: true };
        }
        return { text: revised(i, epoch + 1000, ge + 1), noise: "", greek: true, edit };
      });
      const total = lines.reduce((a, l) => a + l.length, 0);
      const attn = attention(t, [scanning ? Math.min(n - 1, Math.max(0, Math.floor(pos - 0.5))) : -1]);
      if (tt < scanEnd) return { rows, beam: scanning ? pos : null, phase: "scan", p, chars: total, agent: null, edits, attn };
      return { rows, beam: null, phase: "hold", p: (tt - scanEnd) / (holdEnd - scanEnd), chars: total, agent: null, edits, attn };
    },
  };
}
