import { SCAN_REPORT_PROMPT } from "@/lib/local-model/prompts";
import type { CandidatePromptName } from "@/lib/chunk-candidate-names";

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

const SAFE_LAST = "- we, he/she, contractions (doesn't), rhetorical questions.";
const LOW_LINE = "- Low: clear safe signals. Do not list low-risk sentences in part A.";

/**
 * A visible slip is evidence of a person. Found on Jordan's own essay (Turnitin: 0% AI): all six sentences the
 * saved prompt flagged were ready-made frames, and five of the six contained a plain grammar slip or an odd word.
 * The examples in the prompt are made up, not taken from that essay, so testing on it stays fair.
 */
const SLIPS = `- Visible slips: a grammar mistake you can quote (missing verb, wrong plural, wrong word form, e.g. "many informations", "it more cheaper than", "the people is") or an odd, non-idiomatic word choice (e.g. "the project costs a lot of worth"). A model essay is almost never like this. A sentence with a quotable slip is Low even when it uses a standard frame (signal 2). This only lowers the rating; never tell the student to make mistakes on purpose.`;

/** Quotable slips lower a sentence to Low, even inside a ready-made frame. */
export const SLIP_1 = swap(swap(SCAN_REPORT_PROMPT, SAFE_LAST, `${SAFE_LAST}\n${SLIPS}`), LOW_LINE, "- Low: clear safe signals, or a quotable slip (see safe signals). Do not list low-risk sentences in part A.");

const SAFE_HEADING = "SAFE SIGNALS (these lower the risk; they are natural mode)";
const THREE_LISTS = "- Three-item lists (e.g. safe, practical and comfortable).";

const STRUCTURE = `7. Template essay structure. Look across the whole piece, not at one sentence. Patterns:
   a. "Not X, but Y" punchlines: "X is not A; it is B", "the real question is not whether..., but whether...", "this is not a flaw, it is the design".
   b. Many three-item lists: three or more in one piece (three nouns, adjectives or verbs in a row).
   c. Parallel, evenly sized parts: "First, ... Second, ... Finally, ..." paragraphs, or list items that each start with a short label and a colon, then an explanation.
   Two or more of these patterns in one piece means signal 7 is present; one pattern alone does not. Ordinary topic sentences and a plain conclusion are not signal 7. Rewriting ("humanizer") tools change the words but keep this skeleton, so signal 7 still counts when the sentences sound casual.

`;

/**
 * Structure over surface: a Gemini essay "humanized" by Gemini kept its whole skeleton (contrast punchlines,
 * three-item lists, First/Second/Finally) but added you/we, idioms and everyday scenes, which the saved prompt
 * reads as signs of a person. This candidate weighs the skeleton and stops reader-address and idioms from
 * clearing a sentence on their own. Patterns come from published AI-writing tells; that essay is held out of the test design.
 */
export const STRUCT_1 = [
  [SAFE_HEADING, STRUCTURE + SAFE_HEADING],
  [SAFE_LAST, "- Contractions and rhetorical questions, as weak signals only. Addressing the reader as you or we, idioms and everyday examples are NOT safe signals on their own: rewriting tools add them to model text. No safe signal cancels signal 7."],
  [THREE_LISTS, "- A single three-item list (e.g. safe, practical and comfortable). Many of them in one piece are part of signal 7."],
  [MEDIUM_BEFORE, `${MEDIUM_BEFORE}\n- When signal 7 is present, every sentence that carries one of its patterns (a "not X, but Y" line, a sentence with a three-item list, a First/Second/Finally opener or a label-and-colon item) is at least Medium, even when it uses you, we, an idiom or a casual tone.`],
].reduce((text, [from, to]) => swap(text, from, to), SCAN_REPORT_PROMPT);

export const CANDIDATE_PROMPTS: Record<CandidatePromptName, string> = { strict1: STRICT_1, slip1: SLIP_1, struct1: STRUCT_1 };
