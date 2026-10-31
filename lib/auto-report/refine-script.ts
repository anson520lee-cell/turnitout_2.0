/**
 * The script behind the live rewrite a customer watches while Writing Refinement runs (components/reports/refine).
 * Pure functions, no I/O, so they can be tested.
 *
 * Everything it shows comes from the finished report (which sentences were flagged, which count toward the AI
 * score) and the real suggestions (each sentence's rewrite, or why it was kept). It replays them over the text at a
 * fixed pace per character, 1.2 times the live report scan's: a reader goes through the text as in the report
 * scan, and right behind it R1 erases each flagged sentence and R2 types its suggestion, character by character.
 * The suggestions come in one by one as the writer finishes them (rewrite-run.ts streams them); R1 and R2 rewrite
 * each sentence as soon as both the reader has passed it and its suggestion is in. The reader never waits.
 *
 * On a real order the rate falls from the first rewritten sentence, a show that wobbles like a share price (liveAt,
 * liveDrift, liveWobble), and then walks to the scores the detector gives the rewritten text (rewrite-check.ts), one
 * per round, sentence by sentence over the re-check's own verdicts (landLevels); the view ends on the best round's
 * real score. Only that end is a result: the figure it ends on is never an estimate (Neo, 2026-10-29: it had ended
 * on a projected 1% that the re-check put at 98%; 2026-10-31: the way there is only for the customer to watch). The
 * re-check and any later round run as part of the view (recheckStartLine, recheckedLine). The design previews, which
 * have no re-check, show the projection below instead: the report's own score with the rewritten sentences no longer
 * counted, labelled "projected".
 */

import { SCORE_BANDS, aiScore, scoreBasis, type AutoReportResult, type ReportSentence, type ScoreCurve } from "./stitch";
import { INTRO_MS, SCAN_MS_PER_CHAR, isFlagged, planFromSentences, quote, type LogLine, type ScanPlan } from "./scan-script";
import { pickFlagged, type RewriteCheck, type RewriteItem } from "./rewrite";

/** How much faster the rewrite runs than the report scan, per character (Neo, 2026-10-27). */
export const REFINE_SPEEDUP = 1.2;
/** Milliseconds of reading per character: the report scan's rate, 1.2 times faster. */
export const REFINE_MS_PER_CHAR = SCAN_MS_PER_CHAR / REFINE_SPEEDUP;
/** The opening sequence, 1.2 times shorter than the report scan's. */
export const REFINE_INTRO_MS = INTRO_MS / REFINE_SPEEDUP;
/** R1 starts on a flagged sentence this long after the reader has finished it, so it works right on the reader's tail. */
export const CHASE_MS = 450;
/** Erasing a character takes this share of reading one (a fast backspace). */
export const ERASE_SHARE = 0.15;
/** Typing a character of the suggestion takes this share of reading one: R2 types faster than A1 reads, so it keeps up. */
export const TYPE_SHARE = 0.4;
/** A flagged sentence that keeps its own wording is looked at for this long. */
const KEPT_MS = 700;
const GAP_MS = 120;
/** R1 and R2 work faster when they start behind the reader, to catch up: at most 1 + this many times as fast. */
const MAX_CATCH_UP = 1.5;

/** The text as the report split it, so sentence numbers match the suggestions exactly. */
export function refinePlan(result: AutoReportResult): ScanPlan {
  return planFromSentences(result.paragraphs.flatMap((p) => p.sentences.map((s) => ({ p: p.p, text: s.text }))));
}

/** How long the reader takes to go through the text at its normal pace: a fixed rate per character, 1.2 times the report scan's. */
export function refineReadMs(chars: number): number {
  return Math.max(1, Math.round(chars * REFINE_MS_PER_CHAR));
}

/** How far through the text the reader is at `t` (ms on the scan clock), 0 to 1. It goes at one pace and never waits. */
export function readerAt(t: number, readMs: number): number {
  return Math.min(1, Math.max(0, t) / readMs);
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
  /** False until its suggestion is in; until then `rewrite` is null and `start`, `erased` and `end` are Infinity. */
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
  /** Erasing ends (equals `start` for a kept sentence). */
  erased: number;
  /** R2 starts typing: as soon as it is erased, or once R2 has finished the sentence before. */
  typeAt: number;
  end: number;
  /** How R2 types the suggestion, with its second thoughts (see draftStrokes); empty for a kept sentence. */
  strokes: Stroke[];
}

/** A suggestion as it came in: when (ms on the scan clock) and what. */
export interface Arrival {
  at: number;
  item: RewriteItem;
}

/**
 * The rewriter's timetable. R1 marks each flagged sentence just behind the reader. A sentence is rewritten once the
 * reader has passed it and its suggestion is in (`arrivals`, by sentence number): R1 erases it and R2 types the
 * suggestion, one sentence after another in the order they become ready. One that starts well behind the reader is
 * done faster, to catch up. A suggestion that comes in later never moves work that is already under way.
 */
export function refineJobs(plan: ScanPlan, result: AutoReportResult, arrivals: ReadonlyMap<number, Arrival>, readMs = refineReadMs(plan.chars)): RefineJob[] {
  const index = new Map(plan.sentences.map((x, i) => [x.n, i]));
  const byN = new Map(result.paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s]));
  const counts = countsFor(result);
  const queue = pickFlagged(result)
    .map((s) => s.n)
    .filter((n) => index.has(n))
    .sort((a, b) => a - b);
  const jobs: RefineJob[] = queue.map((n) => {
    const i = index.get(n)!;
    const x = plan.sentences[i];
    const got = arrivals.get(n);
    const it = got?.item;
    const passed = passedAt(plan, i, readMs);
    return {
      i,
      n,
      p: x.p,
      s: x.s,
      original: it?.original ?? x.text,
      known: Boolean(got),
      rewrite: it?.rewrite ?? null,
      ...(it?.why ? { why: it.why } : {}),
      ...(got && !it?.rewrite ? { kept: it?.kept ?? "no suggestion came back" } : {}),
      counts: counts(byN.get(n)),
      passed,
      mark: passed + CHASE_MS,
      start: Infinity,
      erased: Infinity,
      typeAt: Infinity,
      end: Infinity,
      strokes: it?.rewrite ? draftStrokes(it.original, it.rewrite, n) : [],
    };
  });
  // Work through the sentences in the order they become ready (reader past it and suggestion in). R1 and R2 are a
  // pipeline: R1 erases the next sentence while R2 is still typing the one before.
  const ready = (j: RefineJob) => Math.max(j.mark, arrivals.get(j.n)!.at);
  let r1 = 0;
  let r2 = 0;
  for (const j of jobs.filter((x) => x.known).sort((a, b) => ready(a) - ready(b) || a.n - b.n)) {
    j.start = Math.max(ready(j), r1);
    const fast = 1 + Math.min(MAX_CATCH_UP, (j.start - j.mark) / 2_500);
    if (j.rewrite) {
      j.erased = j.start + (j.original.length * ERASE_SHARE * REFINE_MS_PER_CHAR) / fast;
      j.typeAt = Math.max(j.erased, r2);
      j.end = j.typeAt + strokesMs(j.strokes) / fast;
      r1 = j.erased + GAP_MS;
      r2 = j.end + GAP_MS;
    } else {
      j.erased = j.typeAt = j.start;
      j.end = j.start + KEPT_MS / fast;
      r1 = j.end + GAP_MS;
    }
  }
  return jobs;
}

/** When the whole run is over: the reader is through the text and the last suggestion is typed (Infinity while any is still out). */
export function refineEndMs(jobs: RefineJob[], readMs: number): number {
  return Math.max(readMs, ...jobs.map((j) => j.end));
}

export type JobPhase =
  | { phase: "waiting" }
  /** R1 has marked it; the suggestion isn't being written yet. */
  | { phase: "marked" }
  /** Characters of the original still standing. */
  | { phase: "erasing"; left: number }
  /**
   * R2 at work: `text` is what stands now (with its second thoughts, so not always a prefix of the suggestion),
   * `typed` how much of the suggestion stands, `deleting` whether it is taking something back, `f` how far through
   * the sentence it is (0 to 1, only ever up).
   */
  | { phase: "typing"; typed: number; text: string; deleting: boolean; f: number }
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
  // Erased, R2 still on the sentence before.
  if (t < job.typeAt) return { phase: "erasing", left: 0 };
  const f = Math.min(1, (t - job.typeAt) / Math.max(1, job.end - job.typeAt));
  const { text, deleting } = strokesAt(job.strokes, f * strokesMs(job.strokes));
  let typed = 0;
  while (typed < text.length && text[typed] === job.rewrite[typed]) typed++;
  return { phase: "typing", typed, text, deleting, f };
}

/* ------------------------------------------------------------------
   How R2 types a suggestion: like a person, with second thoughts. Now and
   then it types a phrase from the original sentence and takes it back for
   the new wording, hits a wrong key and corrects it, or deletes the last
   word or two and types them again. Keystrokes stay fast; the sentence just
   takes longer. Every stroke ends on the suggestion exactly.
   ------------------------------------------------------------------ */

/** One step: the text goes from what the previous step left to `text`, over `ms`. */
export interface Stroke {
  kind: "type" | "delete" | "hold";
  text: string;
  ms: number;
}

const KEY_MS = TYPE_SHARE * REFINE_MS_PER_CHAR;
const BACKSPACE_MS = ERASE_SHARE * REFINE_MS_PER_CHAR;
/** A second thought stays on screen this long before it is taken back. */
const SEE_MS = 240;
const TYPO_SEE_MS = 130;
/** About one second thought per this many words, at least one and at most MAX_THOUGHTS. */
const WORDS_PER_THOUGHT = 4;
const MAX_THOUGHTS = 6;

/** A small seeded random source, so a sentence is always typed the same way. */
function seeded(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

const NEAR_KEYS = "qwertyuiopasdfghjklzxcvbnm";
function wrongKey(c: string): string {
  const k = NEAR_KEYS.indexOf(c.toLowerCase());
  if (k < 0) return "e";
  return NEAR_KEYS[(k + 1) % NEAR_KEYS.length];
}

/** R2's strokes for one suggestion (seeded by the sentence number). */
export function draftStrokes(original: string, rewrite: string, seed: number): Stroke[] {
  const words = rewrite.match(/\S+\s*/g) ?? [rewrite];
  const theirs = original.match(/\S+\s*/g) ?? [];
  const rand = seeded(seed);
  const out: Stroke[] = [];
  let cur = "";
  const type = (add: string) => {
    if (!add) return;
    cur += add;
    out.push({ kind: "type", text: cur, ms: add.length * KEY_MS });
  };
  const back = (k: number) => {
    if (k <= 0) return;
    cur = cur.slice(0, cur.length - k);
    out.push({ kind: "delete", text: cur, ms: k * BACKSPACE_MS });
  };
  const hold = (ms: number) => out.push({ kind: "hold", text: cur, ms });

  // Where the second thoughts go: word boundaries spread through the sentence, never at its very start or end.
  const want = Math.max(1, Math.min(MAX_THOUGHTS, Math.round(words.length / WORDS_PER_THOUGHT)));
  const at = new Set<number>();
  for (let k = 0; k < want * 4 && at.size < want && words.length > 2; k++) at.add(1 + Math.floor(rand() * (words.length - 2)));
  let kind = Math.floor(rand() * 3);
  words.forEach((word, w) => {
    if (at.has(w)) {
      kind = (kind + 1 + Math.floor(rand() * 2)) % 3;
      const from = theirs.length ? Math.min(theirs.length - 1, Math.floor((w / words.length) * theirs.length)) : -1;
      const phrase = from >= 0 ? theirs.slice(from, from + 1 + Math.floor(rand() * 2)).join("") : "";
      if (kind === 0 && phrase && !rewrite.slice(cur.length).startsWith(phrase)) {
        // The original wording first, then the new one.
        const draft = /\s$/.test(phrase) ? phrase : `${phrase} `;
        type(draft);
        hold(SEE_MS);
        back(draft.length);
      } else if (kind === 1 && word.trim().length > 3) {
        // A wrong key, caught at once.
        const k = 1 + Math.floor(rand() * Math.min(3, word.trim().length - 2));
        type(word.slice(0, k));
        type(wrongKey(word[k]));
        hold(TYPO_SEE_MS);
        back(1);
        type(word.slice(k));
        return;
      } else if (w >= 2) {
        // The last word or two again.
        const n = 1 + Math.floor(rand() * 2);
        const again = words.slice(Math.max(0, w - n), w).join("");
        back(again.length);
        hold(SEE_MS / 2);
        type(again);
      }
    }
    type(word);
  });
  if (cur !== rewrite) {
    back(cur.length);
    type(rewrite);
  }
  return out;
}

export function strokesMs(strokes: Stroke[]): number {
  return strokes.reduce((sum, x) => sum + x.ms, 0);
}

/** What stands `ms` into the strokes, and whether a stroke is taking something back. */
export function strokesAt(strokes: Stroke[], ms: number): { text: string; deleting: boolean } {
  let prev = "";
  let t = Math.max(0, ms);
  for (const x of strokes) {
    if (t < x.ms) {
      const f = t / Math.max(1e-9, x.ms);
      if (x.kind === "type") return { text: x.text.slice(0, prev.length + Math.floor((x.text.length - prev.length) * f)), deleting: false };
      if (x.kind === "delete") return { text: prev.slice(0, prev.length - Math.floor((prev.length - x.text.length) * f)), deleting: true };
      return { text: prev, deleting: false };
    }
    t -= x.ms;
    prev = x.text;
  }
  return { text: prev, deleting: false };
}

/* ------------------------------------------------------------------
   The polish pass of a real order. Once the rewrite is typed out the
   detector re-checks the whole text (about a minute or more a round, and
   while it still scores too high the writer rewrites again), and the view
   waits on it. Rather than a scan line over a still text, R1 and R2 go on
   working through the rewritten sentences, paragraph by paragraph and round
   again: each in turn has its last few words taken back and retyped, with a
   second thought, and R3 checks it again (Neo, 2026-10-31). The text always
   ends on the suggestion exactly; the real changes of a later round are put
   in by the re-check itself.
   ------------------------------------------------------------------ */

/** Each polish takes one slot: its strokes (squeezed to fit if long), then a rest while R3 checks the sentence. */
export const POLISH_SLOT_MS = 4_200;
const POLISH_REST_MS = 1_000;

/** The sentences R1 and R2 polish, in text order: every one with a suggestion. */
export function polishOrder(jobs: RefineJob[]): RefineJob[] {
  return jobs.filter((j) => j.rewrite).sort((a, b) => a.n - b.n);
}

/** Which polish runs `ms` into the pass (scan clock): its number, the sentence, and how far into its slot. */
export function polishAt(order: RefineJob[], ms: number): { k: number; job: RefineJob; into: number } | null {
  if (!order.length || ms < 0) return null;
  const k = Math.floor(ms / POLISH_SLOT_MS);
  return { k, job: order[k % order.length], into: ms - k * POLISH_SLOT_MS };
}

/** R2's strokes for one polish of `text`: the last two to five words taken back, then typed again with a second thought. */
export function polishStrokes(text: string, original: string, seed: number): Stroke[] {
  const words = text.match(/\S+\s*/g) ?? [text];
  const rand = seeded(seed);
  const n = words.length < 3 ? words.length : Math.min(words.length - 1, 2 + Math.floor(rand() * 4));
  const prefix = words.slice(0, words.length - n).join("");
  const tail = text.slice(prefix.length);
  const theirs = original.match(/\S+\s*/g) ?? [];
  const from = Math.floor(theirs.length * (prefix.length / Math.max(1, text.length)));
  const out: Stroke[] = [
    { kind: "hold", text, ms: 260 },
    { kind: "delete", text: prefix, ms: tail.length * BACKSPACE_MS },
    { kind: "hold", text: prefix, ms: 200 },
  ];
  for (const x of draftStrokes(theirs.slice(from).join(""), tail, seed)) out.push({ ...x, text: prefix + x.text });
  return out;
}

/** Where a polish of `text` is, `into` its slot: R2 at work on it, or done (resting while R3 checks it). */
export function polishPhase(text: string, original: string, seed: number, into: number): JobPhase {
  const strokes = polishStrokes(text, original, seed);
  const ms = strokesMs(strokes);
  const room = POLISH_SLOT_MS - POLISH_REST_MS;
  const at = into * Math.max(1, ms / room);
  if (at >= ms) return { phase: "done" };
  const now = strokesAt(strokes, at);
  let typed = 0;
  while (typed < now.text.length && now.text[typed] === text[typed]) typed++;
  return { phase: "typing", typed, text: now.text, deleting: now.deleting, f: at / ms };
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
  if (ph.phase === "typing") return ERASED_SHARE + (1 - ERASED_SHARE) * ph.f;
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
 * the drop; the chart instead walks evenly from the original rate to the projection, each counted sentence taking an
 * equal step as it is erased and typed (clearedShare). While suggestions are still out it assumes each of them will
 * be rewritten; once all are in it lands exactly on projectedScore(rate, clearedBy(jobs, Infinity)).
 */
export function projectedAt(rate: RefineRate, jobs: RefineJob[], t: number): number {
  const total = jobs.filter((j) => j.counts && (j.rewrite || !j.known)).length;
  if (!total) return rate.original;
  const done = jobs.reduce((sum, j) => sum + clearedShare(j, t), 0);
  const end = projectedScore(rate, total);
  if (done >= total) return end;
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
  return { tone: "ok", text: `R3 GUARD · P${j.p} S${j.s} ✓ numbers, names, citations kept · length ${ratio}%` };
}

export function keptLine(j: RefineJob): LogLine {
  return { tone: "warn", text: `R3 GUARD · P${j.p} S${j.s} kept as you wrote it${j.kept ? ` · ${j.kept}` : ""}` };
}

/* ------------------------------------------------------------------
   The re-check of a real order, once the rewrite is typed out: the
   detector reviews the rewritten text, and while it still scores too high
   the sentences it still counts are rewritten again (rewrite-run.ts
   makeRound), round by round. What the agents say about it.
   ------------------------------------------------------------------ */

/** What runs while a real order's rewritten text is re-checked: the detector on a round, or the writer on the next round. */
export interface RecheckStep {
  kind: "check" | "round";
  round: number;
  /** When it started (performance.now()). */
  since: number;
}

const whole = (v: number) => `${Math.round(v * 100)}%`;

export function recheckStartLine(step: Pick<RecheckStep, "kind" | "round">): LogLine {
  return step.kind === "check"
    ? { tone: "info", text: `R4 RE-CHECK · round ${step.round} · your text with every suggestion in place → the same detector as your report` }
    : { tone: "violet", text: `ROUND ${step.round} · R1 + R2 rewrite again what the detector still counts · kept only if it re-checks lower` };
}

/** The re-checked score of round `k + 1` (0-based `k` in `scores`), against the best round before it. */
export function recheckedLine(scores: number[], k: number): LogLine {
  const score = scores[k];
  const before = scores.slice(0, k);
  if (!before.length) return { tone: score < SCORE_BANDS.moderate ? "ok" : "warn", text: `R4 RE-CHECK · round 1 · ${whole(score)} on the same detector as your report` };
  const best = Math.min(...before);
  return score < best
    ? { tone: "ok", text: `R4 RE-CHECK · round ${k + 1} · ${whole(score)} · lower than ${whole(best)}, this round is kept` }
    : { tone: "warn", text: `R4 RE-CHECK · round ${k + 1} · ${whole(score)} · not lower than ${whole(best)}, round ${before.indexOf(best) + 1} stays` };
}

/** How many of the rewritten sentences the kept round's re-check still counts. */
export function stillLine(check: Pick<RewriteCheck, "stillCounted" | "cleared">): LogLine {
  const total = check.stillCounted.length + check.cleared.length;
  return { tone: check.stillCounted.length ? "warn" : "ok", text: `R4 · ${check.stillCounted.length} of ${total} rewritten sentence${total === 1 ? "" : "s"} still read${total === 1 ? "s" : ""} as AI · ${check.cleared.length} cleared` };
}

/** Counted sentences in a re-check: the real "Counted" figure once there is one. */
export function countedIn(check: Pick<RewriteCheck, "result">): number {
  return check.result.paragraphs.reduce((sum, p) => sum + p.sentences.filter((s) => s.counts).length, 0);
}

/* ------------------------------------------------------------------
   The live rate of a real order (Neo, 2026-10-31: "from the first
   rewritten sentence the AI rate falls, like the report scan; it can move
   like a share price; only the end has to be the real result"). No extra
   detector run: while the rewrite is typed and re-checked the rate is a
   show, falling with each rewritten sentence and wobbling; when a re-check
   lands it walks to that round's real score over the re-check's own
   verdicts, and the view ends on the best round's real score.
   ------------------------------------------------------------------ */

/**
 * How far the live rate falls while the rewrite is typed: this share of the way from the report's score to the
 * projection. The projection is often far below what the re-check gives (a projected 1% re-checked at 98%,
 * 2026-10-29; re-checks of 100% essays came back at 0 to 100, about 36 on average, 2026-10-29), so the show stops
 * well short of it and the re-check takes it the rest of the way, down or back up.
 */
export const LIVE_DEPTH = 0.5;
/** While a re-check runs, the rate drifts on down by up to this share of what is left to the projection ... */
const DRIFT_SHARE = 0.3;
/** ... and at most this much, reaching most of it in about this long (ms, scan clock). */
const DRIFT_MAX = 0.15;
const DRIFT_MS = 45_000;
/** The share-price wobble on top: at most this far either way, a new swing about this often (ms, scan clock). */
const WOBBLE = 0.018;
const WOBBLE_MS = 1_400;
/** A re-check whose verdicts are not at hand (a round that did not beat the best) is walked to in this many steps. */
const LAND_STEPS = 8;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A fixed pseudo-random number in [0, 1) for an integer, so the show is the same on every render. */
export function hash01(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4_294_967_296;
}

/**
 * Each rewritten counted sentence's share of the live fall: uneven, and now and then (never on the first two) one
 * that ticks the rate back up a little, like a share price.
 */
function liveWeight(n: number, k: number): number {
  return k >= 2 && hash01(n * 7 + 3) < 0.16 ? -0.4 : 0.4 + 1.4 * hash01(n * 13 + 1);
}

/**
 * The live rate at `t` (scan clock) while the rewrite is typed, before the wobble: from the report's score, each
 * counted sentence takes its step (liveWeight) as it is erased and typed (clearedShare), so the rate starts falling
 * with the first rewritten sentence and ends LIVE_DEPTH of the way to the projection. While suggestions are still
 * out it assumes each will be rewritten, like projectedAt.
 */
export function liveAt(rate: RefineRate, jobs: RefineJob[], t: number): number {
  const moving = jobs.filter((j) => j.counts && (j.rewrite || !j.known)).sort((a, b) => a.n - b.n);
  if (!moving.length) return rate.original;
  const w = moving.map((j, k) => liveWeight(j.n, k));
  const total = w.reduce((a, b) => a + b, 0);
  const end = rate.original - (rate.original - projectedScore(rate, moving.length)) * LIVE_DEPTH;
  const done = moving.reduce((sum, j, k) => sum + w[k] * clearedShare(j, t), 0);
  return clamp01(rate.original + ((end - rate.original) * done) / total);
}

/**
 * The live rate `ms` (scan clock) into a wait for a re-check, before the wobble: from `base` it keeps drifting down
 * toward `floor` (the projection), a little and ever slower, so the line never just stops while the detector works.
 */
export function liveDrift(base: number, floor: number, ms: number): number {
  const depth = Math.min(DRIFT_MAX, Math.max(0, base - floor) * DRIFT_SHARE);
  return clamp01(base - depth * (1 - Math.exp(-Math.max(0, ms) / DRIFT_MS)));
}

/**
 * The share-price wobble at `at` (scan clock) around a level: smooth swings between fixed random points, at most
 * WOBBLE either way and less near 0 so a low rate is not pushed under it. Same `at` and `seed`, same wobble.
 */
export function liveWobble(at: number, seed: number, level: number): number {
  const x = Math.max(0, at) / WOBBLE_MS;
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = hash01(seed * 131 + i) * 2 - 1;
  const b = hash01(seed * 131 + i + 1) * 2 - 1;
  return (a + (b - a) * s) * Math.min(WOBBLE, level * 0.4);
}

/**
 * The rate walking from where the show stands (`from`) to a round's real score (`to`) when its re-check lands, one
 * rewritten sentence at a time in text order, from the re-check's own verdicts: going down, each sentence it newly
 * cleared takes the rate down and each it still counts ticks it back up a little; going up (the re-check scored
 * above the show), the other way round. Without the verdicts (a round that did not beat the best) it walks there in
 * LAND_STEPS uneven steps. The last step is exactly `to`. `seen`: sentences an earlier round already cleared, which
 * leave the rate where it is.
 */
export function landLevels(opts: { from: number; to: number; check: Pick<RewriteCheck, "stillCounted" | "cleared"> | null; seen: ReadonlySet<number>; seed: number }): number[] {
  const { from, to, check, seen, seed } = opts;
  if (Math.abs(to - from) < 0.005) return [to];
  const down = to < from;
  let w: number[];
  if (check && check.cleared.length + check.stillCounted.length) {
    const steps = [...check.cleared.map((n) => ({ n, cleared: true })), ...check.stillCounted.map((n) => ({ n, cleared: false }))].sort((a, b) => a.n - b.n);
    w = steps.map((st, k) => {
      const fresh = st.cleared && !seen.has(st.n);
      const along = down ? fresh : !st.cleared;
      const against = down ? !st.cleared : fresh;
      return along ? 0.6 + 0.8 * hash01(seed * 977 + st.n) : against && k ? -0.25 * hash01(seed * 31 + st.n) : 0;
    });
  } else {
    w = Array.from({ length: LAND_STEPS }, (_, k) => (k && hash01(seed * 53 + k) < 0.2 ? -0.3 : 0.5 + hash01(seed * 71 + k)));
  }
  let sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 1e-6) {
    w = w.map(() => 1);
    sum = w.length;
  }
  let acc = 0;
  const levels = w.map((x) => clamp01(from + ((to - from) * (acc += x)) / sum));
  levels[levels.length - 1] = to;
  return levels;
}
