import { countsTowardScore } from "@/lib/auto-report/stitch";
import { parseReport, stripReasonsMarked } from "@/lib/report-format";

/**
 * Whether one line of the written review counts toward the AI score, by the same rule the paid report uses
 * (countsTowardScore on the line's risk and its reasons). Worked out on the server, before the reasons are
 * stripped, so the free scan can score like the paid report without ever sending a reason to the browser.
 */
export function lineCounts(line: string): boolean {
  const item = parseReport(line).find((b) => b.kind === "item");
  if (!item || item.kind !== "item" || !item.risk) return false;
  return countsTowardScore(item.risk, item.notes?.join(" \u00b7 ") || undefined);
}

/** A report line as the free scan sends it: reasons removed, plus a bare "Counted" mark when it counts toward the score. */
export function freeScanLine(line: string): string | null {
  return stripReasonsMarked(line, lineCounts(line));
}
