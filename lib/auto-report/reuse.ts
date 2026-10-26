import { createHash } from "node:crypto";

/**
 * Checking the very same text again shows the first result again: the reviewer's judgement varies a little from
 * run to run, so an identical text could otherwise get 6% one time and 44% the next. These two fingerprints let a
 * new report find the first finished report of the same text by the same account (lib/auto-report/run.ts). They
 * are kept inside the saved result (AutoReportResult.reuse), so no database column is needed; only hashes are kept.
 */

/** Bump to stop old results being reused (for example after the scoring logic changes). */
const REUSE_VERSION = 1;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** Identical text apart from line-ending style and spaces at the ends counts as the same text. */
export function textHash(text: string): string {
  return hash(text.replace(/\r\n?/g, "\n").trim());
}

/** How a report was made. A result is only reused when the prompt, model, reasoning effort and piece size are all the same. */
export function reportBasis(parts: { prompt: string; model: string; effort: string; pieceSize: number }): string {
  return hash(JSON.stringify([REUSE_VERSION, parts.prompt, parts.model, parts.effort, parts.pieceSize]));
}
