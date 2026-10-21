import { overallFor } from "@/lib/auto-report/stitch";
import { overallRisk, type ReportBlock, type Risk } from "@/lib/report-format";

const SENTENCE_LOCATION = /^P\d+\s*S\d+\b/i;
const RISK_OF = { low: "low", moderate: "medium", elevated: "high" } as const;

export interface ReviewVerdict {
  risk: Risk;
  /** Share (0 to 1) of the text's sentences the reviewer marked High or Medium. */
  share: number;
}

/**
 * The reviewer's verdict for the free scan, worked out the way the paid report works out its own: from the
 * share of sentences it marked High or Medium, not from the "Overall risk" line it writes about itself (that
 * line reads higher on short texts, where one or two marked sentences are already a large share). Without
 * the text's sentence count it can only repeat that line. Undefined while the report has said nothing yet.
 */
export function reviewVerdict(blocks: ReportBlock[], sentences: number | undefined): ReviewVerdict | undefined {
  const stated = overallRisk(blocks);
  if (!sentences) return stated ? { risk: stated, share: NaN } : undefined;
  const marked = blocks.filter((b) => b.kind === "item" && b.location && SENTENCE_LOCATION.test(b.location));
  if (!marked.length && !stated) return undefined;
  const flagged = marked.filter((b) => b.kind === "item" && (b.risk === "high" || b.risk === "medium")).length;
  const share = Math.min(1, flagged / sentences);
  return { risk: RISK_OF[overallFor(share)], share };
}
