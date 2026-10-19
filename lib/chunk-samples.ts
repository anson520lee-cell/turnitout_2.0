/**
 * Building the labelled sample texts for the chunk-size experiment.
 * Pure functions, no I/O.
 */

import type { Origin } from "@/lib/chunk-eval";
import { truthFromFlaggedLines, type TruthSentence } from "@/lib/eval";
import { splitSentences } from "@/lib/recheck";

/** Truth for a whole text written by one author: every sentence AI (true) or none. */
export function wholeTruth(body: string, ai: boolean): TruthSentence[] {
  return splitSentences(body).map((s) => ({ p: s.p, s: s.s, flagged: ai }));
}

export function truthFor(origin: "human" | "ai" | "turnitin", body: string, flaggedLines: string): { truth: TruthSentence[]; unmatched: string[] } {
  if (origin === "turnitin") return truthFromFlaggedLines(body, flaggedLines);
  return { truth: wholeTruth(body, origin === "ai"), unmatched: [] };
}

const paragraphs = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * A text that alternates blocks of human and AI paragraphs (two of each, human
 * first), with the label of every sentence known from where it came from.
 */
export function mixTexts(human: string, ai: string, block = 2): { body: string; truth: TruthSentence[] } | null {
  const h = paragraphs(human);
  const a = paragraphs(ai);
  const out: { text: string; ai: boolean }[] = [];
  let hi = 0;
  let ai_ = 0;
  while (hi < h.length || ai_ < a.length) {
    for (let i = 0; i < block && hi < h.length; i++) out.push({ text: h[hi++], ai: false });
    for (let i = 0; i < block && ai_ < a.length; i++) out.push({ text: a[ai_++], ai: true });
  }
  if (out.length === 0) return null;
  const body = out.map((x) => x.text).join("\n\n");
  const truth: TruthSentence[] = [];
  out.forEach((para, pi) => {
    splitSentences(para.text).forEach((s) => truth.push({ p: pi + 1, s: s.s, flagged: para.ai }));
  });
  // Every paragraph must split the same way inside the whole text as it did alone.
  return splitSentences(body).length === truth.length ? { body, truth } : null;
}

export const ORIGIN_LABEL: Record<Origin, string> = {
  human: "Human",
  ai: "AI",
  turnitin: "Turnitin-marked",
  mixed: "Mixed",
};
