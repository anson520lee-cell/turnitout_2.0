import { refinement } from "@/config/app";
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

/** "Report · The effects of social media on…" for the customer's own order list. */
export function autoTitle(prefix: string, text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const first = words.slice(0, 6).join(" ");
  const head = first.slice(0, 60).trimEnd();
  const more = words.length > 6 || head.length < first.length;
  return `${prefix} · ${head || "Untitled"}${more ? "…" : ""}`;
}
