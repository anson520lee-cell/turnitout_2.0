/**
 * The script behind the live rewrite a customer watches while Writing Refinement runs (components/reports/refine).
 * Pure functions, no I/O, so they can be tested.
 *
 * Everything it shows comes from the finished report (which sentences were flagged, which count toward the AI
 * score) and the real suggestions (each sentence's rewrite, or why it was kept). It replays them over the text at a
 * fixed pace per character, 1.2 times the live report scan's: a reader goes through the text as in the report
 * scan, and right behind it R1 erases each flagged sentence and R2 types its suggestion, character by character.
 * While the suggestions are still being written the reader slows down, so the rewrite stays on its tail.
 *
 * The falling AI rate is a projection, not a new score: the report's own score with the rewritten sentences no
 * longer counted. The text is not reviewed again here (see rewrite-run.ts), so the view says "projected".
 */

import { aiScore, scoreBasis, type AutoReportResult, type ReportSentence, type ScoreCurve } from "./stitch";
import { INTRO_MS, SCAN_MS_PER_CHAR, isFlagged, planFromSentences, quote, type LogLine, type ScanPlan } from "./scan-script";
import { pickFlagged, type ReportRewrite } from "./rewrite";

/** How much faster the rewrite runs than the report scan, per character (Neo, 2026-10-27). */
export const REFINE_SPEEDUP = 1.2;
/** Milliseconds of reading per character: the report scan's rate, 1.2 times faster. */
export const REFINE_MS_PER_CHAR = SCAN_MS_PER_CHAR / REFINE_SPEEDUP;
/** The opening sequence, 1.2 times shorter than the report scan's. */
export const REFINE_INTRO_MS = INTRO_MS / REFINE_SPEEDUP;
/** R1 starts on a flagged sentence this long after the reader has finished it, so it works right on the reader's tail. */
export const CHASE_MS = 450;
/** Erasing a character takes this share of reading one (a fast backspace). */
export const ERASE_SHARE = 0.3;
/** Typing a character of the suggestion takes this share of reading one. */
export const TYPE_SHARE = 0.75;
/** A flagged sentence that keeps its own wording is looked at for this long. */
const KEPT_MS = 700;
const GAP_MS = 120;
/** R1 and R2 work faster when they start behind the reader, to catch up: at most 1 + this many times as fast. */
const MAX_CATCH_UP = 1.5;
/**
 * While the suggestions are being written the reader slows down instead of running ahead: it starts at its normal
 * pace and eases toward HOLD_SHARE of the text, creeping on at CREEP times its pace. Once the suggestions are in it
 * goes on at its normal pace, so R1 and R2 rewrite each sentence right behind it.
 */
export const HOLD_SHARE = 0.25;
const CREEP = 0.08;
/** Before the suggestions are in, the reader never goes past this share of the text. */
const WAIT_CAP = 0.97;

/** The text as the report split it, so sentence numbers match the suggestions exactly. */
export function refinePlan(result: AutoReportResult): ScanPlan {
  return planFromSentences(result.paragraphs.flatMap((p) => p.sentences.map((s) => ({ p: p.p, text: s.text }))));
}

/** How long the reader takes to go through the text at its normal pace: a fixed rate per character, 1.2 times the report scan's. */
export function refineReadMs(chars: number): number {
  return Math.max(1, Math.round(chars * REFINE_MS_PER_CHAR));
}

/** The reader's position while it waits for the suggestions: normal pace at first, easing toward HOLD_SHARE. */
function waitingAt(t: number, readMs: number): number {
  const tau = (HOLD_SHARE * readMs) / (1 - CREEP);
  return Math.min(WAIT_CAP, HOLD_SHARE * (1 - Math.exp(-Math.max(0, t) / tau)) + (CREEP * Math.max(0, t)) / readMs);
}

/**
 * How far through the text the reader is at `t` (ms on the scan clock), 0 to 1. `resultAt` is when the suggestions
 * came in (null until then): from there on the reader goes at its normal pace.
 */
export function readerAt(t: number, readMs: number, resultAt: number | null): number {
  if (resultAt === null || t < resultAt) return waitingAt(t, readMs);
  return Math.min(1, waitingAt(resultAt, readMs) + (t - resultAt) / readMs);
}

/** When the reader reaches `share` of the text (Infinity if it doesn't before the suggestions are in). */
export function readerTime(share: number, readMs: number, resultAt: number | null): number {
  const p = Math.max(0, Math.min(1, share));
  const held = resultAt === null ? Infinity : waitingAt(resultAt, readMs);
  if (p > held) return resultAt === null ? Infinity : (resultAt as number) + (p - held) * readMs;
  if (p > WAIT_CAP) return Infinity;
  let lo = 0;
  let hi = Math.max(readMs, resultAt ?? 0);
  while (waitingAt(hi, readMs) < p) hi *= 2;
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2;
    if (waitingAt(mid, readMs) < p) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** When the reader has finished sentence `i`, in ms on the scan clock (see scanPosition, which this mirrors). */
export function passedAt(plan: ScanPlan, i: number, readMs: number, resultAt: number | null = 0): number {
  const list = plan.sentences;
  const total = list[list.length - 1]?.end ?? 0;
  if (!total) return 0;
  return readerTime((list[i].end + 1) / total, readMs, resultAt);
}

/** Whether a sentence counts toward the report's AI score: the counted ones when the report marks them, else every flagged one. */
export function countsFor(result: AutoReportResult): (s: ReportSentence | undefined) => boolean {
  const countedOnly = result.summary.countedShare !== undefined;
  return (s) => Boolean(s && (countedOnly ? s.counts : isFlagged(s.risk)));
}

export interface RefineJob {
  /** Index in the plan (0-based). */
  i: number;
  /** 1-based sentence number, as in the report. */
  n: number;
  p: number;
  s: number;
  original: string;
  /** False until the suggestions are in; until then `rewrite` is null and `start`, `erased` and `end` are Infinity. */
  known: boolean;
  /** The suggestion, or null when the sentence keeps its own wording (or while it isn't known yet). */
  rewrite: string | null;
  why?: string;
  kept?: string;
  /** Counts toward the AI score, so rewriting it lowers the projected rate. */
  counts: boolean;
  /** When the reader finished the sentence (ms, scan clock). */
  passed: number;
  /** R1 marks it for rewriting, right behind the reader. */
  mark: number;
  /** R1 starts erasing it (or, for a sentence kept as written, R3 starts checking it). */
  start: number;
  /** Erasing ends and R2 starts typing (equals `start` for a kept sentence). */
  erased: number;
  end: number;
}

/**
 * The rewriter's timetable. R1 marks each flagged sentence just behind the reader. Once the suggestions are in
 * (`resultAt`, ms on the scan clock; null until then), R1 erases each one and R2 types its suggestion, one after
 * another, right behind the reader; when they start behind it (the suggestions came in after the reader had passed
 * the sentence) they work faster, to catch up.
 */
export function refineJobs(plan: ScanPlan, result: AutoReportResult, rewrite: ReportRewrite | null, resultAt: number | null, readMs = refineReadMs(plan.chars)): RefineJob[] {
  const index = new Map(plan.sentences.map((x, i) => [x.n, i]));
  const byN = new Map(result.paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s]));
  const counts = countsFor(result);
  const known = rewrite !== null && resultAt !== null;
  const at = known ? resultAt : null;
  const items = new Map((rewrite?.items ?? []).map((it) => [it.n, it]));
  const queue = pickFlagged(result)
    .map((s) => s.n)
    .filter((n) => index.has(n))
    .sort((a, b) => a - b);
  const jobs: RefineJob[] = [];
  let free = 0;
  for (const n of queue) {
    const i = index.get(n)!;
    const x = plan.sentences[i];
    const it = items.get(n);
    const original = it?.original ?? x.text;
    const text = known ? (it?.rewrite ?? null) : null;
    const passed = passedAt(plan, i, readMs, at);
    const mark = passed + CHASE_MS;
    let start = Infinity;
    let erased = Infinity;
    let end = Infinity;
    if (known) {
      start = Math.max(mark, resultAt, free);
      const fast = 1 + Math.min(MAX_CATCH_UP, (start - mark) / 2_500);
      erased = start + (text ? (original.length * ERASE_SHARE * REFINE_MS_PER_CHAR) / fast : 0);
      end = erased + (text ? (text.length * TYPE_SHARE * REFINE_MS_PER_CHAR) / fast : KEPT_MS / fast);
      free = end + GAP_MS;
    }
    jobs.push({
      i,
      n,
      p: x.p,
      s: x.s,
      original,
      known,
      rewrite: text,
      ...(it?.why ? { why: it.why } : {}),
      ...(known && !text ? { kept: it?.kept ?? "no suggestion came back" } : {}),
      counts: counts(byN.get(n)),
      passed,
      mark,
      start,
      erased,
      end,
    });
  }
  return jobs;
}

/** When the whole run is over: the reader is through the text and the last suggestion is typed (Infinity until they are in). */
export function refineEndMs(jobs: RefineJob[], readMs: number, resultAt: number | null): number {
  return Math.max(readerTime(1, readMs, resultAt), ...jobs.map((j) => j.end));
}

export type JobPhase =
  | { phase: "waiting" }
  /** R1 has marked it; the suggestion isn't being written yet. */
  | { phase: "marked" }
  /** Characters of the original still standing. */
  | { phase: "erasing"; left: number }
  | { phase: "typing"; typed: number }
  /** A kept sentence, being checked. */
  | { phase: "checking" }
  | { phase: "done" };

/** Where a job is at `t`. */
export function jobPhase(job: RefineJob, t: number): JobPhase {
  if (t < job.mark) return { phase: "waiting" };
  if (t < job.start) return { phase: "marked" };
  if (t >= job.end) return { phase: "done" };
  if (!job.rewrite) return { phase: "checking" };
  if (t < job.erased) {
    const f = (t - job.start) / Math.max(1, job.erased - job.start);
    return { phase: "erasing", left: Math.max(0, Math.ceil(job.original.length * (1 - f))) };
  }
  const f = (t - job.erased) / Math.max(1, job.end - job.erased);
  return { phase: "typing", typed: Math.min(job.rewrite.length, Math.floor(job.rewrite.length * f)) };
}

/** Of a counted sentence's drop, the share shown once its original is erased; the rest comes as the suggestion is typed. */
const ERASED_SHARE = 0.3;

/**
 * How much of a counted sentence's drop is shown at `t`, 0 to 1: nothing until R1 starts on it, then a little as the
 * original is erased and the rest as the suggestion is typed. Exactly 1 once typed, and 0 throughout for a sentence
 * kept as written, so the line only ever falls and ends on the real projection.
 */
export function clearedShare(job: RefineJob, t: number): number {
  if (!job.counts || !job.rewrite) return 0;
  const ph = jobPhase(job, t);
  if (ph.phase === "done") return 1;
  if (ph.phase === "erasing") return ERASED_SHARE * (1 - ph.left / Math.max(1, job.original.length));
  if (ph.phase === "typing") return ERASED_SHARE + (1 - ERASED_SHARE) * (ph.typed / Math.max(1, job.rewrite.length));
  return 0;
}

export interface RefineRate {
  /** The report's AI score, 0 to 1. */
  original: number;
  /** The share and curve that score is read from (see scoreBasis). */
  share: number;
  curve: ScoreCurve;
  /** Sentences that count toward the score. */
  counted: number;
}

export function refineRate(result: AutoReportResult): RefineRate {
  const { share, curve } = scoreBasis(result.summary);
  const counts = countsFor(result);
  const counted = result.paragraphs.reduce((sum, p) => sum + p.sentences.filter((s) => counts(s)).length, 0);
  return { original: aiScore(share, curve), share, curve, counted };
}

/**
 * The projected AI score once `cleared` of the counted sentences have been rewritten: the report's own share with
 * those sentences taken out of the count, read on the report's own curve. With nothing cleared it is exactly the
 * report's score. A projection only: whether a rewrite reads differently shows only in a new report.
 */
export function projectedScore(rate: RefineRate, cleared: number): number {
  // `cleared` may be fractional (see projectedAt).
  if (!rate.counted) return rate.original;
  const left = Math.max(0, rate.counted - cleared) / rate.counted;
  return aiScore(rate.share * left, rate.curve);
}

/** Counted sentences whose suggestion has been typed by `t`. */
export function clearedBy(jobs: RefineJob[], t: number): number {
  return jobs.filter((j) => j.rewrite && j.counts && t >= j.end).length;
}

/**
 * The projected rate as shown at `t`. The score curve is steep, so the first rewrites alone would carry most of
 * the drop; the chart instead walks evenly from the original rate to the final projection, each counted sentence
 * taking an equal step as it is erased and typed (clearedShare). It still lands exactly on
 * projectedScore(rate, clearedBy(jobs, Infinity)).
 */
export function projectedAt(rate: RefineRate, jobs: RefineJob[], t: number): number {
  const total = clearedBy(jobs, Infinity);
  if (!total) return rate.original;
  const done = jobs.reduce((sum, j) => sum + clearedShare(j, t), 0);
  if (done >= total) return projectedScore(rate, total);
  const end = projectedScore(rate, total);
  return rate.original + ((end - rate.original) * done) / total;
}

/* ------------------------------------------------------------------
   What the rewrite agents say. Like the scan's agents, their lines name the
   sentence being worked on and what was kept, never how it was judged.
   ------------------------------------------------------------------ */

export function queuedLine(x: { p: number; s: number; text: string }): LogLine {
  return { tone: "violet", text: `P${x.p} S${x.s} flagged → queued for rewrite · ${quote(x.text, 30)}` };
}

export function eraseLine(j: RefineJob): LogLine {
  return { tone: "risk", text: `R1 ERASE · P${j.p} S${j.s} · −${j.original.length} chars` };
}

export function writeLine(j: RefineJob): LogLine {
  return { tone: "info", text: `R2 WRITE · P${j.p} S${j.s} · +${j.rewrite?.length ?? 0} chars · ${quote(j.rewrite ?? "", 34)}` };
}

/** R3 GUARD, when a suggestion is in: it passed every check (rewrite.ts checkRewrite), and its length against the original. */
export function guardLine(j: RefineJob): LogLine {
  const ratio = Math.round(((j.rewrite?.length ?? 0) / Math.max(1, j.original.length)) * 100);
  return { tone: "ok", text: `R3 GUARD · P${j.p} S${j.s} ✓ facts, names, citations, hedges kept · length ${ratio}%` };
}

export function keptLine(j: RefineJob): LogLine {
  return { tone: "warn", text: `R3 GUARD · P${j.p} S${j.s} kept as you wrote it${j.kept ? ` · ${j.kept}` : ""}` };
}
