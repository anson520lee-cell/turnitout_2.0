import { SCAN_REPORT_PROMPT } from "@/lib/local-model/prompts";

/**
 * Candidate reviewer prompts for the piece-size / accuracy test. Each is the saved
 * built-in prompt with a few rules changed, so the test shows what the change does.
 * Used only by the test route; the saved prompt is never touched.
 */

function swap(base: string, from: string, to: string): string {
  if (!base.includes(from)) throw new Error(`Prompt text to replace not found: ${from.slice(0, 40)}`);
  return base.replace(from, to);
}

const MEDIUM_BEFORE = "- Medium: one model-essay signal, or a tidy sentence with no visible personal features.";
const RATING_HEADING = "RATING EACH SENTENCE\n";

const CALIBRATION = `CALIBRATION (read before rating)
- Most sentences in a text written by a person are NOT flagged by the detector. Clear, formal, well-organised writing is normal and is not a signal by itself. Essays, articles and reports are usually tidy.
- Only list a sentence in part A when you can name the signal (one of 1 to 6 above) and quote the exact words that show it. If you cannot quote the words, the sentence is Low and is not listed.
- In a typical text, fewer than 1 in 5 sentences should be High or Medium. If you are about to list more, you are probably counting ordinary clear writing as a signal. Go back and keep only the sentences with a quotable signal.

`;

/** Medium needs a signal you can quote; tidy writing alone is Low. */
export const STRICT_1 = swap(
  swap(SCAN_REPORT_PROMPT, MEDIUM_BEFORE, "- Medium: one clear model-essay signal, with the exact words quoted. A tidy or formal sentence with no nameable signal is Low."),
  RATING_HEADING,
  CALIBRATION + RATING_HEADING,
);

export const CANDIDATE_PROMPTS = { strict1: STRICT_1 } as const;
export type CandidatePromptName = keyof typeof CANDIDATE_PROMPTS;
