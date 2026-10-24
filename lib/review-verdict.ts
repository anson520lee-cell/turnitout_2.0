import { COUNTED_CURVE, overallFor } from "@/lib/auto-report/stitch";
import { overallRisk, type ReportBlock, type Risk } from "@/lib/report-format";

const SENTENCE_LOCATION = /^P\d+\s*S\d+\b/i;
const RISK_OF = { low: "low", moderate: "medium", elevated: "high" } as const;

export interface ReviewVerdict {
  risk: Risk;
  /** Share (0 to 1) of the text's sentences that count toward the AI score (read on COUNTED_CURVE). */
  share: number;
}

/**
 * The reviewer's verdict for the free scan, worked out the way the paid report works out its own: from the
 * share of sentences that count toward the AI score (every High one, and the Medium ones the server marked as
 * counted), read on COUNTED_CURVE, not from the "Overall risk" line it writes about itself (that
 * line reads higher on short texts, where one or two marked sentences are already a large share). Without
 * the text's sentence count it can only repeat that line. Undefined while the report has said nothing yet.
 */
export function reviewVerdict(blocks: ReportBlock[], sentences: number | undefined): ReviewVerdict | undefined {
  const stated = overallRisk(blocks);
  if (!sentences) return stated ? { risk: stated, share: NaN } : undefined;
  const marked = blocks.filter((b) => b.kind === "item" && b.location && SENTENCE_LOCATION.test(b.location));
  if (!marked.length && !stated) return undefined;
  const counted = marked.filter((b) => b.kind === "item" && b.counted).length;
  const share = Math.min(1, counted / sentences);
  return { risk: RISK_OF[overallFor(share, COUNTED_CURVE)], share };
}
