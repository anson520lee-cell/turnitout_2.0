/**
 * Re-check support: find which sentences of a revised draft differ from the
 * previous draft, so the reviewer only looks at those (and their paragraphs).
 * Pure functions, no I/O, so they can be tested.
 */

export interface Sentence {
  /** 1-based paragraph and sentence numbers, as the reviewer labels them ("P2 S3"). */
  p: number;
  s: number;
  text: string;
}

/** Paragraphs are separated by blank lines; sentences end at . ! ? followed by a capital letter, quote or bracket. */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  paragraphs.forEach((para, pi) => {
    const parts = para.split(/(?<=[.!?])\s+(?=[A-Z(“"'])/).map((x) => x.trim()).filter(Boolean);
    parts.forEach((sentence, si) => out.push({ p: pi + 1, s: si + 1, text: sentence }));
  });
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

/** Word overlap between two sentences, 0 to 1 (Jaccard over distinct words). */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / (A.size + B.size - shared);
}

export interface ChangedSentence extends Sentence {
  /** The most similar sentence in the previous draft, when there is a reasonably close one. */
  was: string | null;
  similarity: number;
}

/** Below this word overlap a sentence is treated as new or rewritten from scratch, with no "was". */
const CLOSE = 0.3;

/**
 * Sentences of `next` that do not appear unchanged in `previous`, each with the
 * closest earlier sentence (if any). Identical sentences, even if moved, count
 * as unchanged.
 */
export function changedSentences(previous: string, next: string): ChangedSentence[] {
  const before = splitSentences(previous);
  const beforeSet = new Set(before.map((x) => norm(x.text)));
  const changed: ChangedSentence[] = [];
  for (const sentence of splitSentences(next)) {
    if (beforeSet.has(norm(sentence.text))) continue;
    let best: { text: string; sim: number } | null = null;
    for (const old of before) {
      const sim = similarity(sentence.text, old.text);
      if (!best || sim > best.sim) best = { text: old.text, sim };
    }
    const close = best !== null && best.sim >= CLOSE;
    changed.push({ ...sentence, was: close ? best!.text : null, similarity: best ? Math.round(best.sim * 100) / 100 : 0 });
  }
  return changed;
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The user message for a re-check: both drafts and the list of changed sentences. */
export function recheckInput(previous: string, next: string): { message: string; changed: ChangedSentence[] } {
  const changed = changedSentences(previous, next);
  const lines = changed.map((c) =>
    c.was
      ? `P${c.p} S${c.s} | now: "${clip(c.text)}" | was: "${clip(c.was)}" | word overlap ${Math.round(c.similarity * 100)}%`
      : `P${c.p} S${c.s} | now: "${clip(c.text)}" | no close match in the previous draft (new or fully rewritten)`,
  );
  const message = [
    "<previous_draft>",
    previous,
    "</previous_draft>",
    "<draft>",
    next,
    "</draft>",
    "<changed_sentences>",
    lines.length ? lines.join("\n") : "(none: the draft is identical to the previous one)",
    "</changed_sentences>",
  ].join("\n");
  return { message, changed };
}
