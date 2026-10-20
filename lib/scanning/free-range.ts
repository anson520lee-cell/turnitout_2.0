/**
 * The free scan shows its AI score only as a 20-point range (Jordan,
 * 2026-10-20): 0–20, 20–40, … 80–100. The exact score is for the paid report.
 * The range comes from the free scan's own result: the share of its sentences
 * that stand out (moderate or elevated), on the same AI-score curve the report
 * uses, never lower than the scan's overall level allows.
 */

import { SCORE_BANDS, aiScore } from "@/lib/auto-report/stitch";
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

export function freeRange(share: number | undefined, level: RiskLevel): FreeRange {
  const idx = share === undefined ? FROM_LEVEL[level] : Math.max(FLOOR[level], Math.min(4, Math.floor(aiScore(share) * 5)));
  const lo = idx * 20;
  return { lo, hi: lo + 20, level: rangeLevel(lo, lo + 20) };
}
