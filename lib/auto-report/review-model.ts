import "server-only";

import { deepseekRun, type ReasoningEffort } from "@/lib/deepseek";
import { finishReview, parseReviewPiece, reviewInput, type PreparedReview, type ReviewPiece } from "./review";
import { calibrateReview } from "./calibration";
import type { PieceRead } from "./stitch";

export const REVIEW_TIMEOUT_MS = 80_000;
export const REVIEW_CONCURRENCY = 6;
export const REVIEW_CONTEXT_CHARS = 900;

export function finishProductionReview(review: PreparedReview, reads: ReadonlyMap<number, PieceRead>) {
  const ready = finishReview(review, reads, "supporting");
  return ready ? calibrateReview(ready) : null;
}

export async function requestReviewPiece(
  piece: ReviewPiece,
  system: string,
  settings: { model: string; effort: ReasoningEffort },
  timeoutMs = REVIEW_TIMEOUT_MS,
) {
  const result = await deepseekRun({
    system, user: reviewInput(piece), ...settings,
    maxTokens: 24_000, timeoutMs, totalTimeoutMs: timeoutMs,
  });
  return { result, read: result.truncated ? null : parseReviewPiece(piece, result.text) };
}
