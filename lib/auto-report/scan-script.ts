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

/** prefix[k] = flagged sentences among the first k, from the report's ratings. */
export function flaggedPrefix(plan: ScanPlan, ratings: Map<number, ReportSentence>): number[] {
  const out = [0];
  plan.sentences.forEach((x, i) => out.push(out[i] + (isFlagged(ratings.get(x.n)?.risk) ? 1 : 0)));
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

/* ------------------------------------------------------------------
   What the scan agents look at. All counted from the text itself.
   A1 READ reads word by word; A2 X-RAY looks one line ahead at how the
   next sentence is built; A3 PHRASE follows behind, marking wording the
   text repeats; A4 RHYTHM measures sentence lengths per paragraph.
   ------------------------------------------------------------------ */

const TRANSITIONS = [
  "however", "furthermore", "moreover", "additionally", "in addition", "consequently", "therefore", "thus", "hence",
  "nevertheless", "nonetheless", "in conclusion", "to conclude", "in summary", "overall", "ultimately", "notably",
  "importantly", "similarly", "likewise", "meanwhile", "firstly", "secondly", "thirdly", "finally", "on the other hand",
  "as a result", "in contrast", "for example", "for instance", "it is important to note", "it is worth noting",
];
const TRANSITION_RE = new RegExp(`^(${[...TRANSITIONS].sort((a, b) => b.length - a.length).join("|")})\\b`, "i");

/** The linking phrase a sentence opens with ("However", "In addition", …), if any. */
export function transitionOpener(text: string): string | null {
  const m = text.trim().replace(/^[“"'‘(]+/, "").match(TRANSITION_RE);
  return m ? m[1] : null;
}

export const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Longer content words the text uses at least `min` times, with their counts. */
export function repeatedWords(plan: ScanPlan, min = 3): Map<string, number> {
  const counts = new Map<string, number>();
  for (const x of plan.sentences)
    for (const w of x.words) {
      const k = normWord(w);
      if (k.length > 4 && !STOP.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  return new Map([...counts].filter(([, c]) => c >= min));
}

const breaksIn = (text: string) => (text.match(/[,;:—–]/g) ?? []).length;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Sentence lengths of a paragraph: average, spread, and how even they are. */
export function rhythmOf(lengths: number[]): { avg: number; spread: number; label: string } {
  const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const spread = Math.sqrt(lengths.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, lengths.length));
  const cv = avg ? spread / avg : 0;
  const label = lengths.length < 2 ? "single sentence" : cv < 0.2 ? "very even" : cv < 0.35 ? "even" : cv < 0.6 ? "mixed" : "varied";
  return { avg, spread, label };
}

/** A2 X-RAY, on the sentence ahead of the reader: how it opens and how it is built. */
export function xrayLine(x: ScanSentence, prev?: ScanSentence): LogLine {
  const tr = transitionOpener(x.text);
  const first = normWord(x.words[0] ?? "");
  const opener = tr ? `opens with link “${tr}”` : prev && first && normWord(prev.words[0] ?? "") === first ? `same opener as S${prev.s} (“${x.words[0]}”)` : `opens “${x.words[0]?.replace(/[^\p{L}\p{N}'’-]/gu, "") ?? ""}”`;
  return { tone: tr ? "violet" : "dim", text: `A2 X-RAY P${x.p} S${x.s} · ${opener} · ${plural(breaksIn(x.text), "break")} · ${x.words.length} words` };
}

/** A3 PHRASE, on a sentence behind the reader: the wording it shares with the rest of the text. */
export function phraseLine(x: ScanSentence, repeats: Map<string, number>): LogLine {
  const hits = [...new Set(x.words.map(normWord))].filter((w) => repeats.has(w)).sort((a, b) => repeats.get(b)! - repeats.get(a)!);
  if (!hits.length) return { tone: "dim", text: `A3 PHRASE P${x.p} S${x.s} · no repeated wording` };
  return { tone: "warn", text: `A3 PHRASE P${x.p} S${x.s} · ${hits.slice(0, 2).map((w) => `“${w}” ×${repeats.get(w)}`).join(", ")} in the text` };
}

/** A4 RHYTHM, when a paragraph is finished: its sentence lengths. */
export function rhythmLine(p: number, lengths: number[]): LogLine {
  const r = rhythmOf(lengths);
  return { tone: "info", text: `A4 RHYTHM ¶${p} · ${lengths.join("·")} words · avg ${r.avg.toFixed(1)} · spread ±${r.spread.toFixed(1)} → ${r.label}` };
}
