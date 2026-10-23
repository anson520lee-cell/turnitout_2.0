import { SCAN_REPORT_PROMPT } from "@/lib/local-model/prompts";
import type { CandidatePromptName } from "@/lib/chunk-candidate-names";

/**
 * Candidate reviewer prompts for the piece-size / accuracy test. Each is the first
 * built-in prompt (SCAN_REPORT_PROMPT) with a few rules changed, so the test shows
 * what the change does. struct1 became the site's built-in prompt on 2026-10-20 and mix1 on 2026-10-21
 * (see DEFAULT_REPORT_PROMPT in site-settings.ts).
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
const STRUCT_SAFE_LAST =
  "- Contractions and rhetorical questions, as weak signals only. Addressing the reader as you or we, idioms and everyday examples are NOT safe signals on their own: rewriting tools add them to model text. No safe signal cancels signal 7.";

export const STRUCT_1 = [
  [SAFE_HEADING, STRUCTURE + SAFE_HEADING],
  [SAFE_LAST, STRUCT_SAFE_LAST],
  [THREE_LISTS, "- A single three-item list (e.g. safe, practical and comfortable). Many of them in one piece are part of signal 7."],
  [MEDIUM_BEFORE, `${MEDIUM_BEFORE}\n- When signal 7 is present, every sentence that carries one of its patterns (a "not X, but Y" line, a sentence with a three-item list, a First/Second/Finally opener or a label-and-colon item) is at least Medium, even when it uses you, we, an idiom or a casual tone.`],
].reduce((text, [from, to]) => swap(text, from, to), SCAN_REPORT_PROMPT);

/**
 * mix1 (2026-10-20): struct1 plus the slip rule from slip1. A dense-register candidate (dense1) was tried and dropped:
 * on the same 39 essays it ranked AI above human worse than struct1 (AUC 0.83 against 0.90). slip1 and struct1 were
 * each designed after seeing particular essays (slip1 from Jordan's own, struct1 from a humanised Gemini essay), so
 * mix1 only counts if it beats struct1 on essays neither was designed on. It did (ELLIPSE, PELIC, 2026-10-21), so it is now live.
 */
export const MIX_1 = swap(
  swap(STRUCT_1, STRUCT_SAFE_LAST, `${STRUCT_SAFE_LAST}\n${SLIPS}`),
  LOW_LINE,
  "- Low: clear safe signals, or a quotable slip (see safe signals). Do not list low-risk sentences in part A.",
);

/**
 * Formal-register candidates (2026-10-21). Found on an HKEAA DSE 5** exemplar (human, Turnitin 0% AI) that mix1 scored
 * 77 to 98, and on 1961 Brown prose (human): mix1 flagged 58% of their sentences and scored 69% of the pieces red,
 * while ELLIPSE and PELIC (looser student writing) stayed at 1% and 6%. The cause is the Medium line "a tidy sentence
 * with no visible personal features", plus signals 3, 4 and 6, which describe any formal, impersonal prose.
 * strict1 (a hard cap of 1 in 5) fixed the human side but cut AI to about a third, so these two sit in between.
 * reg1 keeps the signal list and only asks for a quotable signal before a sentence is Medium; reg2 also stops the
 * three register-wide signals (3, 4, 6) from counting alone. Neither is live; they only count if they keep AI catch.
 */
const REGISTER_NOTE = `REGISTER (read before rating)
- Formal, impersonal, abstract writing is the normal register of school exam essays and of academic prose. Topic sentences, transition words (Firstly, Furthermore, Therefore, In conclusion, Last but not least) and general statements that name nobody are taught on purpose. They are not a signal by themselves.
- Only list a sentence in part A when you can name the signal and quote the exact words that show it. A tidy, formal or impersonal sentence with no quotable signal is Low and is not listed.

`;

const MEDIUM_QUOTABLE = "- Medium: one clear model-essay signal, with the exact words quoted. A tidy, formal or impersonal sentence with no quotable signal is Low.";

export const REG_1 = swap(swap(MIX_1, MEDIUM_BEFORE, MEDIUM_QUOTABLE), RATING_HEADING, REGISTER_NOTE + RATING_HEADING);

const WEAK_SIGNALS = `- Signals 3, 4 and 6 describe formal writing in general. They never make a sentence Medium on their own; they only add weight to a sentence that already has signal 1, 2, 5 or 7 with quoted words.\n`;

export const REG_2 = swap(REG_1, MEDIUM_QUOTABLE, WEAK_SIGNALS + MEDIUM_QUOTABLE);

/**
 * Content-blind candidate (2026-10-23). A reflective journal Jordan had Claude write (CCHU 9078 J1) got 96% AI on
 * Turnitin but 1% here: mix1 marked 9 of 52 sentences, because first person, feelings, times, lecturers and anecdotes
 * read to it as natural mode ("The student wrote the text themselves", "Naming specific people and motives",
 * "no visible personal features"). Turnitin only scores wording and structure, so word1 drops every content-based
 * reason for Low, says the author is unknown, and adds predictable wording (the plain-language form of low
 * perplexity) and the rhetorical moves of plain-style model text. The slip rule stays: a quotable slip is wording.
 * The examples are written fresh, not taken from J1, but J1 motivated the rules, so it is not a fair held-out test.
 * Not live; it only counts if human samples (ELLIPSE, PELIC, BAWE, Brown, DSE) do not go red much more than with mix1.
 */
const UNKNOWN_AUTHOR = "You do not know who wrote the text. It may be the student's own work, or it may have been produced or polished by a language model. Judge only the wording and structure, never the content.";

const CONTENT_BLIND = `- It ignores content. First person, personal experience, feelings, specific times, places and people, lecture or class references, quotes and anecdotes do not make text look human to it: language models write personal reflections just as fluently. Only the choice of words and the shape of the sentences count.
`;

const PREDICTABLE = `8. Predictable wording (what detectors measure as low perplexity): every word is the one most writers would pick next, every phrase is the obvious idiomatic one, nothing is awkward, surprising or slightly off. This counts just as much for plain, short, simple sentences in the first person as for academic ones. E.g. "The more I planned, the less I actually did." "I was tired, but in a good way." "It was not easy, but it taught me something."
9. Plain-style rhetorical moves. Look across the piece: colon reveals ("the answer was simple: ..."), callback lines that tie two parts together ("Both experiences point to the same lesson."), pairs of short parallel sentences ("At home I rush. At school I wait."), a tidy closing line that names what was learned. Two or more of these in one piece means signal 9 is present; then every sentence carrying one is at least Medium.

`;

const CONTENT_SAFE = `SAFE SIGNALS (these lower the risk; they are about wording only)
- Several ideas strung loosely into one long sentence with commas, so, but, which, in a run-on way rather than a balanced clause.
- Clumsy, unusual or non-standard word choices a language model would not pick (e.g. "decision right", "tailor-made" used for a policy).`;

const NOT_SAFE_CONTENT = `- First person, personal experience, emotions, specific times, places, people, lecturers, course names, quotes from class and anecdotes are NOT safe signals. They say nothing about who chose the words.
`;

export const WORD_1 = [
  ["The student wrote the text themselves.", UNKNOWN_AUTHOR],
  ["- Text under about 300 words is not scored at all.\n", "- Text under about 300 words is not scored at all.\n" + CONTENT_BLIND],
  [SAFE_HEADING, PREDICTABLE + SAFE_HEADING],
  [`${SAFE_HEADING}
- Several ideas strung into one long sentence with commas, so, but, which.
- Starting with So, Indeed, But; comments or tone mixed in (e.g. "sounds counterintuitive", "having income is great").
- The student's own word choices (e.g. tailor-made, capital, sovereignty, decision right, keep an eye on).
- Naming specific people and motives (e.g. government, investors, to maximize their profits).`, CONTENT_SAFE],
  ["NOT RISK SIGNALS.", "NOT SAFE SIGNALS\n" + NOT_SAFE_CONTENT + "\nNOT RISK SIGNALS."],
  [MEDIUM_BEFORE, "- Medium: one model-essay signal, or a fluent, error-free sentence whose wording is entirely predictable (signal 8), whatever its content."],
].reduce((text, [from, to]) => swap(text, from, to), MIX_1);

export const CANDIDATE_PROMPTS: Record<CandidatePromptName, string> = { strict1: STRICT_1, slip1: SLIP_1, struct1: STRUCT_1, mix1: MIX_1, reg1: REG_1, reg2: REG_2, word1: WORD_1 };
