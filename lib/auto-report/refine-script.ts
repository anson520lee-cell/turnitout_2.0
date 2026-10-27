/**
 * The script behind the live rewrite a customer watches while Writing Refinement runs (components/reports/refine).
 * Pure functions, no I/O, so they can be tested.
 *
 * Everything it shows comes from the finished report (which sentences were flagged, which count toward the AI
 * score) and the real suggestions (each sentence's rewrite, or why it was kept). It replays them over the text at a
 * fixed pace per character, 1.2 times the live report scan's: a reader goes through the text as in the report
 * scan, R1 follows on its tail and encodes each flagged sentence, and writers type the suggestions in, character
 * by character.
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
/** R1 ENCODE starts on a flagged sentence this long after the reader has finished it, so it chases the reader's tail. */
export const CHASE_MS = 450;
/** Encoding a character (R1 turning the original into code, ready to be deleted) takes this share of reading one. */
export const ENCODE_SHARE = 0.7;
/** Typing a character of the suggestion takes this share of reading one. */
export const TYPE_SHARE = 0.75;
/** Decoding a kept sentence back to its own words takes this share of reading a character. */
const RESTORE_SHARE = 0.25;
/** R2 writers working side by side, so suggestions that come in late are written in parallel. */
export const WRITERS = 3;
/** The writers start this far apart, so they don't all begin on the same frame. */
const WRITER_STAGGER_MS = 200;
/** A writer that starts late works faster to catch up: at most 1 + this many times as fast. */
const MAX_CATCH_UP = 0.5;
/** A flagged sentence that keeps its own wording is looked at for this long. */
const KEPT_MS = 700;
const GAP_MS = 120;
/**
 * How much of a counted sentence's drop the projected rate shows once R1 has encoded it, and how far that drifts
 * while the writer drafts. The rest comes as R2 types the real suggestion, so the line falls steadily behind the
 * reader instead of all at the end. A sentence that turns out to keep its own wording gives its share back.
 */
export const ENCODED_SHARE = 0.55;
export const DRAFT_SHARE = 0.7;
const DRAFT_DRIFT_MS = 15_000;

/** The text as the report split it, so sentence numbers match the suggestions exactly. */
export function refinePlan(result: AutoReportResult): ScanPlan {
  return planFromSentences(result.paragraphs.flatMap((p) => p.sentences.map((s) => ({ p: p.p, text: s.text }))));
}

/** How long the reader takes to go through the text: a fixed rate per character, 1.2 times the report scan's. */
export function refineReadMs(chars: number): number {
  return Math.max(1, Math.round(chars * REFINE_MS_PER_CHAR));
}

/** When the reader has finished sentence `i`, in ms on the scan clock (see scanPosition, which this mirrors). */
export function passedAt(plan: ScanPlan, i: number, readMs: number): number {
  const list = plan.sentences;
  const total = list[list.length - 1]?.end ?? 0;
  if (!total) return 0;
  return Math.min(1, (list[i].end + 1) / total) * readMs;
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
  /** False until the suggestions are in; until then `rewrite` is null and `write` and `end` are Infinity. */
  known: boolean;
  /** The suggestion, or null when the sentence keeps its own wording (or while it isn't known yet). */
  rewrite: string | null;
  why?: string;
  kept?: string;
  /** Counts toward the AI score, so rewriting it lowers the projected rate. */
  counts: boolean;
  /** When the reader finished the sentence (ms, scan clock). */
  passed: number;
  /** R1 starts encoding the original (or, for a sentence known to be kept before R1 reaches it, R3 starts checking it). */
  start: number;
  /** R1 has encoded the whole original (equals `start` when it was never encoded). */
  erased: number;
  /** An R2 writer starts typing the suggestion, or decoding the original back for a kept sentence. */
  write: number;
  end: number;
  /** Which R2 writer takes it (0-based), or -1 when no writer is needed. */
  lane: number;
}

/**
 * The rewriter's timetable, from the moment the reader starts. R1 ENCODE follows just behind the reader and turns
 * each flagged sentence into code as soon as it has been read, one after another, whether or not the suggestions
 * are in yet. Once they are (`resultAt`, ms on the scan clock; null until then), WRITERS writers type them in, each
 * taking the next encoded sentence; a writer that starts late works faster, up to MAX_CATCH_UP + 1 times. A sentence
 * that keeps its own wording is decoded back if it was already encoded, or only checked if not.
 *
 * Everything before `resultAt` is the same whatever the suggestions turn out to be, so the part already shown never
 * changes when they arrive.
 */
export function refineJobs(plan: ScanPlan, result: AutoReportResult, rewrite: ReportRewrite | null, resultAt: number | null, readMs = refineReadMs(plan.chars)): RefineJob[] {
  const index = new Map(plan.sentences.map((x, i) => [x.n, i]));
  const byN = new Map(result.paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s]));
  const counts = countsFor(result);
  const known = rewrite !== null && resultAt !== null;
  const items = new Map((rewrite?.items ?? []).map((it) => [it.n, it]));
  const queue = pickFlagged(result)
    .map((s) => s.n)
    .filter((n) => index.has(n))
    .sort((a, b) => a - b);
  const writers = Array.from({ length: WRITERS }, (_, k) => (known ? resultAt + k * WRITER_STAGGER_MS : Infinity));
  const jobs: RefineJob[] = [];
  let free = 0;
  for (const n of queue) {
    const i = index.get(n)!;
    const x = plan.sentences[i];
    const it = items.get(n);
    const original = it?.original ?? x.text;
    const text = known ? (it?.rewrite ?? null) : null;
    const passed = passedAt(plan, i, readMs);
    const start = Math.max(passed + CHASE_MS, free);
    // Known to be kept before R1 gets to it: nothing to encode, R3 just checks it.
    const checkOnly = known && !text && start >= resultAt;
    const erased = checkOnly ? start : start + original.length * ENCODE_SHARE * REFINE_MS_PER_CHAR;
    let write = Infinity;
    let end = Infinity;
    let lane = -1;
    if (checkOnly) {
      write = erased;
      end = erased + KEPT_MS;
      free = end + GAP_MS;
    } else {
      free = erased + GAP_MS;
      if (known) {
        lane = writers.indexOf(Math.min(...writers));
        write = Math.max(erased, writers[lane]);
        const fast = 1 + Math.min(MAX_CATCH_UP, (write - erased) / 2_500);
        end = write + ((text ? text.length * TYPE_SHARE : original.length * RESTORE_SHARE) * REFINE_MS_PER_CHAR) / fast;
        writers[lane] = end + GAP_MS;
      }
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
      start,
      erased,
      write,
      end,
      lane,
    });
  }
  return jobs;
}

/** When the whole run is over: the reader is through the text and the last suggestion is typed (Infinity until they are in). */
export function refineEndMs(jobs: RefineJob[], readMs: number): number {
  return Math.max(readMs, ...jobs.map((j) => j.end));
}

export type JobPhase =
  | { phase: "waiting" }
  /** R1 has turned the first `encoded` characters into code. */
  | { phase: "erasing"; encoded: number }
  /** Encoded, waiting for a writer. */
  | { phase: "drafting" }
  | { phase: "typing"; typed: number }
  /** A kept sentence decoded back to its own words. */
  | { phase: "restoring"; restored: number }
  /** A kept sentence R1 never encoded, being checked. */
  | { phase: "checking" }
  | { phase: "done" };

/** Where a job is at `t`. */
export function jobPhase(job: RefineJob, t: number): JobPhase {
  if (t < job.start) return { phase: "waiting" };
  if (t >= job.end) return { phase: "done" };
  if (job.erased === job.start && job.known && !job.rewrite) return { phase: "checking" };
  if (t < job.erased) {
    const f = (t - job.start) / Math.max(1, job.erased - job.start);
    return { phase: "erasing", encoded: Math.min(job.original.length, Math.floor(job.original.length * f)) };
  }
  if (t < job.write) return { phase: "drafting" };
  const f = (t - job.write) / Math.max(1, job.end - job.write);
  if (!job.rewrite) return { phase: "restoring", restored: Math.min(job.original.length, Math.floor(job.original.length * f)) };
  return { phase: "typing", typed: Math.min(job.rewrite.length, Math.floor(job.rewrite.length * f)) };
}

const draftShare = (ms: number) => ENCODED_SHARE + (DRAFT_SHARE - ENCODED_SHARE) * (1 - Math.exp(-Math.max(0, ms) / DRAFT_DRIFT_MS));

/**
 * How much of a counted sentence's drop is shown at `t`, 0 to 1: a share as R1 encodes it, a little more while it
 * waits for a writer, the rest as the suggestion is typed. Exactly 1 once a suggestion is typed and 0 for a sentence
 * kept as written, so the end is the real projection.
 */
export function clearedShare(job: RefineJob, t: number): number {
  if (!job.counts) return 0;
  const ph = jobPhase(job, t);
  const len = (s: string | null) => Math.max(1, s?.length ?? 0);
  switch (ph.phase) {
    case "waiting":
    case "checking":
      return 0;
    case "erasing":
      return ENCODED_SHARE * (ph.encoded / len(job.original));
    case "drafting":
      return draftShare(t - job.erased);
    case "typing":
      return draftShare(job.write - job.erased) + (1 - draftShare(job.write - job.erased)) * (ph.typed / len(job.rewrite));
    case "restoring":
      return draftShare(job.write - job.erased) * (1 - ph.restored / len(job.original));
    case "done":
      return job.rewrite ? 1 : 0;
  }
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
 * The projected rate as shown at `t`: projectedScore with each counted sentence's share of the way (clearedShare),
 * so it falls smoothly with the rewrite and lands exactly on projectedScore(rate, clearedBy(jobs, Infinity)).
 */
export function projectedAt(rate: RefineRate, jobs: RefineJob[], t: number): number {
  return projectedScore(rate, jobs.reduce((sum, j) => sum + clearedShare(j, t), 0));
}

/* ------------------------------------------------------------------
   What the rewrite agents say. Like the scan's agents, their lines name the
   sentence being worked on and what was kept, never how it was judged.
   ------------------------------------------------------------------ */

export function queuedLine(x: { p: number; s: number; text: string }): LogLine {
  return { tone: "violet", text: `P${x.p} S${x.s} flagged → queued for rewrite · ${quote(x.text, 30)}` };
}

export function eraseLine(j: RefineJob): LogLine {
  return { tone: "risk", text: `R1 ENCODE · P${j.p} S${j.s} · ${j.original.length} chars → code` };
}

export function draftLine(j: RefineJob): LogLine {
  return { tone: "dim", text: `R1 ENCODE · P${j.p} S${j.s} encoded · handed to the writers` };
}

/** Writers are named R2a, R2b, R2c. */
export const writerName = (lane: number) => `R2${String.fromCharCode(97 + Math.max(0, lane))}`;

export function writeLine(j: RefineJob): LogLine {
  return { tone: "info", text: `${writerName(j.lane)} WRITE · P${j.p} S${j.s} · +${j.rewrite?.length ?? 0} chars · ${quote(j.rewrite ?? "", 34)}` };
}

/** R3 GUARD, when a suggestion is in: it passed every check (rewrite.ts checkRewrite), and its length against the original. */
export function guardLine(j: RefineJob): LogLine {
  const ratio = Math.round(((j.rewrite?.length ?? 0) / Math.max(1, j.original.length)) * 100);
  return { tone: "ok", text: `R3 GUARD · P${j.p} S${j.s} ✓ facts, names, citations, hedges kept · length ${ratio}%` };
}

export function keptLine(j: RefineJob): LogLine {
  const restored = j.erased > j.start;
  return { tone: "warn", text: `R3 GUARD · P${j.p} S${j.s} kept as you wrote it${restored ? " · decoded back" : ""}${j.kept ? ` · ${j.kept}` : ""}` };
}
