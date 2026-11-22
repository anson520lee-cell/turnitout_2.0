import type { Level } from "@/lib/auto-report/stitch";
import { lensSummary, type LensParagraph } from "./essay";

/**
 * The sheet the lens reads, laid out once in "sheet units" (CSS px at scale 1)
 * and painted into textures with Canvas 2D:
 * - human:   the essay as written (glass paper, ruled lines, serif text)
 * - machine: the same text as the detector reads it (risk bands, sentence
 *            numbers, paragraph rails, margin notes)
 * - refined: the Refine chapter (flagged sentences struck through, suggested
 *            rewrites in the margin)
 * All three share one layout, so swapping between them never moves a word.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PaperWord {
  t: string;
  x: number;
  w: number;
}

export interface PaperSeg {
  n: number;
  risk: Level;
  x0: number;
  x1: number;
  words: PaperWord[];
}

export interface PaperLine extends Rect {
  i: number;
  p: number;
  base: number;
  segs: PaperSeg[];
  /** The highest risk on the line. */
  risk: Level;
  /** Paragraph risk (for the report bars). */
  pRisk: Level;
  /** Where this line goes in the Report chapter: one slat of its paragraph's bar. */
  bar: Rect;
}

export interface PaperSentence {
  n: number;
  p: number;
  risk: Level;
  lines: number[];
  /** Start of the sentence (sheet units, on the baseline). */
  ax: number;
  ay: number;
  /** Middle of its first stretch of text. */
  cx: number;
  cy: number;
}

export interface PaperNote {
  n: number;
  risk: Level;
  y: number;
  h: number;
  /** Where the leader line leaves the text. */
  fromX: number;
  fromY: number;
}

export interface PaperBar {
  p: number;
  risk: Level;
  share: number;
  rect: Rect;
}

export interface PaperLayout {
  compact: boolean;
  w: number;
  h: number;
  textX: number;
  textW: number;
  notesX: number;
  notesW: number;
  header: number;
  lines: PaperLine[];
  sentences: Map<number, PaperSentence>;
  notes: PaperNote[];
  bars: PaperBar[];
  chart: Rect;
  font: number;
}

export interface PaperFonts {
  serif: string;
  sans: string;
  mono: string;
}

const RANK: Record<Level, number> = { low: 0, uncertain: 1, medium: 2, high: 3 };
export const riskWeight: Record<Level, number> = { high: 1, medium: 0.66, uncertain: 0.3, low: 0.1 };
/** Report chart colours (same as --color-chart-*). */
export const riskRGB: Record<Level, [number, number, number]> = {
  high: [63, 123, 255],
  medium: [141, 179, 255],
  uncertain: [141, 150, 172],
  low: [141, 150, 172],
};

function measureCtx() {
  const c = document.createElement("canvas");
  c.width = c.height = 4;
  return c.getContext("2d")!;
}

export function layoutPaper(paragraphs: LensParagraph[], fonts: PaperFonts, compact: boolean): PaperLayout {
  const ctx = measureCtx();
  const w = compact ? 560 : 900;
  const font = compact ? 21 : 20;
  const lh = compact ? 37 : 36;
  const pgap = compact ? 16 : 18;
  const header = compact ? 70 : 76;
  const textX = compact ? 46 : 88;
  const notesW = compact ? 0 : 196;
  const notesX = compact ? w : w - 34 - notesW;
  const textW = compact ? w - textX - 34 : notesX - 28 - textX;
  ctx.font = `${font}px ${fonts.serif}`;
  const space = ctx.measureText(" ").width;
  const widths = new Map<string, number>();
  const wd = (t: string) => {
    let v = widths.get(t);
    if (v === undefined) {
      v = ctx.measureText(t).width;
      widths.set(t, v);
    }
    return v;
  };

  const lines: PaperLine[] = [];
  const sentences = new Map<number, PaperSentence>();
  let y = header + (compact ? 26 : 30);
  for (const para of paragraphs) {
    let x = textX;
    let line: PaperLine | null = null;
    const newLine = () => {
      line = { i: lines.length, p: para.p, x0: textX, x1: textX, y0: y, y1: y + lh, base: y + Math.round(lh * 0.66), segs: [], risk: "low", pRisk: para.risk, bar: { x0: 0, y0: 0, x1: 0, y1: 0 } };
      lines.push(line);
      x = textX;
      y += lh;
    };
    newLine();
    for (const s of para.sentences) {
      const words = s.text.split(/\s+/).filter(Boolean);
      let seg: PaperSeg | null = null;
      for (const word of words) {
        const ww = wd(word);
        if (x > textX && x + ww > textX + textW) {
          newLine();
          seg = null;
        }
        const l = line as unknown as PaperLine;
        if (!seg) {
          seg = { n: s.n, risk: s.risk, x0: x, x1: x, words: [] };
          l.segs.push(seg);
          if (RANK[s.risk] > RANK[l.risk]) l.risk = s.risk;
        }
        seg.words.push({ t: word, x, w: ww });
        seg.x1 = x + ww;
        l.x1 = Math.max(l.x1, x + ww);
        x += ww + space;
        let info = sentences.get(s.n);
        if (!info) {
          info = { n: s.n, p: para.p, risk: s.risk, lines: [], ax: seg.x0, ay: l.base, cx: 0, cy: 0 };
          sentences.set(s.n, info);
        }
        if (!info.lines.includes(l.i)) info.lines.push(l.i);
      }
    }
    y += pgap;
  }
  const textBottom = lines[lines.length - 1].y1;
  const h = Math.ceil(textBottom + (compact ? 64 : 74));

  // middle of each sentence's first stretch of text
  for (const s of sentences.values()) {
    const l = lines[s.lines[0]];
    const seg = l.segs.find((g) => g.n === s.n)!;
    s.cx = (seg.x0 + seg.x1) / 2;
    s.cy = (l.y0 + l.y1) / 2;
  }

  // margin notes for marked sentences, stacked so they never overlap
  const notes: PaperNote[] = [];
  if (!compact) {
    let next = header + 20;
    for (const para of paragraphs) {
      for (const s of para.sentences) {
        if (s.risk === "low") continue;
        const info = sentences.get(s.n)!;
        const first = lines[info.lines[0]];
        const nh = s.rewrite ? 76 : 44;
        const ny = Math.max(first.y0 + 2, next);
        const last = lines[info.lines[info.lines.length - 1]];
        const lastSeg = last.segs.filter((g) => g.n === s.n).pop()!;
        notes.push({ n: s.n, risk: s.risk, y: ny, h: nh, fromX: lastSeg.x1 + 5, fromY: (last.y0 + last.y1) / 2 });
        next = ny + nh + 8;
      }
    }
  }

  // Report chapter: each paragraph becomes one bar, made of its own lines as slats
  const chartH = compact ? 230 : 300;
  const chartBase = header + 70 + chartH;
  const barW = compact ? 64 : 78;
  const gap = compact ? 34 : 54;
  const total = paragraphs.length * barW + (paragraphs.length - 1) * gap;
  const chartX = textX + (textW - total) / 2;
  const bars: PaperBar[] = paragraphs.map((para, k) => {
    const share = para.sentences.filter((s) => s.risk === "high" || s.risk === "medium").length / para.sentences.length;
    const bh = Math.max(10, chartH * share);
    const x0 = chartX + k * (barW + gap);
    return { p: para.p, risk: para.risk, share: Math.round(share * 100), rect: { x0, y0: chartBase - bh, x1: x0 + barW, y1: chartBase } };
  });
  for (const bar of bars) {
    const own = lines.filter((l) => l.p === bar.p);
    const n = own.length;
    const bh = bar.rect.y1 - bar.rect.y0;
    const slat = bh / n;
    own.forEach((l, k) => {
      const y1 = bar.rect.y1 - k * slat;
      l.bar = { x0: bar.rect.x0, y0: y1 - slat + Math.min(2, slat * 0.25), x1: bar.rect.x1, y1 };
    });
  }

  return {
    compact,
    w,
    h,
    textX,
    textW,
    notesX,
    notesW,
    header,
    lines,
    sentences,
    notes,
    bars,
    chart: { x0: chartX, y0: chartBase - chartH, x1: chartX + total, y1: chartBase },
    font,
  };
}

/* ------------------------------------------------------------------ painting */

type Variant = "human" | "machine" | "refined";

function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, track: number, align: "left" | "right" = "left") {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + track;
  width -= track;
  let cx = align === "right" ? x - width : x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
  return width;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > width && cur) {
      out.push(cur);
      cur = word;
      if (out.length === max) break;
    } else cur = next;
  }
  if (out.length < max && cur) out.push(cur);
  if (out.length === max && words.join(" ").length > out.join(" ").length) {
    let last = out[max - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    out[max - 1] = `${last.replace(/[\s,;:.]+$/, "")}…`;
  }
  return out;
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** The glass the essay is written on: shared by every variant. Mirrored in the shaders' slot colour. */
export const GLASS_TOP: [number, number, number, number] = [19, 26, 52, 0.9];
export const GLASS_BOTTOM: [number, number, number, number] = [8, 11, 24, 0.93];

export function paintPaper(layout: PaperLayout, paragraphs: LensParagraph[], fonts: PaperFonts, variant: Variant, k: number) {
  const { w, h, compact } = layout;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(k, k);
  ctx.textBaseline = "alphabetic";
  const byN = new Map(paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s]));
  const machine = variant !== "human";

  // glass
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(${GLASS_TOP.join(",")})`);
  g.addColorStop(1, `rgba(${GLASS_BOTTOM.join(",")})`);
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 20);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(160,176,255,0.26)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // light along the top edge
  const top = ctx.createLinearGradient(0, 0, w, 0);
  top.addColorStop(0, "rgba(255,255,255,0)");
  top.addColorStop(0.35, "rgba(220,230,255,0.28)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = top;
  ctx.fillRect(22, 1, w - 44, 1);

  // header
  const ruleY = layout.header - 18;
  ctx.fillStyle = "rgba(148,163,255,0.16)";
  ctx.fillRect(24, ruleY, w - 48, 1);
  ctx.font = `500 ${compact ? 12 : 11}px ${fonts.mono}`;
  const headY = ruleY - 16;
  if (!machine) {
    ctx.fillStyle = "rgba(154,163,184,0.95)";
    tracked(ctx, compact ? "SAMPLE ESSAY" : "SAMPLE ESSAY · SOCIOLOGY, FINAL DRAFT", 28, headY, 1.6);
    ctx.fillStyle = "rgba(138,146,174,0.85)";
    tracked(ctx, `${lensSummary.words} WORDS · ${lensSummary.sentences} SENTENCES`, w - 28, headY, 1.6, "right");
  } else if (variant === "machine") {
    ctx.fillStyle = "rgba(141,179,255,1)";
    tracked(ctx, compact ? "DETECTOR VIEW" : "DETECTOR VIEW · SENTENCE BY SENTENCE", 28, headY, 1.6);
    ctx.fillStyle = "rgba(233,237,247,0.95)";
    tracked(ctx, `${lensSummary.flagged} OF ${lensSummary.sentences} FLAGGED · ${lensSummary.flaggedPct}%`, w - 28, headY, 1.6, "right");
  } else {
    ctx.fillStyle = "rgba(141,179,255,1)";
    tracked(ctx, compact ? "WRITING REFINEMENT" : "WRITING REFINEMENT · EXAMPLE", 28, headY, 1.6);
    ctx.fillStyle = "rgba(233,237,247,0.95)";
    tracked(ctx, compact ? "YOU CHOOSE" : "SUGGESTIONS · YOU CHOOSE", w - 28, headY, 1.6, "right");
  }

  // margin rule
  const ruleX = layout.textX - (compact ? 18 : 30);
  ctx.fillStyle = machine ? "rgba(91,140,255,0.34)" : "rgba(91,140,255,0.2)";
  ctx.fillRect(ruleX, ruleY + 1, 1, h - ruleY - 40);

  // ruled lines and paragraph marks
  for (const l of layout.lines) {
    ctx.fillStyle = "rgba(148,163,255,0.075)";
    ctx.fillRect(layout.textX - 10, l.base + 9, (compact ? w - 24 : layout.notesX - 12) - (layout.textX - 10), 1);
  }
  ctx.font = `${compact ? 11 : 10.5}px ${fonts.mono}`;
  for (const para of paragraphs) {
    const first = layout.lines.find((l) => l.p === para.p)!;
    ctx.fillStyle = machine ? "rgba(141,179,255,0.85)" : "rgba(138,146,174,0.55)";
    tracked(ctx, `P${para.p}`, ruleX - (compact ? 8 : 12), first.base, 0.6, "right");
  }

  // paragraph rails (machine)
  if (machine) {
    for (const para of paragraphs) {
      const own = layout.lines.filter((l) => l.p === para.p);
      const c = variant === "refined" && para.risk !== "low" ? riskRGB.uncertain : riskRGB[para.risk];
      ctx.fillStyle = rgba(c, para.risk === "low" ? 0.45 : 0.9);
      roundRect(ctx, ruleX + 3, own[0].y0 + 6, 3, own[own.length - 1].y1 - own[0].y0 - 12, 1.5);
      ctx.fill();
    }
  }

  // bands under marked sentences (machine / refined)
  if (machine) {
    for (const l of layout.lines) {
      for (const seg of l.segs) {
        const top = l.y0 + 6;
        const bot = l.y1 - 5;
        const x0 = seg.x0 - 4;
        const x1 = seg.x1 + 4;
        if (variant === "refined") {
          if (seg.risk === "high" || seg.risk === "medium" || seg.risk === "uncertain") {
            ctx.fillStyle = "rgba(141,150,172,0.1)";
            roundRect(ctx, x0, top, x1 - x0, bot - top, 4);
            ctx.fill();
          }
          continue;
        }
        if (seg.risk === "high") {
          ctx.fillStyle = "rgba(63,123,255,0.3)";
          roundRect(ctx, x0, top, x1 - x0, bot - top, 4);
          ctx.fill();
          ctx.fillStyle = "rgba(91,140,255,1)";
          ctx.fillRect(x0 + 2, bot - 1.5, x1 - x0 - 4, 1.5);
        } else if (seg.risk === "medium") {
          ctx.fillStyle = "rgba(141,179,255,0.15)";
          roundRect(ctx, x0, top, x1 - x0, bot - top, 4);
          ctx.fill();
          ctx.fillStyle = "rgba(141,179,255,0.9)";
          ctx.fillRect(x0 + 2, bot - 1, x1 - x0 - 4, 1);
        } else if (seg.risk === "uncertain") {
          ctx.fillStyle = "rgba(170,180,206,0.75)";
          for (let x = x0 + 2; x < x1 - 2; x += 4) ctx.fillRect(x, bot - 1, 2, 1);
        }
        // word ticks: where the reader split the sentence
        if (seg.risk === "high" || seg.risk === "medium") {
          ctx.fillStyle = seg.risk === "high" ? "rgba(141,179,255,0.6)" : "rgba(141,179,255,0.4)";
          for (const word of seg.words) ctx.fillRect(Math.round(word.x) - 2, bot + 2, 1, 3);
        }
      }
    }
  }

  // text
  ctx.font = `${layout.font}px ${fonts.serif}`;
  for (const l of layout.lines) {
    for (const seg of l.segs) {
      if (!machine) ctx.fillStyle = "rgba(214,220,236,0.94)";
      else if (variant === "refined") ctx.fillStyle = seg.risk === "low" ? "rgba(176,184,204,0.9)" : "rgba(138,146,174,0.75)";
      else ctx.fillStyle = seg.risk === "high" || seg.risk === "medium" ? "rgba(255,255,255,1)" : seg.risk === "uncertain" ? "rgba(225,231,246,0.95)" : "rgba(128,137,163,0.92)";
      for (const word of seg.words) ctx.fillText(word.t, word.x, l.base);
      if (variant === "refined" && seg.risk !== "low") {
        // struck through: the suggestion replaces it
        ctx.fillStyle = "rgba(141,179,255,0.7)";
        ctx.fillRect(seg.x0, l.base - layout.font * 0.3, seg.x1 - seg.x0, 1);
      }
    }
  }

  // sentence numbers (machine): a hairline tick and the number at each sentence start
  if (machine) {
    ctx.font = `500 ${compact ? 10.5 : 9.5}px ${fonts.mono}`;
    for (const s of layout.sentences.values()) {
      const l = layout.lines[s.lines[0]];
      const seg = l.segs.find((g) => g.n === s.n)!;
      const flagged = s.risk === "high" || s.risk === "medium";
      ctx.fillStyle = variant === "refined" ? "rgba(141,150,172,0.8)" : flagged ? "rgba(141,179,255,1)" : "rgba(138,146,174,0.7)";
      ctx.fillRect(seg.x0 - 4, l.y0 - 1, 1, 9);
      ctx.fillText(String(s.n).padStart(2, "0"), seg.x0 - 1, l.y0 + 6);
    }
  }

  // margin notes (machine: why; refined: the suggested rewrite)
  if (machine && !compact) {
    for (const note of layout.notes) {
      const s = byN.get(note.n)!;
      const c = variant === "refined" ? ([141, 179, 255] as [number, number, number]) : note.risk === "uncertain" ? riskRGB.uncertain : riskRGB.medium;
      // leader
      ctx.strokeStyle = rgba(c, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(note.fromX, note.fromY);
      const midX = layout.notesX - 14;
      ctx.lineTo(midX, note.fromY);
      ctx.lineTo(midX + 8, note.y + 6);
      ctx.lineTo(layout.notesX - 2, note.y + 6);
      ctx.stroke();
      ctx.fillStyle = rgba(c, 0.9);
      ctx.beginPath();
      ctx.arc(note.fromX, note.fromY, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // label
      ctx.font = `500 10px ${fonts.mono}`;
      ctx.fillStyle = variant === "refined" ? "rgba(141,179,255,1)" : note.risk === "high" ? "rgba(126,164,255,1)" : note.risk === "medium" ? "rgba(141,179,255,1)" : "rgba(170,178,200,1)";
      const label = variant === "refined" ? `S${String(note.n).padStart(2, "0")} · SUGGESTED` : `S${String(note.n).padStart(2, "0")} · ${note.risk.toUpperCase()}`;
      tracked(ctx, label, layout.notesX, note.y + 10, 1.1);
      if (variant === "refined") {
        ctx.font = `italic 11.5px ${fonts.serif}`;
        ctx.fillStyle = "rgba(220,230,255,0.95)";
        wrap(ctx, s.rewrite ?? "", layout.notesW, 4).forEach((t, k) => ctx.fillText(t, layout.notesX, note.y + 27 + k * 14.5));
      } else {
        ctx.font = `11px ${fonts.sans}`;
        ctx.fillStyle = "rgba(154,163,184,0.95)";
        const why = (s.why ?? "").replace(/^Signals? [\d, ]+:\s*/, "");
        wrap(ctx, why, layout.notesW, 2).forEach((t, k) => ctx.fillText(t, layout.notesX, note.y + 26 + k * 14));
      }
    }
  }

  // footer
  const fy = h - 26;
  ctx.fillStyle = "rgba(148,163,255,0.12)";
  ctx.fillRect(24, fy - 16, w - 48, 1);
  ctx.font = `${compact ? 11 : 10.5}px ${fonts.mono}`;
  ctx.fillStyle = "rgba(138,146,174,0.75)";
  tracked(ctx, "EXAMPLE DATA", 28, fy, 1.4);
  tracked(ctx, machine ? "0% · AI-WRITING RISK" : `${lensSummary.paragraphs} PARAGRAPHS`, w - 28, fy, 1.4, "right");

  return canvas;
}

/** Which line each row of the sheet belongs to (the nearest one), for the slot shader. */
export function lineIndexRows(layout: PaperLayout) {
  const rows = new Uint8Array(Math.ceil(layout.h));
  for (let y = 0; y < rows.length; y++) {
    let best = 0;
    let bd = Infinity;
    for (const l of layout.lines) {
      const d = y < l.y0 ? l.y0 - y : y > l.y1 ? y - l.y1 : 0;
      if (d < bd) {
        bd = d;
        best = l.i;
      }
    }
    rows[y] = best;
  }
  return rows;
}
