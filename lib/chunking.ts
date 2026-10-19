/**
 * Cutting a long text into pieces for the reviewer, one piece at a time.
 * Pieces always end at a paragraph or sentence boundary, never inside a
 * sentence. Pure functions, no I/O, so they can be tested.
 *
 * A piece grows paragraph by paragraph until it reaches `size` characters, or
 * until the next paragraph would push it past `size * MAX_OVER`. A paragraph
 * that is too long on its own is cut at sentence boundaries. A short tail is
 * joined to the piece before it.
 */

import { splitSentences, type Sentence } from "@/lib/recheck";

export interface Chunk {
  /** The piece as sent to the reviewer: paragraphs separated by a blank line. */
  text: string;
  /** Index of the piece's first sentence in the whole text (0-based, text order). */
  first: number;
  /** Number of sentences in the piece. */
  count: number;
}

const MAX_OVER = 1.25;
const SHORT_TAIL = 0.4;

interface Unit {
  text: string;
  first: number;
  count: number;
  /** Starts a new paragraph (false for the later parts of a paragraph that had to be cut). */
  newParagraph: boolean;
}

export function chunkText(text: string, size: number): Chunk[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const max = Math.round(size * MAX_OVER);

  // Units: whole paragraphs, or runs of sentences from a paragraph longer than `max`.
  const units: Unit[] = [];
  let at = 0;
  while (at < sentences.length) {
    const p = sentences[at].p;
    let end = at;
    while (end < sentences.length && sentences[end].p === p) end += 1;
    const para = sentences.slice(at, end);
    const joined = para.map((s) => s.text).join(" ");
    if (joined.length <= max) {
      units.push({ text: joined, first: at, count: para.length, newParagraph: true });
    } else {
      let from = 0;
      while (from < para.length) {
        let to = from;
        let len = 0;
        while (to < para.length && (to === from || len + para[to].text.length + 1 <= size)) {
          len += para[to].text.length + 1;
          to += 1;
        }
        units.push({ text: para.slice(from, to).map((s) => s.text).join(" "), first: at + from, count: to - from, newParagraph: from === 0 });
        from = to;
      }
    }
    at = end;
  }

  // Pack units into pieces.
  const chunks: Chunk[] = [];
  let cur: Unit[] = [];
  const length = (us: Unit[]) => us.reduce((n, u) => n + u.text.length + 2, 0) - 2;
  const flush = () => {
    if (cur.length === 0) return;
    chunks.push(build(cur));
    cur = [];
  };
  for (const u of units) {
    if (cur.length > 0 && (length(cur) >= size || length(cur) + u.text.length + 2 > max)) flush();
    cur.push(u);
  }
  flush();

  // A short last piece is joined to the one before it.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    if (last.text.length < size * SHORT_TAIL) {
      const prev = chunks[chunks.length - 2];
      const lastUnits = units.filter((u) => u.first >= last.first);
      const prevUnits = units.filter((u) => u.first >= prev.first && u.first < last.first);
      chunks.splice(chunks.length - 2, 2, build([...prevUnits, ...lastUnits]));
    }
  }
  return chunks;
}

function build(us: Unit[]): Chunk {
  let text = "";
  us.forEach((u, i) => {
    text += i === 0 ? u.text : (u.newParagraph ? "\n\n" : " ") + u.text;
  });
  return { text, first: us[0].first, count: us.reduce((n, u) => n + u.count, 0) };
}

export type { Sentence };
