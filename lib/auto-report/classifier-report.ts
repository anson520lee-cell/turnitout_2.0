import { splitSentences } from "@/lib/recheck";
import { parseReport } from "@/lib/report-format";

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

const LOC = /^P(\d+)\s*S(\d+)\b/i;

/**
 * A paid report keeps the same marks and score as a free one (the classifier decides them, Jordan 2026-10-22); the
 * reviewer only adds its reasons and questions. Each sentence the classifier marked gets the reviewer's notes and
 * question for that sentence when it wrote any, and the reviewer's grammar section is carried over. Sentences only
 * the reviewer flagged stay unmarked.
 */
export function withReasons(classifier: string, reviewer: string | null | undefined): string {
  if (!reviewer) return classifier;
  const said = new Map<string, { notes: string[]; ask?: string }>();
  for (const b of parseReport(reviewer)) {
    const m = b.kind === "item" && b.location ? LOC.exec(b.location) : null;
    if (b.kind === "item" && m && (b.notes?.length || b.question)) said.set(`${Number(m[1])}:${Number(m[2])}`, { notes: b.notes ?? [], ask: b.question });
  }
  const lines = classifier.split("\n").map((line) => {
    const m = /^- P(\d+) S(\d+) /.exec(line);
    const r = m && said.get(`${Number(m[1])}:${Number(m[2])}`);
    if (!r) return line;
    return [line, ...r.notes, ...(r.ask ? [`Ask: ${r.ask}`] : [])].join(" | ");
  });
  const grammar = /^\s*D\.[^\n]*\n[\s\S]*$/m.exec(reviewer)?.[0].trim();
  return grammar ? `${lines.join("\n")}\n\n${grammar}` : lines.join("\n");
}
