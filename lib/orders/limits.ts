import { freeScan, refinement } from "@/config/app";
import { screeningWordRange } from "@/config/pricing";

/**
 * Length rules for report and refinement requests, as plain functions so the
 * paste dialog (browser) and the zod schemas (server) give the same message.
 * The server always re-checks; the browser check is only for fast feedback.
 */

const n = (v: number) => v.toLocaleString("en-HK");

/** Null when `words` is inside the report range. */
export function screeningWordError(words: number): string | null {
  if (words < screeningWordRange.min) {
    return `A report needs at least ${n(screeningWordRange.min)} words. This text has ${n(words)}.`;
  }
  if (words > screeningWordRange.max) {
    return `A report covers up to ${n(screeningWordRange.max)} words. This text has ${n(words)}; split it into separate reports.`;
  }
  return null;
}

/** Null when `chars` is inside the free-scan range. */
export function freeScanCharError(chars: number): string | null {
  if (chars < freeScan.minChars) {
    return `Add a little more text. The scan needs at least ${n(freeScan.minChars)} characters.`;
  }
  if (chars > freeScan.maxChars) {
    return `The free scan handles up to ${n(freeScan.maxChars)} characters at a time.`;
  }
  return null;
}

/** Null when `chars` (billable characters) is inside the refinement range. */
export function refinementCharError(chars: number): string | null {
  if (chars < refinement.minChars) {
    return `Refinement needs at least ${n(refinement.minChars)} characters. This text has ${n(chars)}.`;
  }
  if (chars > refinement.maxChars) {
    return `Refinement handles up to ${n(refinement.maxChars)} characters per order. Split longer work into separate orders.`;
  }
  return null;
}

/**
 * "Report · 1,240 words" for order lists. Built from counts only, never the
 * document's words, so no text survives in `title` after retention deletes
 * `source_text`.
 */
export function autoTitle(prefix: string, count: number, unit: "words" | "characters"): string {
  return `${prefix} · ${n(count)} ${unit}`;
}
