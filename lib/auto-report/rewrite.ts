/**
 * Writing Refinement ("lower your AI score"): suggested rewrites for the sentences a finished report flagged.
 * Pure functions, no I/O, so they can be tested (the DeepSeek calls are in rewrite-run.ts).
 *
 * The flagged sentences are rewritten for a lower AI score, guided by the detector's reason for each, in the
 * detector's own terms (REWRITE_PROMPT): one long sentence with its ideas strung together, never a run of short tidy
 * ones (signals 3 and 8: until 2026-10-29 the prompt asked for the split into short blunt sentences, and on Neo's
 * 100% essay the re-check flagged 26 of the 37 sentences that made, mostly as "short predictable sentence"; Neo: that
 * "就是一個大 bug"). Since 2026-10-28 (Neo: "不惜一切也要把 AI rate 壓下來") the score
 * comes first: a suggestion may change what a sentence says, drop details or change how strongly a claim is made, and
 * the customer is told so before paying, and a little of the roughness of real student writing is asked for (Neo,
 * same day: "grammar 可以錯一點"). What is never allowed: a new number, a changed or new citation or quotation, a
 * changed name, a misspelt word. Every suggestion is checked here against the sentence it replaces, and one that fails is dropped.
 *
 * Backtest 2026-10-29 (tools/refine-backtest, live detector prompt on Neo's five Gemini essays): the earlier prompt left
 * the text at 96-99% after round 1 and 13-83% at best; this one reaches 5-81% after round 1 and mostly under 30% by
 * round 2. Later rounds compound, so the length limit (MAX_GROWTH) is against the student's sentence, not the last
 * suggestion. The detector is noisy (the same text scored 4, 91 and 94 on three runs): judge changes by several runs.
 *
 * After the first rewrite the text is re-checked (rewrite-check.ts); while it still scores above TARGET_SCORE the
 * sentences it still counts are rewritten again in a clearly different way (rewrite-run.ts makeRound), up to
 * MAX_ROUNDS, and the round with the lowest re-checked score is the one kept. Why: on Neo's Gemini essay a synonym swap
 * was still counted on 29 of 31 sentences; a plain-voice rewrite of the same essay scored 93/54/39 over three runs of
 * the detector, so one pass is not enough (/mnt/project-files/refine-recheck/results-2026-10-28.md).
 */

import { splitSentences } from "@/lib/recheck";
import { rewritePrice, toCredits } from "@/config/pricing";
import type { AutoReportResult, ReportSentence } from "./stitch";

export interface RewriteItem {
  /** 1-based place in the whole text, as in the report. */
  n: number;
  original: string;
  /** The suggestion, or null when none passed the checks. */
  rewrite: string | null;
  /** Why the reviewer flagged the sentence. */
  why?: string;
  /** Why no suggestion is shown, when there is none. */
  kept?: string;
}

export type Decision = "accept" | "reject";

export interface ReportRewrite {
  version: 1;
  model: string;
  createdAt: string;
  /** Credits charged for it (0 for an admin's test). Absent on rewrites made before the add-on was priced. */
  credits?: number;
  items: RewriteItem[];
  /** The text with every suggestion in place, reviewed again by the same detector (rewrite-check.ts). Absent until that ran. */
  check?: RewriteCheck;
  /** Rounds written so far: absent for the first, then one more for each round that rewrote the sentences still counted. */
  round?: number;
  /** The re-checked score after each round, in order (the kept round is the lowest). */
  scores?: number[];
  /** A round written but not re-checked yet: its items replace `items` only if the re-check scores lower. */
  pending?: { round: number; items: RewriteItem[] };
  /** Times the background runner (sweep.ts) tried a step and the model could not be reached: it gives up at MAX_STALLS. */
  stalls?: number;
}

/** At most this many rounds of rewriting (the first included): each later one costs a rewrite and a re-check. */
export const MAX_ROUNDS = 3;
/** Rounds stop once the re-checked score is under this (the green "Low" band, SCORE_BANDS.moderate). */
export const TARGET_SCORE = 0.3;

/** The next thing a rewrite waits for: the detector on a round (`check`), or the writer on another round (`round`). */
export type RewriteStep = { kind: "check" | "round"; round: number };

/**
 * What is left to do for a saved rewrite, or null when it is finished: the first round or a round written but not
 * re-checked yet waits for the detector, and a re-checked one that is still above the target waits for another round.
 * The page's own loop and the background runner (sweep.ts) both follow this, so either can pick up where the other
 * stopped, and the whole run finishes without the browser.
 */
export function nextStep(rewrite: ReportRewrite): RewriteStep | null {
  if (!rewrite.items.some((i) => i.rewrite)) return null;
  if (!rewrite.check || rewrite.pending) return { kind: "check", round: rewrite.pending?.round ?? rewrite.round ?? 1 };
  return needsRound(rewrite) ? { kind: "round", round: (rewrite.round ?? 1) + 1 } : null;
}

/** A rewrite is only followed on by itself (the page, the runner) for this long after it was made: older ones wait for a click. */
export const RESUME_WINDOW_MS = 45 * 60_000;
/** The runner gives up on a rewrite after this many failed tries. */
export const MAX_STALLS = 3;

/** Whether an unfinished rewrite is recent enough, and not given up on, to be carried on without being asked. */
export function resumable(rewrite: ReportRewrite, now = Date.now()): boolean {
  const made = Date.parse(rewrite.createdAt);
  return nextStep(rewrite) !== null && Number.isFinite(made) && now - made < RESUME_WINDOW_MS && (rewrite.stalls ?? 0) < MAX_STALLS;
}

/** Whether another round should be written: re-checked, nothing waiting, still above the target and rounds left. */
export function needsRound(rewrite: ReportRewrite): boolean {
  return !!rewrite.check && !rewrite.pending && rewrite.check.score >= TARGET_SCORE && (rewrite.round ?? 1) < MAX_ROUNDS;
}

/** The report with each rewritten sentence's text replaced by its suggestion: the neighbours a later round sees. */
export function currentResult(result: AutoReportResult, items: RewriteItem[]): AutoReportResult {
  const swap = new Map(items.filter((i) => i.rewrite).map((i) => [i.n, i.rewrite as string]));
  return { ...result, paragraphs: result.paragraphs.map((p) => ({ ...p, sentences: p.sentences.map((s) => (swap.has(s.n) ? { ...s, text: swap.get(s.n) as string } : s)) })) };
}

/**
 * The sentences a later round rewrites: every sentence the re-check still counts, as it reads now (the suggestion, or
 * the student's sentence when there was none), under its number in the report, with the re-check's reasons. A
 * suggestion split into several sentences is one target, with the reasons of each part that still counts.
 */
export function roundTargets(result: AutoReportResult, rewrite: ReportRewrite): ReportSentence[] {
  if (!rewrite.check) return [];
  const originals = result.paragraphs.flatMap((p) => p.sentences);
  const out = new Map<number, ReportSentence>();
  for (const s of rewrite.check.result.paragraphs.flatMap((p) => p.sentences)) {
    const t = s.text.trim();
    if (!s.counts || !t) continue;
    const item = rewrite.items.find((i) => i.rewrite?.includes(t));
    const own = item ? null : originals.find((o) => o.text.trim() === t);
    const n = item?.n ?? own?.n;
    if (n === undefined) continue;
    const prev = out.get(n);
    const why = [prev?.why, s.why].filter(Boolean).join("; ");
    out.set(n, { n, text: item?.rewrite ?? (own as ReportSentence).text, risk: s.risk, counts: true, ...(why ? { why } : {}), ...((prev?.ask ?? s.ask) ? { ask: prev?.ask ?? s.ask } : {}) });
  }
  return [...out.values()].sort((a, b) => a.n - b.n).slice(0, MAX_REWRITE_SENTENCES);
}

/**
 * A later round's suggestions over the earlier ones: a sentence with a new suggestion takes it, every other keeps what
 * it had. The student's sentence and the first reason stay with each item.
 */
export function mergeRound(items: RewriteItem[], fresh: RewriteItem[], result: AutoReportResult): RewriteItem[] {
  const originals = new Map(result.paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s]));
  const next = new Map(items.map((i) => [i.n, i]));
  for (const f of fresh) {
    if (!f.rewrite) continue;
    const old = next.get(f.n);
    const why = old?.why ?? originals.get(f.n)?.why;
    next.set(f.n, { n: f.n, original: old?.original ?? originals.get(f.n)?.text ?? f.original, rewrite: f.rewrite, ...(why ? { why } : {}) });
  }
  return [...next.values()].sort((a, b) => a.n - b.n);
}

/**
 * The real re-check of a rewrite. Until 2026-10-28 the live rewrite only showed a projection (the report's score
 * with the rewritten sentences taken out of the count); Neo's test that day showed why that is not enough: a Gemini
 * essay projected at 2% still scored 100% when the revised text was checked, and 29 of the 31 rewritten sentences
 * were still counted.
 */
export interface RewriteCheck {
  checkedAt: string;
  /** The revised text's AI score, 0 to 1, read exactly as a report's. */
  score: number;
  /** Rewritten sentences (by their number in the report) that are still counted toward the score on the re-check. */
  stillCounted: number[];
  /** Rewritten sentences that no longer count. */
  cleared: number[];
  /** The whole re-check, as a report of the revised text: what a new report on exactly that text shows again. */
  result: AutoReportResult;
}

/** Every suggestion accepted: the text the re-check reviews. */
export function acceptAll(rewrite: ReportRewrite): Record<number, Decision> {
  return Object.fromEntries(rewrite.items.filter((i) => i.rewrite).map((i) => [i.n, "accept" as const]));
}

/**
 * Which rewritten sentences the re-check still counts. A suggestion may be split into a few sentences, so the revised
 * text is matched by text: a rewrite still counts when any re-checked sentence inside it counts. Only when nothing
 * matches (the re-check split the text differently) is the sentence of the same number used.
 */
export function checkOutcome(rewrite: ReportRewrite, after: AutoReportResult): Pick<RewriteCheck, "stillCounted" | "cleared"> {
  const sentences = after.paragraphs.flatMap((p) => p.sentences);
  const byN = new Map(sentences.map((s) => [s.n, s]));
  const stillCounted: number[] = [];
  const cleared: number[] = [];
  for (const item of rewrite.items) {
    if (!item.rewrite) continue;
    const text = item.rewrite;
    const inside = sentences.filter((s) => s.text.trim() && text.includes(s.text.trim()));
    const counts = inside.length ? inside.some((s) => s.counts) : byN.get(item.n)?.counts;
    (counts ? stillCounted : cleared).push(item.n);
  }
  return { stillCounted, cleared };
}

/** What the add-on costs for this report, in credits (see rewritePrice in config/pricing.ts). */
export function rewriteCredits(order: { price: number; source_text: string | null }, result: AutoReportResult): number {
  const chars = order.source_text?.length ?? result.paragraphs.reduce((sum, p) => sum + p.sentences.reduce((n, s) => n + s.text.length + 1, 0), 0);
  return toCredits(rewritePrice(order.price, chars));
}

/** The most sentences rewritten for one report (a cost and a quality limit). */
export const MAX_REWRITE_SENTENCES = 60;
/** The most sentences one suggestion may have (a re-checked suggestion of three short sentences is one target of a later round). */
export const MAX_SPLIT = 3;
/** A sentence this long (in words) may be rewritten as two; a shorter one stays one sentence. */
export const LONG_SENTENCE = 35;
/** When a suggestion has more than one sentence, each has at least this many words: the detector flags short ones. */
export const MIN_SPLIT_WORDS = 12;
/** A suggestion may be at most this many times as long as the student's sentence (the whole essay must not grow much). */
export const MAX_GROWTH = 1.5;
/** Sentences sent to the model in one call. */
export const REWRITE_BATCH = 20;

/** The flagged sentences to rewrite: every High one, then the Medium ones that count toward the score, then the other Medium ones. */
export function pickFlagged(result: AutoReportResult, max = MAX_REWRITE_SENTENCES): ReportSentence[] {
  const flagged = result.paragraphs.flatMap((p) => p.sentences).filter((s) => s.risk === "high" || s.risk === "medium");
  const rank = (s: ReportSentence) => (s.risk === "high" ? 0 : s.counts ? 1 : 2);
  return flagged
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.s)
    .sort((a, b) => a.n - b.n);
}

export const REWRITE_PROMPT = `You rewrite sentences of a student's essay that an AI-writing detector flagged, so that the detector no longer reads them as AI. Getting the AI score down is the goal and comes before keeping the wording or every detail: the student has agreed that a sentence may lose a detail, change how strongly it says something, or shift in meaning. Polishing is not enough: the detector still flags a sentence that keeps its original shape with new synonyms, and any sentence that is smooth, formal and completely predictable.

For every item you get: id, "before" and "after" (the neighbouring sentences, for context only: never rewrite or repeat them), the "sentence" to rewrite, the detector's "reason" and "ask". The reason is what the detector actually said about this sentence: answer it first, point by point, before anything else in this prompt. If "last_try_failed_because" is present, your earlier rewrite of that sentence was refused for that reason: avoid it this time. If the message says round 2 or later, each sentence is already a rewrite that the detector still flagged: write it again in a clearly different way (different opening, structure and length), never a light edit.

The only hard limits:
- Never add a number, statistic, date, source or citation that is not in the sentence. Keep every in-text citation, for example (Gabora, 1998), and every quotation in quotation marks exactly as written. Keep every name.
- Add no new claim or fact, and no remark about the essay itself ("this essay looks at…", "if I had to explain…"). Do not invent a real event, a named person or a personal experience of the student. Keep the essay's own voice: if it never says I, we or you, do not start.
- No misspelt words, slang or emojis: it must still pass as a school essay written by a real student.
- Return exactly one sentence for each input sentence, built from several ideas strung together (see below). Only when the input is a long sentence of 35 words or more may you return two, and then both are long (at least 12 words each). If the input is already two or three sentences, return one or two. Never merge it with a neighbour, and never split off a short sentence.

How this detector reads text (these are its own rules, so write against them):
- It flags runs of short tidy sentences (subject, verb, object, full stop, again and again). Splitting a sentence into short ones is the worst thing you can do: it creates exactly what it flags. A short blunt punchline is flagged too.
- It flags any sentence where every word is the obvious next one, even a plain, simple, casual first-person sentence ("I was tired, but in a good way."). Being plain is not enough: being unpredictable is.
- First person, "I think", "honestly", "to me", you/we, idioms, everyday examples and personal experience do NOT lower the score on their own: rewriting tools add them and the detector knows. Use them sparingly and never as the main fix.
- What lowers the score: several ideas strung loosely into one long sentence with commas, so, but, which, in a run-on way rather than balanced clauses; a clumsy, unusual or non-standard word choice a language model would not pick; and a small visible slip a real student makes.

How to write it:
- One flowing sentence about as long as the original (at most a third longer: the whole essay must not grow), with its ideas joined by commas, "so", "but", "which", "and then". Lose the neat balance: let a clause come late or trail on. Longer is not the fix; a different, less expected way of saying it is.
- Make it concrete. Swap an abstract phrase ("economic vitality", "social cohesion", "environmental degradation") for the plain thing it stands for, and where it helps illustrate the claim with one small ordinary image or case in generic terms (a farmer paying off a loan, a clinic that needs power, a manager answering messages at night), told as a way of showing the point, not as a real event. A specific picture is the least predictable thing a sentence can contain; two or three of these in a paragraph are plenty.
- Put people in it. Say who does the thing and why, using only what the sentence and its neighbours already say. Replace "a group", "people", "teams", "the system" by who it really is when the text tells you.
- Pick the less obvious word, even if it is a little awkward, instead of the standard collocation. Use the plainer word the student would really say instead of an upgraded one (money, not revenue).
- Now and then, where it comes naturally and with no fixed rate, leave a small slip a real student makes: a missing or extra article, a plural slip ("many informations"), a wrong preposition, a verb form ("the people is"), or an odd but understandable word choice. Some sentences have one, many have none, and do not force one in. Never a misspelt word, and never so much that the meaning is unclear.
- Cut what makes it sound generated: stock academic phrases (in an era of, plays a key role, profound, pervasive, fundamentally, serves as, landscape, fabric, underscores, it is worth noting, worth a closer look), signposting openers (Furthermore, Moreover, Additionally, Consequently, Ultimately, On a broader scale, In conclusion; "So", "But" and "And" are fine), colon reveals, "not X but Y", "rather than" and "neither... nor" punchlines, callbacks, pairs of short parallel sentences, and neat closing morals.
- Lists: never a balanced row of three matching phrases. Keep only the items that matter, or spread them over clauses.
- Answer the reviewer's reason. If it quotes a phrase, that phrase must go. Its signals mean, and what to do about each: 1 ready-made phrases: say it with your own less standard words; 2 sentence frame with nouns swapped: build a different structure; 3 short tidy one-idea sentences in a row: join them into one long strung sentence; 4 abstract generalisation naming nobody: name who and why; 5 upgraded synonyms: use the plain word; 6 flawless textbook sentence: add a slip, loosen it; 7 template structure (contrast punchline, three-item list, ordinal or label openers): drop the template; 8 every word the obvious next one, or "short predictable sentence": choose unexpected words and lengthen it; 9 flourish such as a colon reveal, a callback or a tidy closing line: cut it.

Answer with JSON only, no other text, in this shape: [{"id": 12, "rewrite": "..."}]. Include every id you were given.`;

/**
 * Added to REWRITE_PROMPT in the system message. Everything the checks below can't see about a citation: the checks
 * keep its text, this keeps what it is cited for (since 2026-10-28 a suggestion may change what a sentence says).
 */
export const CITATION_RULE = `One more hard limit, for sentences with a citation: "Gabora (1998)", "Gabora et al. (1998)", (Gabora, 1998), [3] and quotations in single or double quotation marks stay exactly as written, the author's name and the year included. A sentence that carries a citation is the author's finding: keep what the citation claims (who found what, and how strongly) even when you change the wording around it. Do not make the claim stronger, weaker or different, and do not attach it to a different source.`;

/** The user message for a batch of sentences: each with its neighbours and the reviewer's reason. `redo` carries why an earlier try was refused. */
export function rewriteInput(items: ReportSentence[], result: AutoReportResult, redo?: Map<number, string>, round = 1): string {
  const flat = result.paragraphs.flatMap((p) => p.sentences);
  const at = new Map(flat.map((s, i) => [s.n, i]));
  const list = items.map((s) => {
    const i = at.get(s.n) ?? 0;
    const note = redo?.get(s.n);
    return {
      id: s.n,
      before: flat[i - 1]?.text ?? "",
      sentence: s.text,
      after: flat[i + 1]?.text ?? "",
      reason: s.why ?? "",
      ask: s.ask ?? "",
      ...(note ? { last_try_failed_because: note } : {}),
    };
  });
  return [...(round > 1 ? [`Round ${round}: every sentence below is a rewrite the detector still flagged.`] : []), "<sentences>", JSON.stringify(list, null, 1), "</sentences>"].join("\n");
}

/** Reads the model's answer: a JSON array of {id, rewrite}, possibly inside a code fence. Anything unreadable is skipped. */
export function parseRewrites(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return out;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const { id, rewrite } = row as { id?: unknown; rewrite?: unknown };
    const n = typeof id === "number" ? id : typeof id === "string" ? Number(id) : NaN;
    if (Number.isInteger(n) && typeof rewrite === "string" && rewrite.trim()) out.set(n, rewrite.trim());
  }
  return out;
}

/**
 * The answers finished so far in a reply that is still being written: every complete {"id", "rewrite"} object in the
 * JSON array, read the same way as parseRewrites, so an answer seen early is the one the full reply gives.
 */
export function streamedRewrites(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const open = text.indexOf("[");
  if (open < 0) return out;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let from = -1;
  for (let k = open + 1; k < text.length; k++) {
    const c = text[k];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") {
      if (depth === 0) from = k;
      depth++;
    } else if (c === "}" && depth > 0) {
      depth--;
      if (depth === 0 && from >= 0) {
        for (const [n, t] of parseRewrites(`[${text.slice(from, k + 1)}]`)) out.set(n, t);
        from = -1;
      }
    } else if (c === "]" && depth === 0) break;
  }
  return out;
}

/** Capitalised words that open many sentences without being names. */
const STARTERS = new Set(
  `the a an this that these those it its in on at for as by to of with while although however moreover furthermore overall thus therefore first second third firstly secondly thirdly finally lastly additionally also one many most some such there when if because since both each every another other they he she we i what how why who which despite given during after before from through within without among between whilst instead rather yet but and so not no all any more much being having under over across whether only even still indeed ultimately today nowadays currently recently importantly notably crucially simply clearly fact example instance`.split(/\s+/),
);

const wordsOf = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/** Numbers as written ("1998", "3.5", "12,000"), without a trailing full stop. */
export function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/[,.]$/, ""));
}

/**
 * Citations and quotations: the one pattern for each style.
 *  - narrative, author first: "Smith (2021)", "Smith and Lee (2021, p. 4)", "Smith et al. (2021)" (the author is part of it)
 *  - bracketed with a year or n.d.: "(Smith, 2021)", "(Smith, 2021; Lee, 2020)", "(Smith, n.d.)", also full-width brackets
 *  - numbered: "[1]", "[1, 2]", "[3-5]"
 *
 * No lookbehinds in this file (it is in the browser bundle, and Safari before 16.4 cannot parse one, which stops the
 * whole script that holds it from loading): "does not start inside a word" is checked by `matchesFromWordStart`.
 */
const NARRATIVE = String.raw`\p{Lu}[\p{L}'’-]*(?:\s+(?:and|&)\s+\p{Lu}[\p{L}'’-]*|\s+et\s+al\.?)?\s+[(（]\s*(?:\d{4}[a-z]?|n\.d\.)[^()（）]*[)）]`;
const BRACKETED = String.raw`[(（][^()（）]*(?:\b\d{4}[a-z]?\b|\bn\.d\.)[^()（）]*[)）]`;
const NUMBERED = String.raw`\[\s*\d+(?:\s*[,;–-]\s*\d+)*\s*\]`;
const CITATIONS = new RegExp(`${NARRATIVE}|${BRACKETED}|${NUMBERED}`, "gu");
/** Double quotes (straight or curly) and single quotes that open after a non-letter and close before one, so apostrophes are not quotes. */
const QUOTES = /[“"]([^”"]{3,})[”"]|['‘]([^'’‘]{3,})['’](?![\p{L}\p{N}])/gu;

/**
 * Matches of `re` in `s`, except those `insideWord` says must not start right after a letter or digit (as a lookbehind
 * did): a refused match is retried one character further on, as the regex engine does for a failed lookbehind.
 */
function matchesFromWordStart(re: RegExp, s: string, insideWord: (m: RegExpExecArray) => boolean): RegExpExecArray[] {
  const scan = new RegExp(re.source, re.flags);
  const out: RegExpExecArray[] = [];
  for (let m = scan.exec(s); m; m = scan.exec(s)) {
    if (insideWord(m) && /[\p{L}\p{N}]$/u.test(s.slice(0, m.index))) scan.lastIndex = m.index + 1;
    else out.push(m);
  }
  return out;
}

/** Text that must survive word for word: citations and quotations. */
export function lockedIn(s: string): string[] {
  // The narrative pattern starts with a capital letter, the single-quote one with its quote mark (group 2).
  const citations = matchesFromWordStart(CITATIONS, s, (m) => /^\p{Lu}/u.test(m[0])).map((m) => m[0]);
  const quotes = matchesFromWordStart(QUOTES, s, (m) => m[2] !== undefined).map((m) => m[1] ?? m[2]);
  return [...citations, ...quotes];
}

/** "I" and its contractions (I'd, I'm, I've, I'll): never a name. */
const isI = (w: string) => /^I(?:['’][a-z]+)?$/.test(w);

/**
 * Names and terms: capitalised words inside each sentence, and a sentence's first word only when it is a name known
 * from elsewhere in the text (a capitalised word that turns up mid-sentence somewhere, like "Blackmore"): an ordinary
 * opener such as "Urban" may be reworded. Read sentence by sentence, because a later round rewrites a suggestion of
 * two or three sentences: the openers of its second and third ("That", "Honestly") are not names either. Until
 * 2026-10-29 they were, and round 2 of Neo's 100% essay kept 3 of its 15 new suggestions.
 */
function namesIn(s: string, known: ReadonlySet<string>): string[] {
  return splitSentences(s).flatMap((x) => wordsOf(x.text).filter((w, i) => /^\p{Lu}/u.test(w) && !isI(w) && (i > 0 || (!STARTERS.has(w.toLowerCase()) && known.has(w)))));
}

/** Capitalised words seen inside sentences (not as the first word) anywhere in the report: the names and terms of the essay. */
export function knownNames(result: AutoReportResult): Set<string> {
  const out = new Set<string>();
  for (const p of result.paragraphs) for (const s of p.sentences) wordsOf(s.text).forEach((w, i) => i > 0 && /^\p{Lu}/u.test(w) && out.add(w));
  return out;
}

/** Whether `word` appears in `text` as a whole word, same capitals. */
const hasWord = (text: string, word: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "u").test(text);

/**
 * Why a suggestion cannot be used, or null when it passes every check. The checks are the guardrails: a suggestion
 * that fails one is not shown, and the sentence stays as it was. The meaning may change (see the top of this file);
 * what may not is a number added, a citation or quotation changed or added, or a name changed.
 */
export function checkRewrite(original: string, rewrite: string, known: ReadonlySet<string> = new Set(), student?: string): string | null {
  const o = original.trim();
  const r = rewrite.trim();
  if (!r) return "empty";
  if (r.replace(/\s+/g, " ") === o.replace(/\s+/g, " ")) return "unchanged";
  const parts = splitSentences(r);
  if (/[\r\n]/.test(r) || parts.length > MAX_SPLIT) return "split into too many sentences";
  // The detector flags runs of short tidy sentences (signal 3) and short predictable ones (8): a suggestion may not
  // have more sentences than the original (two when the original is a long sentence), and none of its sentences may be short.
  const wordCount = (t: string) => wordsOf(t).length;
  if (parts.length > Math.max(splitSentences(o).length, wordCount(o) >= LONG_SENTENCE ? 2 : 1)) return "split into more sentences than the original: write it as one long sentence, ideas strung with commas, so, but, which";
  if (parts.length > 1 && parts.some((x) => wordCount(x.text) < MIN_SPLIT_WORDS)) return "a short sentence was split off: the detector flags short tidy sentences, keep it in one long sentence";
  const ratio = r.length / Math.max(1, o.length);
  // A later round rewrites an earlier suggestion, but the length limit is the student's own sentence: rounds must not compound.
  const growth = r.length / Math.max(1, (student ?? o).trim().length);
  if (ratio < 0.4 || growth > MAX_GROWTH) return "length changed too much";
  const numbers = new Set(numbersIn(o));
  for (const n of numbersIn(r)) if (!numbers.has(n)) return `a number (${n}) was added`;
  for (const t of lockedIn(o)) if (!r.includes(t)) return "a citation or quotation was changed";
  for (const t of lockedIn(r)) if (!o.includes(t)) return "a citation or quotation was added";
  for (const w of namesIn(o, known)) if (!hasWord(r, w)) return `the name or term "${w}" was changed`;
  return null;
}

/**
 * Builds the stored items from the model's answers, checking every one. `answers` maps sentence number to the suggestion.
 * `students` maps a sentence number to the student's own sentence, for a later round whose `sentences` are earlier suggestions.
 */
export function buildItems(sentences: ReportSentence[], answers: Map<number, string>, known: ReadonlySet<string> = new Set(), students?: ReadonlyMap<number, string>): RewriteItem[] {
  return sentences.map((s) => {
    const base = { n: s.n, original: s.text, ...(s.why ? { why: s.why } : {}) };
    const given = answers.get(s.n);
    if (!given) return { ...base, rewrite: null, kept: "no suggestion came back" };
    const problem = checkRewrite(s.text, given, known, students?.get(s.n));
    return problem ? { ...base, rewrite: null, kept: problem } : { ...base, rewrite: given };
  });
}

/**
 * The student's text with the accepted suggestions in place. With the pasted text, each accepted sentence is replaced
 * inside it, so headings and line breaks stay; when a sentence can't be found there (or the text is gone), the
 * paragraphs of the report are joined instead.
 */
export function reviseText(source: string | null, result: AutoReportResult, rewrite: ReportRewrite, decisions: Record<number, Decision | undefined>): string {
  const accepted = new Map(rewrite.items.filter((i) => i.rewrite && decisions[i.n] === "accept").map((i) => [i.n, i.rewrite as string]));
  const sentences = result.paragraphs.flatMap((p) => p.sentences);
  if (source) {
    let out = "";
    let cursor = 0;
    let ok = true;
    for (const s of sentences) {
      const swap = accepted.get(s.n);
      if (swap === undefined) continue;
      const at = source.indexOf(s.text, cursor);
      if (at < 0) {
        ok = false;
        break;
      }
      out += source.slice(cursor, at) + swap;
      cursor = at + s.text.length;
    }
    if (ok) return out + source.slice(cursor);
  }
  return result.paragraphs.map((p) => p.sentences.map((s) => accepted.get(s.n) ?? s.text).join(" ")).join("\n\n");
}
