/**
 * "Fix flagged phrasing, keep your meaning": suggested rewrites for the sentences a finished report flagged.
 * Pure functions, no I/O, so they can be tested (the DeepSeek calls are in rewrite-run.ts).
 *
 * Only the flagged sentences are rewritten, one sentence for one sentence, guided by the reviewer's reason for each.
 * The model's answer is never trusted: every suggestion is checked here against the original (numbers, citations,
 * quotations and names must survive, hedges must stay, no new causal link, same length range, one sentence), and a
 * suggestion that fails a check is dropped, so that sentence stays as the student wrote it. Backtest 2026-10-26
 * (21 essays, rewrites written by Claude): rewriting only the flagged sentences by the reviewer's reason cleared 44%
 * of them against 18% for a plain re-run; an English-Chinese-English round trip did nothing, so it is not used.
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

export interface ReportRewrite {
  version: 1;
  model: string;
  createdAt: string;
  /** Credits charged for it (0 for an admin's test). Absent on rewrites made before the add-on was priced. */
  credits?: number;
  items: RewriteItem[];
}

/** What the add-on costs for this report, in credits (see rewritePrice in config/pricing.ts). */
export function rewriteCredits(order: { price: number; source_text: string | null }, result: AutoReportResult): number {
  const chars = order.source_text?.length ?? result.paragraphs.reduce((sum, p) => sum + p.sentences.reduce((n, s) => n + s.text.length + 1, 0), 0);
  return toCredits(rewritePrice(order.price, chars));
}

/** The most sentences rewritten for one report (a cost and a quality limit). */
export const MAX_REWRITE_SENTENCES = 60;
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

export const REWRITE_PROMPT = `You help a student fix sentences of their OWN essay that a reviewer marked as reading like stock model-written prose. For each marked sentence you get the reviewer's reason. Rewrite that one sentence so the problem named in the reason is gone, and keep everything the sentence says.

For every item you get: id, "before" and "after" (the neighbouring sentences, for context only: never rewrite or repeat them), the "sentence" to rewrite, the reviewer's "reason" and "ask". If "last_try_failed_because" is present, your earlier rewrite of that sentence was refused for that reason: avoid it this time.

Rules, all of them:
- Return exactly one sentence for each input sentence. Never merge, split, drop or add sentences. Do not put a full stop followed by a new capitalised sentence inside the answer (a semicolon is fine).
- Keep the meaning, every fact, every number, every name and every in-text citation exactly as written, for example (Gabora, 1998). Keep text inside quotation marks exactly as it is. Add no new idea, example, fact or link between ideas. Remove no claim.
- Keep hedges as they are: if the sentence says "suggests", "may", "can", "often" or "seems", the rewrite must be just as careful. Never turn "suggests" into "shows" or "proves". Do not add words like "therefore", "thus", "because", "as a result" or "leads to" unless the sentence already has them.
- Keep the person, the tense and the sentence's job in its paragraph. Keep it between 70% and 130% of the original length.
- Write the way an ordinary student writer would say it in everyday words. Never put in spelling or grammar mistakes on purpose.
- Use the reviewer's reason. The signals it may name, and what to do about each:
  1 ready-made academic phrases (plays a key role, it is worth noting) -> plain everyday wording for the same idea.
  2 ready-made sentence frame with the nouns swapped -> say the point directly, in a sentence shape of your own.
  3 one idea per short tidy sentence -> let the sentence carry its idea in a more connected way (commas, "so", "which"), adding no content.
  4 abstract, neutral generalisation that names nobody -> make the wording more concrete, naming who or what is meant ONLY if the essay itself says so; invent nothing.
  5 formal "upgraded" synonyms -> the plainer word you would normally use.
  6 flawless textbook sentence -> loosen it into how you would explain it to a classmate.
  7 template structure: (a) "not X, but Y" punchline -> state the point directly; (b) three-item list -> keep every item, but phrase it less like a triad; (c) First / Second / Finally opener or label-and-colon -> drop the ordinal or label and link the idea in running prose.
  8 predictable wording (every word the obvious next one) -> choose less obvious but still correct and natural words.
  9 plain-style flourish (colon reveal, callback line, tidy closing line) -> restate plainly, with no reveal or flourish.
  If the reason quotes a specific phrase, fix exactly that phrase.

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
  if (/[\r\n]/.test(r) || splitSentences(r).length !== 1) return "not one sentence";
  const ratio = r.length / Math.max(1, o.length);
  if (ratio < 0.7 || ratio > 1.3) return "length changed too much";
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

export type Decision = "accept" | "reject";

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
