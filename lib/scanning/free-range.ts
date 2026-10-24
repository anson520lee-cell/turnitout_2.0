/**
 * The free scan shows its AI score only as a 20-point range (Jordan,
 * 2026-10-20): 0–20, 20–40, … 80–100. The exact score is for the paid report.
 * The range comes from the free scan's own result: the share of its sentences
 * that stand out (moderate or elevated), on the same AI-score curve the report
 * uses, never lower than the scan's overall level allows.
 */

import { SCORE_BANDS, SCORE_CURVE, aiScore, type ScoreCurve } from "@/lib/auto-report/stitch";
import type { RiskLevel, SentenceSignal } from "./types";

export interface FreeRange {
  lo: number;
  hi: number;
  /** The colour band of the range's middle. */
  level: RiskLevel;
}

export const isStandout = (l: RiskLevel) => l !== "low";

/** Share (0 to 1) of sentences that stand out, or undefined when there are none to count. */
export function standoutShare(sentences: Pick<SentenceSignal, "level">[] | undefined): number | undefined {
  if (!sentences?.length) return undefined;
  return sentences.filter((s) => isStandout(s.level)).length / sentences.length;
}

/** The lowest range each overall level allows, so the range never reads lower than the level. */
const FLOOR: Record<RiskLevel, number> = { low: 0, moderate: 1, elevated: 3 };
/** Without a share (scans saved before ranges existed), the level alone picks the range. */
const FROM_LEVEL: Record<RiskLevel, number> = { low: 0, moderate: 2, elevated: 3 };

export function rangeLevel(lo: number, hi: number): RiskLevel {
  const mid = (lo + hi) / 200;
  return mid >= SCORE_BANDS.elevated ? "elevated" : mid >= SCORE_BANDS.moderate ? "moderate" : "low";
}

/** `curve` is the one the share is read on: COUNTED_CURVE for the written review's counted share, SCORE_CURVE for the stand-out share. */
export function freeRange(share: number | undefined, level: RiskLevel, curve: ScoreCurve = SCORE_CURVE): FreeRange {
  const idx = share === undefined ? FROM_LEVEL[level] : Math.max(FLOOR[level], Math.min(4, Math.floor(aiScore(share, curve) * 5)));
  const lo = idx * 20;
  return { lo, hi: lo + 20, level: rangeLevel(lo, lo + 20) };
}

/**
 * What the free scan's range gauge shows while it is still reading (Jordan,
 * 2026-10-20: it must be measured from the visitor's own text, like the paid
 * report's live rate, not a drawn climb). It is the AI score of the share of
 * sentences read so far that stand out, so it goes up on a stand-out sentence
 * and down on a clear one. From the middle of the text on it is drawn gently into
 * the finished result's own range, which can sit higher than the sentences
 * alone when the written review raised it.
 */
export function liveScore(runningShare: number, progress: number, finalShare: number | undefined, final: FreeRange, finalCurve: ScoreCurve = SCORE_CURVE): number {
  const own = finalShare === undefined ? final.lo + 10 : aiScore(finalShare, finalCurve) * 100;
  const end = Math.max(final.lo + 1, Math.min(final.hi - 1, own));
  const w = Math.pow(Math.max(0, Math.min(1, (progress - 0.5) / 0.5)), 1.5);
  return aiScore(runningShare) * 100 * (1 - w) + end * w;
}

/** The 20-point range a live score falls in. */
export function rangeOf(score: number): FreeRange {
  const idx = Math.max(0, Math.min(4, Math.floor(score / 20)));
  return { lo: idx * 20, hi: idx * 20 + 20, level: rangeLevel(idx * 20, idx * 20 + 20) };
}
