/**
 * "Fix flagged phrasing, keep your meaning": suggested rewrites for the sentences a finished report flagged.
 * Pure functions, no I/O, so they can be tested (the DeepSeek calls are in rewrite-run.ts).
 *
 * Only the flagged sentences are rewritten, each into one to three sentences in a plain student voice, guided by the
 * reviewer's reason for each. The model's answer is never trusted: every suggestion is checked here against the
 * original (numbers, citations, quotations and names must survive, hedges must stay, no new causal link, similar
 * length, at most MAX_SPLIT sentences), and a suggestion that fails a check is dropped, so that sentence stays as the
 * student wrote it. Backtest 2026-10-26 (21 essays, rewrites written by Claude): rewriting only the flagged sentences
 * by the reviewer's reason cleared 44% of them against 18% for a plain re-run; an English-Chinese-English round trip
 * did nothing, so it is not used.
 *
 * Plain voice since 2026-10-28: a synonym swap that keeps each sentence's shape was still counted on the re-check (29
 * of 31 sentences on Neo's Gemini essay), while a plain-voice rewrite of the same essay with nothing invented dropped
 * the High sentences from 73-97% to 0-13% (/mnt/project-files/refine-recheck/results-2026-10-28.md).
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
/** The most sentences one flagged sentence may become (a long one is often better said in two or three). */
export const MAX_SPLIT = 3;
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

export const REWRITE_PROMPT = `You help a student rewrite sentences of their OWN essay that a reviewer marked as reading like model-written prose. Polishing the wording is not enough: the reviewer still flags a sentence that keeps its original shape with new synonyms, and any sentence that is smooth, formal and completely predictable. Rewrite each marked sentence the way a capable student would say the same thing in their own plain voice, as if explaining it to a classmate.

For every item you get: id, "before" and "after" (the neighbouring sentences, for context only: never rewrite or repeat them), the "sentence" to rewrite, the reviewer's "reason" and "ask". If "last_try_failed_because" is present, your earlier rewrite of that sentence was refused for that reason: avoid it this time.

Never change what the sentence says:
- Keep the meaning, every fact, every number, every name and every in-text citation exactly as written, for example (Gabora, 1998). Keep text inside quotation marks exactly as it is. Add no new idea, example, fact, personal story or detail the essay does not give. Remove no claim.
- Keep hedges as they are: if the sentence says "suggests", "may", "can", "often" or "seems", the rewrite must be just as careful. Never turn "suggests" into "shows" or "proves". Do not add words like "therefore", "thus", "because", "as a result" or "leads to" unless the sentence already has them.
- Keep the tense and the sentence's job in its paragraph. You may say "we" or "you" for people in general; write "I" only if the essay already does.
- Return one to three sentences for each input sentence, together between 60% and 150% of the original length. Never merge it with a neighbour.

Change how it is said:
- Change the shape, not only the words. Never keep the original frame with synonyms swapped in. Start the sentence differently and put the main point first.
- Everyday words. Drop stock academic phrases (in an era of, plays a key role, profound, pervasive, fundamentally, serves as, landscape, fabric, underscores, it is worth noting) and say the plain thing.
- When the sentence is long, split it into two or three sentences of clearly different lengths; a short, blunt sentence is good. Contractions (it's, don't, we're) are fine.
- Lists: keep every item, but never as a balanced row of matching phrases. Give the items different lengths, or spread them over clauses or sentences.
- Drop signposting openers (Furthermore, Moreover, Additionally, Consequently, Ultimately, On a broader scale, In conclusion) and colon reveals. Link ideas plainly with "and", "but", "so" or "also", or not at all.
- Drop "not X but Y", "rather than" and "neither... nor" punchlines: say the main point straight, then the contrast if it is part of the claim.
- No neat moral, slogan or callback at the end.
- It must still read as a sound school essay: no slang, no emojis, and never put in spelling or grammar mistakes on purpose.
- Use the reviewer's reason. If it quotes a specific phrase, that phrase must go. Its signals mean: 1 ready-made phrases, 2 sentence frame with nouns swapped, 3 short tidy one-idea sentences in a row, 4 abstract generalisation naming nobody (be concrete only with what the essay itself says), 5 upgraded synonyms, 6 flawless textbook sentence, 7 template structure (contrast punchline, three-item list, ordinal or label openers), 8 every word the obvious next one, 9 flourish such as a colon reveal or a tidy closing line.

Answer with JSON only, no other text, in this shape: [{"id": 12, "rewrite": "..."}]. Include every id you were given.`;

/** The user message for a batch of sentences: each with its neighbours and the reviewer's reason. `redo` carries why an earlier try was refused. */
export function rewriteInput(items: ReportSentence[], result: AutoReportResult, redo?: Map<number, string>): string {
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
  return ["<sentences>", JSON.stringify(list, null, 1), "</sentences>"].join("\n");
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

const HEDGE = /\b(may|might|can|could|suggests?|suggested|appears?|seems?|likely|perhaps|possibly|probably|tends?|often|generally|typically|somewhat|partly|arguably|sometimes)\b/i;
const STRONG = /\b(proves?|proven|demonstrates?|undoubtedly|certainly|definitely|always|never|must|clearly shows?)\b/i;
const CAUSAL = /\b(therefore|thus|hence|consequently|as a result|because|due to|leads? to|led to|results? in|resulting in|accordingly)\b/gi;
const NEGATION = /\b(not|no|never|neither|nor|none|cannot)\b|n['’]t\b/gi;
/** Capitalised words that open many sentences without being names. */
const STARTERS = new Set(
  `the a an this that these those it its in on at for as by to of with while although however moreover furthermore overall thus therefore first second third firstly secondly thirdly finally lastly additionally also one many most some such there when if because since both each every another other they he she we i what how why who which despite given during after before from through within without among between whilst instead rather yet but and so not no all any more much being having under over across whether only even still indeed ultimately today nowadays currently recently importantly notably crucially simply clearly fact example instance`.split(/\s+/),
);

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;
const wordsOf = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/** Numbers as written ("1998", "3.5", "12,000"), without a trailing full stop. */
export function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/[,.]$/, ""));
}

/** Text that must survive word for word: bracketed citations and quotations. */
export function lockedIn(s: string): string[] {
  const citations = s.match(/\([^()]*\b\d{4}[a-z]?\b[^()]*\)/g) ?? [];
  const quotes = [...s.matchAll(/[“"]([^”"]{3,})[”"]/g)].map((m) => m[1]);
  return [...citations, ...quotes];
}

/**
 * Names and terms: capitalised words inside the sentence, and its first word only when it is a name known from
 * elsewhere in the text (a capitalised word that turns up mid-sentence somewhere, like "Blackmore"): an ordinary
 * opener such as "Urban" may be reworded.
 */
function namesIn(s: string, known: ReadonlySet<string>): string[] {
  return wordsOf(s).filter((w, i) => /^\p{Lu}/u.test(w) && w !== "I" && (i > 0 || (!STARTERS.has(w.toLowerCase()) && known.has(w))));
}

/** Capitalised words seen inside sentences (not as the first word) anywhere in the report: the names and terms of the essay. */
export function knownNames(result: AutoReportResult): Set<string> {
  const out = new Set<string>();
  for (const p of result.paragraphs) for (const s of p.sentences) wordsOf(s.text).forEach((w, i) => i > 0 && /^\p{Lu}/u.test(w) && out.add(w));
  return out;
}

/** Whether `word` appears in `text` as a whole word, same capitals. */
const hasWord = (text: string, word: string) => new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "u").test(text);

/**
 * Why a suggestion cannot be used, or null when it passes every check. The checks are the guardrails: a suggestion
 * that fails one is not shown, and the sentence stays as the student wrote it.
 */
export function checkRewrite(original: string, rewrite: string, known: ReadonlySet<string> = new Set()): string | null {
  const o = original.trim();
  const r = rewrite.trim();
  if (!r) return "empty";
  if (r.replace(/\s+/g, " ") === o.replace(/\s+/g, " ")) return "unchanged";
  if (/[\r\n]/.test(r) || splitSentences(r).length > MAX_SPLIT) return "split into too many sentences";
  const ratio = r.length / Math.max(1, o.length);
  if (ratio < 0.6 || ratio > 1.5) return "length changed too much";
  for (const n of numbersIn(o)) if (!r.includes(n)) return `the number ${n} was changed`;
  for (const t of lockedIn(o)) if (!r.includes(t)) return "a citation or quotation was changed";
  for (const w of namesIn(o, known)) if (!hasWord(r, w)) return `the name or term "${w}" was changed`;
  if (HEDGE.test(o) && !HEDGE.test(r)) return "a hedge was removed";
  if (STRONG.test(r) && !STRONG.test(o)) return "the claim was made stronger";
  const causal = new Set((o.match(CAUSAL) ?? []).map((x) => x.toLowerCase()));
  for (const c of r.match(CAUSAL) ?? []) if (!causal.has(c.toLowerCase())) return "a causal link was added";
  if (count(o, NEGATION) !== count(r, NEGATION)) return "the meaning may have flipped";
  return null;
}

/** Builds the stored items from the model's answers, checking every one. `answers` maps sentence number to the suggestion. */
export function buildItems(sentences: ReportSentence[], answers: Map<number, string>, known: ReadonlySet<string> = new Set()): RewriteItem[] {
  return sentences.map((s) => {
    const base = { n: s.n, original: s.text, ...(s.why ? { why: s.why } : {}) };
    const given = answers.get(s.n);
    if (!given) return { ...base, rewrite: null, kept: "no suggestion came back" };
    const problem = checkRewrite(s.text, given, known);
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
