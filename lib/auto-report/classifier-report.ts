import { splitSentences } from "@/lib/recheck";

/**
 * Report text built from the classifier alone, in the same plain-text shape the reviewer writes, so the existing
 * stitcher and the scan page read it unchanged. A sentence is High when a classifier window that covers it scores
 * at least CLASSIFIER_FLAG; nothing else is marked and no reasons are given (Jordan, 2026-10-22: scoring from the
 * classifier, DeepSeek only where reasons are paid for). Offline replay with this rule on 567 texts: formal human
 * writing 0% red, AI 92% (polished) to 100% (ESL voice), humanised AI 65% (docs/HYBRID_DETECTOR.md).
 */
export const CLASSIFIER_FLAG = 0.9;

const clip = (s: string) => {
  const words = s.split(/\s+/).slice(0, 5).join(" ");
  return `${words}${s.split(/\s+/).length > 5 ? "..." : ""}`.replace(/"/g, "'");
};

/** `text` is one piece (or the whole text); `scores` are the per-sentence classifier scores for its sentences, in order. */
export function classifierReport(text: string, scores: number[]): string {
  const sentences = splitSentences(text);
  const flags = sentences.flatMap((s, i) => ((scores[i] ?? 0) >= CLASSIFIER_FLAG ? [`- P${s.p} S${s.s} "${clip(s.text)}" | Risk: High`] : []));
  return ["A. Sentence flags", ...(flags.length ? flags : ["- No sentences flagged."])].join("\n");
}
