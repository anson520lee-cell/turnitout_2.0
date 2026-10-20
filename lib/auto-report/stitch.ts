/**
 * Turns the reviewer's answers for each piece of a text into one report for the
 * whole text. Pure functions, no I/O, so they can be tested.
 *
 * Each piece was reviewed on its own, so its "P2 S3" labels count from the
 * start of the piece. Here they are mapped back to the sentence's place in the
 * whole text, and the sentences are grouped by the paragraphs of the whole text.
 */

import { chunkText, type Chunk } from "@/lib/chunking";
import { parseReport, type Risk } from "@/lib/report-format";
import { splitSentences } from "@/lib/recheck";

export type Level = "high" | "medium" | "uncertain" | "low";
export type Overall = "low" | "moderate" | "elevated";

export interface ReportSentence {
  /** 1-based place in the whole text. */
  n: number;
  text: string;
  risk: Level;
  /** Why the reviewer flagged it (signals), when it did. */
  why?: string;
  /** The question to ask yourself, when the reviewer gave one. */
  ask?: string;
}

export interface ReportParagraph {
  /** 1-based paragraph of the whole text. */
  p: number;
  /** The reviewer's rating of the paragraph; derived from its sentences when it gave none. */
  risk: Level;
  note?: string;
  sentences: ReportSentence[];
}

export interface GrammarNote {
  n: number;
  text: string;
  issue: string;
}

export interface AutoReportSummary {
  words: number;
  sentences: number;
  paragraphs: number;
  high: number;
  medium: number;
  uncertain: number;
  /** High + Medium sentences as a share of all sentences, 0 to 1. */
  flaggedShare: number;
  /** Paragraphs rated High or Medium. */
  riskyParagraphs: number;
  overall: Overall;
}

export interface AutoReportResult {
  version: 1;
  pieces: { total: number; reviewed: number };
  summary: AutoReportSummary;
  paragraphs: ReportParagraph[];
  grammar: GrammarNote[];
}

export interface PieceAnswer {
  idx: number;
  report: string;
  ok: boolean;
  truncated: boolean;
}

/**
 * The base size a text is cut into (characters). 3,000 to 4,000 separated AI text from human text best in
 * testing, and Jordan fixed 3,500 as the standing setting (2026-10-20). A text only slightly over (for example
 * 3,600) stays one piece: chunkText lets a piece grow to 1.25 times this size and joins a short tail.
 */
export const PIECE_SIZE = 3500;

/**
 * The headline AI score (0 to 1) from the share of sentences flagged. Jordan asked (2026-10-20) for a figure that
 * leans to 0% or 100% instead of sitting in the middle: an S-curve centred on half of the sentences flagged pulls a
 * share below it toward 0 and one above it toward 100, stretched so 0 stays 0 and 1 stays 1. It keeps the order of
 * texts. On the backtest samples (pieces of 3,000) human texts at 13 to 48% flagged score 1 to 44, and AI texts at
 * 55% and over score 65 and over. The centre is half, not higher, because AI texts flagged at 55 to 68% would
 * otherwise be pulled down.
 */
export const SCORE_CURVE = { centre: 0.5, steepness: 12 } as const;

const curve = (x: number) => 1 / (1 + Math.exp(-SCORE_CURVE.steepness * (x - SCORE_CURVE.centre)));

export function aiScore(flaggedShare: number): number {
  const x = Math.min(1, Math.max(0, flaggedShare));
  return (curve(x) - curve(0)) / (curve(1) - curve(0));
}

/**
 * Overall bands on the AI score scale, so the colour always matches the number shown: under 30 Low (green), 30 to
 * 59 Moderate (yellow), 60 and over Elevated (red) (Jordan, 2026-10-20). In flagged-sentence terms that is about
 * 43% and 53%. On the backtest samples 20 of 21 AI texts are Elevated (as with the old 35% / 50% lines) and 10 of
 * 20 human texts are Low (was 7). Guidance only; never a percentage chance.
 */
export const SCORE_BANDS = { moderate: 0.3, elevated: 0.6 } as const;

export function overallFor(flaggedShare: number): Overall {
  const score = aiScore(flaggedShare);
  if (score >= SCORE_BANDS.elevated) return "elevated";
  if (score >= SCORE_BANDS.moderate) return "moderate";
  return "low";
}

const toLevel = (r: Risk | undefined): Level => (r === "high" || r === "medium" || r === "uncertain" ? r : "low");
const RANK: Record<Level, number> = { low: 0, uncertain: 1, medium: 2, high: 3 };

const LOCATION = /^P(\d+)\s*S(\d+)\b/i;
const PARAGRAPH = /^P(\d+)\s*:/i;
const GRAMMAR = /^P(\d+)\s*S(\d+)\s*[:：]\s*(.+)$/i;

interface SentenceRead {
  risk: Level;
  why?: string;
  ask?: string;
}

interface PieceRead {
  sentences: Map<number, SentenceRead>;
  paragraphs: Map<number, { risk: Level; note?: string }>;
  grammar: { n: number; issue: string }[];
}

/** Reads one piece's answer. Labels are mapped to whole-text sentence numbers (1-based) through the piece's own sentence list. */
function readPiece(report: string, chunk: Chunk): PieceRead | null {
  const local = splitSentences(chunk.text);
  if (local.length !== chunk.count) return null;
  const at = new Map(local.map((s, i) => [`${s.p}:${s.s}`, chunk.first + i + 1]));
  const out: PieceRead = { sentences: new Map(), paragraphs: new Map(), grammar: [] };
  // Paragraph ratings are per piece paragraph; map them to the whole-text paragraph through a sentence of it.
  let inGrammar = false;
  for (const b of parseReport(report)) {
    if (b.kind === "section") {
      inGrammar = /grammar/i.test(b.title);
      continue;
    }
    if (inGrammar) {
      const g = GRAMMAR.exec(b.text);
      const n = g && at.get(`${Number(g[1])}:${Number(g[2])}`);
      if (g && n) out.grammar.push({ n, issue: g[3].trim() });
      continue;
    }
    const sentence = LOCATION.exec(b.location ?? b.text);
    if (sentence && b.risk) {
      const n = at.get(`${Number(sentence[1])}:${Number(sentence[2])}`);
      if (n) out.sentences.set(n, { risk: toLevel(b.risk), why: b.notes?.join(" · ") || undefined, ask: b.question || undefined });
      continue;
    }
    const para = PARAGRAPH.exec(b.location ?? b.text);
    if (para && b.risk) {
      const first = local.find((s) => s.p === Number(para[1]));
      const n = first && at.get(`${first.p}:${first.s}`);
      if (n) out.paragraphs.set(n, { risk: toLevel(b.risk), note: b.notes?.join(" ") || undefined });
    }
  }
  return out;
}

function derivedParagraphRisk(sentences: ReportSentence[]): Level {
  // The reviewer's own rule: three high/medium sentences in a row is High, two in a row is Medium.
  let run = 0;
  let best = 0;
  for (const s of sentences) {
    run = s.risk === "high" || s.risk === "medium" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best >= 3 ? "high" : best === 2 ? "medium" : "low";
}

/**
 * Builds the whole-text report. `answers` are the pieces that were reviewed
 * (a missing or failed piece is simply not covered, and the counts say so).
 */
export function stitchReport(text: string, answers: PieceAnswer[], size = PIECE_SIZE): AutoReportResult {
  const all = splitSentences(text);
  const chunks = chunkText(text, size);
  const bySentence = new Map<number, SentenceRead>();
  const paraNote = new Map<number, { risk: Level; note?: string }>();
  const grammar: GrammarNote[] = [];
  let reviewed = 0;
  const covered = new Set<number>();

  for (const a of answers) {
    const chunk = chunks[a.idx];
    if (!chunk || !a.ok || a.truncated) continue;
    const read = readPiece(a.report, chunk);
    if (!read) continue;
    reviewed += 1;
    for (let i = 0; i < chunk.count; i++) covered.add(chunk.first + i + 1);
    for (const [n, v] of read.sentences) bySentence.set(n, v);
    for (const [n, v] of read.paragraphs) paraNote.set(all[n - 1].p, v);
    for (const g of read.grammar) grammar.push({ n: g.n, text: all[g.n - 1].text, issue: g.issue });
  }

  const paragraphs: ReportParagraph[] = [];
  for (const [i, s] of all.entries()) {
    const n = i + 1;
    let para = paragraphs[paragraphs.length - 1];
    if (!para || para.p !== s.p) {
      para = { p: s.p, risk: "low", sentences: [] };
      paragraphs.push(para);
    }
    const hit = bySentence.get(n);
    para.sentences.push({ n, text: s.text, risk: hit?.risk ?? "low", ...(hit?.why ? { why: hit.why } : {}), ...(hit?.ask ? { ask: hit.ask } : {}) });
  }
  for (const para of paragraphs) {
    const given = paraNote.get(para.p);
    const derived = derivedParagraphRisk(para.sentences);
    // Take the stricter of the reviewer's rating and the sentence rule, so a paragraph never looks safer than its sentences.
    const risk = given && RANK[given.risk] > RANK[derived] ? given.risk : derived;
    para.risk = risk;
    if (given?.note) para.note = given.note;
  }

  const count = (r: Level) => all.filter((_, i) => bySentence.get(i + 1)?.risk === r && covered.has(i + 1)).length;
  const high = count("high");
  const medium = count("medium");
  const reviewedSentences = covered.size;
  const flaggedShare = reviewedSentences ? (high + medium) / reviewedSentences : 0;
  return {
    version: 1,
    pieces: { total: chunks.length, reviewed },
    summary: {
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      sentences: all.length,
      paragraphs: paragraphs.length,
      high,
      medium,
      uncertain: count("uncertain"),
      flaggedShare,
      riskyParagraphs: paragraphs.filter((p) => p.risk === "high" || p.risk === "medium").length,
      overall: overallFor(flaggedShare),
    },
    paragraphs,
    grammar: grammar.sort((a, b) => a.n - b.n),
  };
}
