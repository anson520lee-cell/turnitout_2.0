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
import { OVERALL_BANDS, PIECE_SIZE, overallFor, type AutoReportResult, type Level, type Overall, type ReportSentence } from "./stitch";

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
 * The live rate after the first `revealed` sentences: the share of the whole
 * text's sentences flagged so far. It only ever climbs, and once every sentence
 * is shown it equals the report's own figure (High + Medium sentences out of
 * all reviewed sentences).
 */
export function liveRate(result: AutoReportResult, ratings: Map<number, ReportSentence>, revealed: number, total: number): number {
  if (revealed >= total) return result.summary.flaggedShare;
  let flagged = 0;
  for (let n = 1; n <= revealed; n++) if (isFlagged(ratings.get(n)?.risk)) flagged += 1;
  const of = Math.max(1, result.summary.sentences || total);
  return Math.min(result.summary.flaggedShare, flagged / of);
}

export function bandFor(rate: number): Overall {
  return overallFor(rate);
}

export { OVERALL_BANDS };

/** A short quote of a sentence for the log. */
export function quote(text: string, max = 46): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? `“${t}”` : `“${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…”`;
}

const STOP = new Set(
  "about above after again against also because been before being below between both could does doing down during each from further have having here into itself just more most only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your yours".split(" "),
);
const contentWords = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\s]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP.has(w)),
  );

/** Words two sentences share (longer words, no stop words), for the "echo" lines. */
export function sharedWords(a: string, b: string, max = 2): string[] {
  const B = contentWords(b);
  return [...contentWords(a)].filter((w) => B.has(w)).slice(0, max);
}

/** Facts counted from one sentence: its length, its first word and its commas. */
export function sentenceFacts(x: ScanSentence): string {
  const commas = (x.text.match(/,/g) ?? []).length;
  const opener = x.words[0]?.replace(/[^\p{L}\p{N}'’-]/gu, "") ?? "";
  return `${x.words.length} words · opens “${opener}” · ${commas} comma${commas === 1 ? "" : "s"}`;
}

export const levelLabel: Record<Level, string> = { high: "HIGH", medium: "MEDIUM", uncertain: "UNCERTAIN", low: "LOW" };

export type LogTone = "dim" | "ok" | "warn" | "risk" | "info" | "violet";
export interface LogLine {
  tone: LogTone;
  text: string;
}

const toneFor: Record<Level, LogTone> = { high: "risk", medium: "warn", uncertain: "violet", low: "ok" };

/** What the reviewer log says when a sentence's rating is shown: the rating and, when it gave them, the reviewer's own reasons. */
export function reviewerLines(x: ScanSentence, rated: ReportSentence | undefined): LogLine[] {
  const risk = rated?.risk ?? "low";
  const head = `P${x.p} S${x.s} ${quote(x.text, 40)}`;
  if (risk === "low") return [{ tone: "dim", text: `${head} → low · no signal noted` }];
  const out: LogLine[] = [{ tone: toneFor[risk], text: `${head} → ${levelLabel[risk]}` }];
  if (rated?.why) out.push({ tone: "info", text: `  reason: ${rated.why}` });
  if (rated?.ask) out.push({ tone: "dim", text: `  ask yourself: ${rated.ask}` });
  return out;
}

/** The tally when the scan finishes a paragraph. */
export function paragraphLine(p: number, sentences: ReportSentence[], risk: Level): LogLine {
  const flagged = sentences.filter((x) => isFlagged(x.risk)).length;
  const share = sentences.length ? Math.round((flagged / sentences.length) * 100) : 0;
  return { tone: toneFor[risk], text: `¶${p} done · ${flagged}/${sentences.length} flagged (${share}%) · paragraph ${levelLabel[risk].toLowerCase()}` };
}
