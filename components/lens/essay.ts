import { sampleReport } from "@/lib/auto-report/sample";
import type { Level } from "@/lib/auto-report/stitch";

/**
 * The essay the lens reads: the same made-up sample as /sample-report, so the
 * sentence a visitor opens on the home page is the one they land on in the
 * report. The suggested rewrites are examples for the Refine chapter only.
 */

export interface LensSentence {
  n: number;
  text: string;
  risk: Level;
  /** Paragraph, 1-based. */
  p: number;
  why?: string;
  ask?: string;
  /** Example rewrite for a flagged sentence (Refine chapter). */
  rewrite?: string;
}

export interface LensParagraph {
  p: number;
  risk: Level;
  /** Share of the paragraph's sentences rated High or Medium, 0…100. */
  share: number;
  sentences: LensSentence[];
}

const REWRITES: Record<number, string> = {
  1: "For most of the last century, the people who planned my city mostly asked how fast you could cross it.",
  2: "Transport ministers like faster trips because they are supposed to help the economy.",
  3: "But a fast train does not help much if the things you need are still far from the station.",
  7: "So I now judge a city by what I can reach on foot, not by how fast I can leave it.",
  10: "They can put homes, shops and offices close together, so trips get shorter before anyone builds a road.",
  12: "They can also give some street space back to people on foot.",
};

const flagged = (r: Level) => r === "high" || r === "medium";

export const lensParagraphs: LensParagraph[] = sampleReport.paragraphs.map((para) => ({
  p: para.p,
  risk: para.risk,
  share: Math.round((para.sentences.filter((s) => flagged(s.risk)).length / para.sentences.length) * 100),
  sentences: para.sentences.map((s) => ({
    n: s.n,
    text: s.text,
    risk: s.risk,
    p: para.p,
    ...(s.why ? { why: s.why } : {}),
    ...(s.ask ? { ask: s.ask } : {}),
    ...(REWRITES[s.n] ? { rewrite: REWRITES[s.n] } : {}),
  })),
}));

export const lensSentences: LensSentence[] = lensParagraphs.flatMap((p) => p.sentences);

export const lensSummary = {
  title: "Sociology essay, final draft",
  words: sampleReport.summary.words,
  sentences: sampleReport.summary.sentences,
  paragraphs: sampleReport.summary.paragraphs,
  flagged: sampleReport.summary.high + sampleReport.summary.medium,
  flaggedPct: Math.round(sampleReport.summary.flaggedShare * 100),
  characters: lensSentences.reduce((n, s) => n + s.text.length + 1, 0) + lensParagraphs.length - 1,
};

export const levelLabel: Record<Level, string> = { high: "High", medium: "Medium", uncertain: "Uncertain", low: "Low" };

/** The order the idle lens visits sentences in: the marked ones first, then a calm one for contrast. */
export const tourOrder = [1, 2, 3, 7, 10, 12, 4, 6];
