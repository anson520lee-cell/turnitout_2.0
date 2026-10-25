import { freeReport, refinement } from "@/config/app";
import { reportPricing } from "@/config/pricing";

/**
 * Length rules for report and refinement requests, as plain functions so the
 * paste dialog (browser) and the zod schemas (server) give the same message.
 * The server always re-checks; the browser check is only for fast feedback.
 */

const n = (v: number) => v.toLocaleString("en-HK");

/** Null when `chars` (billable characters) is inside the report range. */
export function reportCharError(chars: number): string | null {
  if (chars < reportPricing.minChars) {
    return `A report needs at least ${n(reportPricing.minChars)} characters. This text has ${n(chars)}.`;
  }
  if (chars > reportPricing.maxChars) {
    return `A report covers up to ${n(reportPricing.maxChars)} characters. This text has ${n(chars)}; split it into separate reports.`;
  }
  return null;
}

/** Null when `chars` (billable characters) is inside the daily free report range. */
export function freeReportCharError(chars: number): string | null {
  if (chars < freeReport.minChars) {
    return `A report needs at least ${n(freeReport.minChars)} characters. This text has ${n(chars)}.`;
  }
  if (chars > freeReport.maxChars) {
    return `The daily free report covers up to ${n(freeReport.maxChars)} characters. This text has ${n(chars)}; paste a shorter part, or get a full report with credits.`;
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
 * "Report · 6,240 characters" for order lists. Built from counts only, never the
 * document's words, so no text survives in `title` after retention deletes
 * `source_text`.
 */
export function autoTitle(prefix: string, count: number, unit: "words" | "characters"): string {
  return `${prefix} · ${n(count)} ${unit}`;
}
