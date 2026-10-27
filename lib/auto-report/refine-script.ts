/**
 * The script behind the live rewrite a customer watches while Writing Refinement runs (components/reports/refine).
 * Pure functions, no I/O, so they can be tested.
 *
 * Everything it shows comes from the finished report (which sentences were flagged, which count toward the AI
 * score) and the real suggestions (each sentence's rewrite, or why it was kept). It replays them over the text at a
 * fixed pace per character, 1.2 times the live report scan's: a reader goes through the text as in the report
 * scan, and behind it each flagged sentence is erased and its suggestion typed out, character by character.
 *
 * The falling AI rate is a projection, not a new score: the report's own score with the rewritten sentences no
 * longer counted. The text is not reviewed again here (see rewrite-run.ts), so the view says "projected".
 */

import { aiScore, scoreBasis, type AutoReportResult, type ReportSentence, type ScoreCurve } from "./stitch";
import { INTRO_MS, SCAN_MS_PER_CHAR, isFlagged, planFromSentences, quote, type LogLine, type ScanPlan } from "./scan-script";
import type { ReportRewrite } from "./rewrite";

/** How much faster the rewrite runs than the report scan, per character (Neo, 2026-10-27). */
export const REFINE_SPEEDUP = 1.2;
/** Milliseconds of reading per character: the report scan's rate, 1.2 times faster. */
export const REFINE_MS_PER_CHAR = SCAN_MS_PER_CHAR / REFINE_SPEEDUP;
/** The opening sequence, 1.2 times shorter than the report scan's. */
export const REFINE_INTRO_MS = INTRO_MS / REFINE_SPEEDUP;
/** Erasing a character takes this share of reading one (a fast backspace). */
export const ERASE_SHARE = 0.3;
/** Typing a character of the suggestion takes this share of reading one. */
export const TYPE_SHARE = 0.75;
/** A flagged sentence that keeps its own wording is looked at for this long. */
const KEPT_MS = 700;
const GAP_MS = 120;

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
  /** The suggestion, or null when the sentence keeps its own wording. */
  rewrite: string | null;
  why?: string;
  kept?: string;
  /** Counts toward the AI score, so rewriting it lowers the projected rate. */
  counts: boolean;
  /** When the reader finished the sentence (ms, scan clock). */
  passed: number;
  /** Erasing starts. */
  start: number;
  /** Erasing ends and typing starts (equals `start` for a kept sentence). */
  erased: number;
  end: number;
}

/**
 * The rewriter's timetable. Each suggested sentence is erased and retyped once the reader has passed it and the
 * suggestions are in (`resultAt`, ms on the scan clock), one after another. When it starts late (the suggestions
 * came after the reader had gone past) it works faster, up to four times, to catch up.
 */
export function refineJobs(plan: ScanPlan, result: AutoReportResult, rewrite: ReportRewrite, resultAt: number, readMs = refineReadMs(plan.chars)): RefineJob[] {
  const index = new Map(plan.sentences.map((x, i) => [x.n, i]));
  const byN = new Map(result.paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s]));
  const counts = countsFor(result);
  const items = rewrite.items.filter((it) => index.has(it.n)).sort((a, b) => a.n - b.n);
  const jobs: RefineJob[] = [];
  let free = 0;
  for (const it of items) {
    const i = index.get(it.n)!;
    const x = plan.sentences[i];
    const passed = passedAt(plan, i, readMs);
    const start = Math.max(passed, resultAt, free);
    const fast = 1 + Math.min(3, (start - passed) / 2_500);
    const erase = it.rewrite ? (it.original.length * ERASE_SHARE * REFINE_MS_PER_CHAR) / fast : 0;
    const type = it.rewrite ? (it.rewrite.length * TYPE_SHARE * REFINE_MS_PER_CHAR) / fast : KEPT_MS / fast;
    const end = start + erase + type;
    jobs.push({
      i,
      n: it.n,
      p: x.p,
      s: x.s,
      original: it.original,
      rewrite: it.rewrite,
      ...(it.why ? { why: it.why } : {}),
      ...(it.kept ? { kept: it.kept } : {}),
      counts: counts(byN.get(it.n)),
      passed,
      start,
      erased: start + erase,
      end,
    });
    free = end + GAP_MS;
  }
  return jobs;
}

/** When the whole run is over: the reader is through the text and the last suggestion is typed. */
export function refineEndMs(jobs: RefineJob[], readMs: number): number {
  return Math.max(readMs, ...jobs.map((j) => j.end));
}

export type JobPhase = { phase: "waiting" } | { phase: "erasing"; left: number } | { phase: "typing"; typed: number } | { phase: "done" };

/** Where a job is at `t`: characters of the original still standing while erasing, characters typed while typing. */
export function jobPhase(job: RefineJob, t: number): JobPhase {
  if (t < job.start) return { phase: "waiting" };
  if (t >= job.end) return { phase: "done" };
  if (!job.rewrite) return { phase: "typing", typed: 0 };
  if (t < job.erased) {
    const f = (t - job.start) / Math.max(1, job.erased - job.start);
    return { phase: "erasing", left: Math.max(0, Math.ceil(job.original.length * (1 - f))) };
  }
  const f = (t - job.erased) / Math.max(1, job.end - job.erased);
  return { phase: "typing", typed: Math.min(job.rewrite.length, Math.floor(job.rewrite.length * f)) };
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
  if (!rate.counted) return rate.original;
  const left = Math.max(0, rate.counted - cleared) / rate.counted;
  return aiScore(rate.share * left, rate.curve);
}

/** Counted sentences whose suggestion has been typed by `t`. */
export function clearedBy(jobs: RefineJob[], t: number): number {
  return jobs.filter((j) => j.rewrite && j.counts && t >= j.end).length;
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
