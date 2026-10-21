import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../lib/chunking";
import { splitSentences } from "../lib/recheck";
import { scoreTrial, summarize, rates, type Sample, type Trial } from "../lib/chunk-eval";

const sentence = (n: number) => `This is sentence number ${n} of the sample, written to have a fair length.`;
const paragraph = (start: number, count: number) => Array.from({ length: count }, (_, i) => sentence(start + i)).join(" ");
const essay = [paragraph(1, 5), paragraph(6, 4), paragraph(10, 6), paragraph(16, 3), paragraph(19, 5), paragraph(24, 4)].join("\n\n");

test("pieces cover every sentence once, in order", () => {
  const all = splitSentences(essay);
  for (const size of [200, 400, 700, 1500, 5000]) {
    const chunks = chunkText(essay, size);
    let next = 0;
    for (const c of chunks) {
      assert.equal(c.first, next);
      assert.equal(splitSentences(c.text).length, c.count, `size ${size}: count matches what the reviewer will number`);
      assert.deepEqual(splitSentences(c.text).map((s) => s.text), all.slice(c.first, c.first + c.count).map((s) => s.text));
      next += c.count;
    }
    assert.equal(next, all.length);
  }
});

test("a long text becomes pieces near the target size", () => {
  const chunks = chunkText(essay, 700);
  assert.ok(chunks.length >= 3);
  for (const c of chunks.slice(0, -1)) assert.ok(c.text.length >= 300 && c.text.length <= 700 * 1.25 + 80, `piece of ${c.text.length}`);
});

test("one paragraph longer than the limit is cut at sentence boundaries", () => {
  const one = paragraph(1, 30);
  const chunks = chunkText(one, 400);
  assert.ok(chunks.length > 2);
  for (const c of chunks) assert.ok(/\.$/.test(c.text));
  assert.equal(chunks.reduce((n, c) => n + c.count, 0), 30);
});

test("a text shorter than the size is one piece; a tiny tail is joined to the piece before it", () => {
  assert.equal(chunkText(paragraph(1, 3), 5000).length, 1);
  const withTail = [paragraph(1, 8), paragraph(9, 8), sentence(17)].join("\n\n");
  const chunks = chunkText(withTail, 700);
  assert.ok(chunks[chunks.length - 1].text.length >= 700 * 0.4);
});

test("empty text gives no pieces", () => {
  assert.deepEqual(chunkText("", 1000), []);
});

test("pooled scores: a human text with calls is false alarms, an AI text with calls is hits", () => {
  const text = paragraph(1, 4);
  const sents = splitSentences(text);
  const human: Sample = { id: "h", origin: "human", body: text, sentences: sents.map((s) => ({ p: s.p, s: s.s, flagged: false })) };
  const ai: Sample = { id: "a", origin: "ai", body: text, sentences: sents.map((s) => ({ p: s.p, s: s.s, flagged: true })) };
  const report = `A. Sentence flags\n- P1 S1 "This is..." | Risk: High | Signal 1\n- P1 S2 "This is..." | Risk: Medium | Signal 2`;
  const base = { size: 1000, model: "m", effort: "low", batch: "b1", first: 0, chunk: text, report, ok: true, truncated: false, ms: 20_000, tokens: 5000 };
  const trials: Trial[] = [{ ...base, sampleId: "h" }, { ...base, sampleId: "a" }];
  const samples = new Map([["h", human], ["a", ai]]);
  assert.deepEqual(scoreTrial(trials[0], human), { sentences: 4, positives: 0, hit: 0, falseAlarm: 2, called: 2 });
  const [row] = summarize(trials, samples);
  const r = rates(row.all);
  assert.equal(r.recall, 0.5);
  assert.equal(r.falseAlarmRate, 0.5);
  assert.equal(r.balanced, 0.5);
  assert.equal(row.secondsPerPiece, 20);
});

test("failed or cut-off pieces are not scored", () => {
  const text = paragraph(1, 2);
  const sample: Sample = { id: "s", origin: "ai", body: text, sentences: splitSentences(text).map((s) => ({ p: s.p, s: s.s, flagged: true })) };
  const t: Trial = { sampleId: "s", size: 1000, model: "m", effort: "low", batch: "b", first: 0, chunk: text, report: "", ok: true, truncated: true, ms: 1, tokens: 1 };
  assert.equal(scoreTrial(t, sample), null);
  assert.equal(scoreTrial({ ...t, truncated: false, ok: false }, sample), null);
});

test("base size 3,500: a text slightly over it is still one piece, whatever the paragraphs", () => {
  for (const layout of [[50], [25, 25], [17, 17, 16], [10, 10, 10, 10, 10], [45, 5, 2], [35, 15]]) {
    let at = 1;
    const text = layout.map((n) => { const p = paragraph(at, n); at += n; return p; }).join("\n\n");
    assert.ok(text.length > 3500 && text.length < 3900, `text of ${text.length}`);
    assert.equal(chunkText(text, 3500).length, 1, layout.join("+"));
  }
});

test("queued backtest runs stay under their own cap and the daily cap", async () => {
  const { pieceBudget } = await import("../lib/chunk-queue");
  assert.equal(pieceBudget({ maxPieces: 150, attempted: 0, usedLast24h: 0 }), 150);
  assert.equal(pieceBudget({ maxPieces: 150, attempted: 140, usedLast24h: 0 }), 10);
  assert.equal(pieceBudget({ maxPieces: 150, attempted: 0, usedLast24h: 1980, cap: 2000 }), 20);
  assert.equal(pieceBudget({ maxPieces: 150, attempted: 150, usedLast24h: 0 }), 0);
  assert.equal(pieceBudget({ maxPieces: 150, attempted: 0, usedLast24h: 2100, cap: 2000 }), 0);
});
