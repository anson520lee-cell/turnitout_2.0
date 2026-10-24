/**
 * The script behind the live scan a customer watches while their report is
 * made. Pure functions, no I/O, so they can be tested.
 *
 * Everything the scan shows comes from two places: the customer's own text
 * (its sentences, words and paragraphs, counted here) and the finished report
 * (each sentence's rating and the reviewer's reasons). The scan replays the
 * report over the text at a readable pace; it never makes up a rating, a
 * reason or a number.
 */

import { chunkText } from "@/lib/chunking";
import { splitSentences } from "@/lib/recheck";
import { PIECE_SIZE, SCORE_BANDS, overallFor, type AutoReportResult, type Level, type Overall, type ReportSentence, type ScoreCurve } from "./stitch";

export interface ScanSentence {
  /** 1-based place in the whole text, as in the report. */
  n: number;
  /** 1-based paragraph of the whole text. */
  p: number;
  /** 1-based place in its paragraph. */
  s: number;
  text: string;
  /** Character offsets into the joined sentence stream, used to pace the scan. */
  start: number;
  end: number;
  words: string[];
}

export interface ScanPlan {
  sentences: ScanSentence[];
  /** Sentence indexes (0-based) of each paragraph, in order. */
  paragraphs: { p: number; first: number; last: number }[];
  chars: number;
  words: number;
  pieces: number;
}

export function scanPlan(text: string): ScanPlan {
  const split = splitSentences(text);
  let at = 0;
  const sentences: ScanSentence[] = split.map((x, i) => {
    const start = at;
    at += x.text.length + 1;
    return { n: i + 1, p: x.p, s: x.s, text: x.text, start, end: start + x.text.length, words: x.text.split(/\s+/).filter(Boolean) };
  });
  const paragraphs: ScanPlan["paragraphs"] = [];
  sentences.forEach((x, i) => {
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.p === x.p) last.last = i;
    else paragraphs.push({ p: x.p, first: i, last: i });
  });
  return {
    sentences,
    paragraphs,
    chars: text.trim().length,
    words: sentences.reduce((sum, x) => sum + x.words.length, 0),
    pieces: text.trim() ? chunkText(text, PIECE_SIZE).length : 0,
  };
}

/** A plan from sentences already split elsewhere (the free scan's own), with 1-based paragraphs. */
export function planFromSentences(list: { p: number; text: string }[]): ScanPlan {
  let at = 0;
  const inPara = new Map<number, number>();
  const sentences: ScanSentence[] = list.map((x, i) => {
    const start = at;
    at += x.text.length + 1;
    const s = (inPara.get(x.p) ?? 0) + 1;
    inPara.set(x.p, s);
    return { n: i + 1, p: x.p, s, text: x.text, start, end: start + x.text.length, words: x.text.split(/\s+/).filter(Boolean) };
  });
  const paragraphs: ScanPlan["paragraphs"] = [];
  sentences.forEach((x, i) => {
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.p === x.p) last.last = i;
    else paragraphs.push({ p: x.p, first: i, last: i });
  });
  return { sentences, paragraphs, chars: list.reduce((n, x) => n + x.text.length, 0), words: sentences.reduce((n, x) => n + x.words.length, 0), pieces: 0 };
}

/** The free scan's lighter live view: about 14 seconds for 2,000 characters (it replays a finished result, after its own opening), never under 8. */
export function quickScanDurationMs(chars: number): number {
  return Math.round(Math.min(18_000, Math.max(8_000, chars * 7)));
}

/**
 * How long the scan runs: about two minutes for 5,000 characters (Jordan,
 * 2026-10-20), in proportion to length, never under 40 seconds or over 5 minutes.
 */
export function scanDurationMs(chars: number): number {
  return Math.round(Math.min(300_000, Math.max(40_000, chars * 24)));
}

/** How long the opening sequence runs before the scan starts. */
export const INTRO_MS = 24_000;

/** Where the scan is after `fraction` (0 to 1) of its run: the sentence being read, and how far into it. */
export function scanPosition(plan: ScanPlan, fraction: number): { index: number; within: number } {
  const list = plan.sentences;
  if (!list.length) return { index: 0, within: 0 };
  const total = list[list.length - 1].end;
  const at = Math.max(0, Math.min(1, fraction)) * total;
  if (at >= total) return { index: list.length, within: 0 };
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].end + 1 <= at) lo = mid + 1;
    else hi = mid;
  }
  const x = list[lo];
  return { index: lo, within: Math.max(0, Math.min(1, (at - x.start) / Math.max(1, x.text.length))) };
}

/** The report's ratings by sentence number. */
export function ratingsBySentence(result: AutoReportResult): Map<number, ReportSentence> {
  return new Map(result.paragraphs.flatMap((p) => p.sentences).map((x) => [x.n, x]));
}

export const isFlagged = (r: Level | undefined) => r === "high" || r === "medium";

/**
 * prefix[k] = flagged sentences among the first k, from the report's ratings. With `countedOnly` (reports that mark
 * which sentences count toward the AI score) only those are counted, so the live rate ends on the report's own basis.
 */
export function flaggedPrefix(plan: ScanPlan, ratings: Map<number, ReportSentence>, countedOnly = false): number[] {
  const out = [0];
  plan.sentences.forEach((x, i) => {
    const r = ratings.get(x.n);
    out.push(out[i] + ((countedOnly ? r?.counts : isFlagged(r?.risk)) ? 1 : 0));
  });
  return out;
}

/**
 * The live AI rate when the scan has shown `at` sentences (a fraction means it
 * is part-way through one): the share of the sentences shown so far that the
 * report flags. It goes up on a flagged sentence and down on a clear one, word
 * by word, and once every sentence is shown it is exactly the report's own
 * figure. Until two sentences are finished there is too little to show.
 */
export function liveEstimate(prefix: number[], total: number, finalShare: number, at: number): number | null {
  if (total <= 0 || at >= total) return total > 0 ? finalShare : null;
  if (at < 2) return null;
  const k = Math.floor(at);
  const frac = at - k;
  const raw = (prefix[k] + (prefix[k + 1] - prefix[k]) * frac) / at;
  // Over the last sentence, meet the report's figure exactly (they only differ if the report counted sentences differently).
  return at > total - 1 ? raw + (finalShare - raw) * (at - (total - 1)) : raw;
}

export function bandFor(rate: number, curve?: ScoreCurve): Overall {
  return overallFor(rate, curve);
}

export { SCORE_BANDS };

/** A short quote of a sentence for the log. */
export function quote(text: string, max = 46): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? `“${t}”` : `“${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…”`;
}

export const levelLabel: Record<Level, string> = { high: "HIGH", medium: "MEDIUM", uncertain: "UNCERTAIN", low: "LOW" };

export type LogTone = "dim" | "ok" | "warn" | "risk" | "info" | "violet";
export interface LogLine {
  tone: LogTone;
  text: string;
}

const toneFor: Record<Level, LogTone> = { high: "risk", medium: "warn", uncertain: "violet", low: "ok" };

/**
 * What the reviewer log says when a sentence's rating is shown: the real
 * rating only. The reasons stay in the report itself; the log never says what
 * the reviewer looks for (Jordan, 2026-10-20: the method stays private).
 */
export function reviewerLines(x: ScanSentence, rated: ReportSentence | undefined): LogLine[] {
  const risk = rated?.risk ?? "low";
  const head = `P${x.p} S${x.s} ${quote(x.text, 40)}`;
  if (risk === "low") return [{ tone: "dim", text: `${head} → low` }];
  return [
    { tone: toneFor[risk], text: `${head} → ${levelLabel[risk]}` },
    { tone: "dim", text: `  ${risk === "uncertain" ? "kept open · see your report" : "noted · details in your report"}` },
  ];
}

/** The tally when the scan finishes a paragraph. */
export function paragraphLine(p: number, sentences: ReportSentence[], risk: Level): LogLine {
  const flagged = sentences.filter((x) => isFlagged(x.risk)).length;
  const share = sentences.length ? Math.round((flagged / sentences.length) * 100) : 0;
  return { tone: toneFor[risk], text: `¶${p} done · ${flagged}/${sentences.length} flagged (${share}%) · paragraph ${levelLabel[risk].toLowerCase()}` };
}

/* ------------------------------------------------------------------
   What the scan agents say. Their lines name the part of the text being
   looked at (a sentence, a paragraph, a short quote) and never how it is
   judged: no counts, word lists or signal names (Jordan, 2026-10-20). They
   are a picture of the reviewer reading the text, which it does, in context.
   ------------------------------------------------------------------ */

const pick = <T,>(list: readonly T[], n: number) => list[((n % list.length) + list.length) % list.length];

/** A2 LOOKAHEAD, on the sentence ahead of the reader. */
export function lookaheadLine(x: ScanSentence): LogLine {
  return { tone: "dim", text: `A2 LOOKAHEAD · queued P${x.p} S${x.s} ${quote(x.text, 30)}` };
}

const VERIFY = ["re-reading P{p} S{s} in context", "second pass on P{p} S{s}", "P{p} S{s} · weighing it against the sentences around it", "assessing P{p} S{s}…"] as const;

/** A3 VERIFY, on a sentence behind the reader. */
export function verifyLine(x: ScanSentence): LogLine {
  return { tone: "info", text: `A3 VERIFY · ${pick(VERIFY, x.n).replace("{p}", String(x.p)).replace("{s}", String(x.s))}` };
}

/** A4 CONTEXT, when the reader starts a paragraph and when it finishes one. */
export function contextLine(p: number, phase: "start" | "end", paragraphs: number): LogLine {
  if (phase === "start") return { tone: "violet", text: `A4 CONTEXT · focusing on paragraph ${p} of ${paragraphs}` };
  return { tone: "violet", text: p > 1 ? `A4 CONTEXT · cross-checking ¶${p} against ¶${pick([1, p - 1], p)}` : "A4 CONTEXT · ¶1 held in context" };
}

const THINKING = ["thinking…", "assessing…", "considering the paragraph as a whole…", "comparing with earlier sections…"] as const;

/** A short, plain "working" line for the agents log, tied to the sentence being read. */
export function thinkingLine(x: ScanSentence): LogLine {
  return { tone: "dim", text: `${pick(THINKING, x.n)} P${x.p} S${x.s}` };
}
