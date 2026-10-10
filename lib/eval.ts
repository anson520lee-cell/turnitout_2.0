/**
 * Scoring the scan report against a known Turnitin result.
 *
 * A "case" is an essay plus which of its sentences Turnitin flagged. The
 * reviewer's report names sentences as "P2 S3" and paragraphs as "P2:" with a
 * risk; this compares those with the truth. Pure functions, no I/O.
 */

import { parseReport, type Risk } from "@/lib/report-format";
import { splitSentences } from "@/lib/recheck";

export interface TruthSentence {
  p: number;
  s: number;
  flagged: boolean;
}

export interface Confusion {
  /** Sentences the reviewer called risky at this level. */
  called: number;
  /** Of those, how many Turnitin really flagged. */
  hit: number;
  /** Called risky but not flagged. */
  falseAlarm: number;
  /** Flagged by Turnitin but not called. */
  missed: number;
  /** hit / called, 0 to 1 (null when nothing was called). */
  precision: number | null;
  /** hit / (hit + missed), 0 to 1 (null when Turnitin flagged nothing). */
  recall: number | null;
}

export interface ParagraphScore {
  p: number;
  flagged: number;
  total: number;
  /** Share of the paragraph's sentences Turnitin flagged, 0 to 1. */
  share: number;
  /** The reviewer's rating for the paragraph, if it gave one. */
  ai: Risk | null;
  /** Turnitin flagged at least half of the paragraph. */
  truthRisky: boolean;
  /** High counts as risky (strict). */
  agreesStrict: boolean | null;
  /** High or Medium counts as risky (loose). */
  agreesLoose: boolean | null;
}

export interface Metrics {
  sentences: number;
  flagged: number;
  /** Only "High" sentences. */
  high: Confusion;
  /** "High" and "Medium". */
  highMedium: Confusion;
  /** "High", "Medium" and "Uncertain". */
  anyFlag: Confusion;
  paragraphs: ParagraphScore[];
  /** Share of rated paragraphs the reviewer got right, strict and loose (null when none were rated). */
  paragraphAccuracyStrict: number | null;
  paragraphAccuracyLoose: number | null;
  overall: Risk | null;
  /** The model ran out of output budget and the report ends mid-way, so the scores are unreliable. */
  truncated?: boolean;
}

const key = (p: number, s: number) => `${p}:${s}`;

const LOCATION = /^P(\d+)\s*S(\d+)\b/i;
const PARAGRAPH = /^P(\d+)\s*:/i;

function confusion(called: Set<string>, truth: TruthSentence[]): Confusion {
  const flagged = new Set(truth.filter((t) => t.flagged).map((t) => key(t.p, t.s)));
  let hit = 0;
  for (const k of called) if (flagged.has(k)) hit += 1;
  const falseAlarm = called.size - hit;
  const missed = flagged.size - hit;
  return {
    called: called.size,
    hit,
    falseAlarm,
    missed,
    precision: called.size ? hit / called.size : null,
    recall: flagged.size ? hit / flagged.size : null,
  };
}

/** Score one report against the truth for the same text. */
export function scoreReport(report: string, truth: TruthSentence[]): Metrics {
  const blocks = parseReport(report);
  const high = new Set<string>();
  const medium = new Set<string>();
  const uncertain = new Set<string>();
  const paragraphRisk = new Map<number, Risk>();
  let overall: Risk | null = null;

  for (const b of blocks) {
    if (b.kind !== "item") continue;
    const sentence = LOCATION.exec(b.location ?? b.text);
    if (sentence && b.risk) {
      const k = key(Number(sentence[1]), Number(sentence[2]));
      if (b.risk === "high") high.add(k);
      else if (b.risk === "medium") medium.add(k);
      else if (b.risk === "uncertain") uncertain.add(k);
      continue;
    }
    const para = PARAGRAPH.exec(b.location ?? b.text);
    if (para && b.risk) paragraphRisk.set(Number(para[1]), b.risk);
    else if (/^overall risk/i.test(b.text) && b.risk) overall = b.risk;
  }

  const hm = new Set([...high, ...medium]);
  const any = new Set([...hm, ...uncertain]);

  const byParagraph = new Map<number, TruthSentence[]>();
  for (const t of truth) byParagraph.set(t.p, [...(byParagraph.get(t.p) ?? []), t]);
  const paragraphs: ParagraphScore[] = [...byParagraph.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([p, list]) => {
      const flagged = list.filter((t) => t.flagged).length;
      const share = flagged / list.length;
      const ai = paragraphRisk.get(p) ?? null;
      const truthRisky = share >= 0.5;
      return {
        p,
        flagged,
        total: list.length,
        share,
        ai,
        truthRisky,
        agreesStrict: ai ? (ai === "high") === truthRisky : null,
        agreesLoose: ai ? (ai === "high" || ai === "medium") === truthRisky : null,
      };
    });
  const rated = paragraphs.filter((x) => x.ai);
  const share = (f: (x: ParagraphScore) => boolean | null) => (rated.length ? rated.filter((x) => f(x) === true).length / rated.length : null);

  return {
    sentences: truth.length,
    flagged: truth.filter((t) => t.flagged).length,
    high: confusion(high, truth),
    highMedium: confusion(hm, truth),
    anyFlag: confusion(any, truth),
    paragraphs,
    paragraphAccuracyStrict: share((x) => x.agreesStrict),
    paragraphAccuracyLoose: share((x) => x.agreesLoose),
    overall,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Build the truth for an essay from the sentences Turnitin flagged, pasted one
 * per line. A sentence counts as flagged when its normalised text equals, or
 * contains, or is contained by a pasted line (so a pasted fragment still matches).
 */
export function truthFromFlaggedLines(body: string, flaggedLines: string): { truth: TruthSentence[]; unmatched: string[] } {
  const lines = flaggedLines
    .split(/\r?\n/)
    .map((l) => norm(l))
    .filter((l) => l.length >= 8);
  const used = new Set<number>();
  const truth = splitSentences(body).map((x) => {
    const n = norm(x.text);
    const idx = lines.findIndex((l) => n === l || n.includes(l) || l.includes(n));
    if (idx >= 0) used.add(idx);
    return { p: x.p, s: x.s, flagged: idx >= 0 };
  });
  const original = flaggedLines.split(/\r?\n/).filter((l) => norm(l).length >= 8);
  return { truth, unmatched: original.filter((_, i) => !used.has(i)) };
}
