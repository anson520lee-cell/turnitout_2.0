import { test } from "node:test";
import assert from "node:assert/strict";
import { stitchReport } from "../lib/auto-report/stitch";
import { contextLine, flaggedPrefix, liveEstimate, lookaheadLine, ratingsBySentence, reviewerLines, quickScanDurationMs, scanDurationMs, scanPlan, scanPosition, thinkingLine, verifyLine } from "../lib/auto-report/scan-script";

const sentence = (n: number) => `This is sentence number ${n} of the sample, written to have a fair length.`;
const paragraph = (start: number, count: number) => Array.from({ length: count }, (_, i) => sentence(start + i)).join(" ");
const essay = [paragraph(1, 5), paragraph(6, 4), paragraph(10, 6)].join("\n\n");
const answer = (flags: string[]) => `A. Sentence flags\n${flags.join("\n")}\n\nB. Paragraph overview\n\nC. Overall\n- Overall risk: Medium.`;

test("the scan numbers sentences the same way the report does", () => {
  const plan = scanPlan(essay);
  const result = stitchReport(essay, [{ idx: 0, ok: true, truncated: false, report: answer(["- No sentences flagged."]) }]);
  const reportSentences = result.paragraphs.flatMap((p) => p.sentences);
  assert.equal(plan.sentences.length, reportSentences.length);
  plan.sentences.forEach((x, i) => assert.equal(x.text, reportSentences[i].text));
  assert.equal(plan.paragraphs.length, 3);
  assert.equal(plan.pieces, 1);
});

test("the live rate moves up and down with each sentence and lands exactly on the report's figure", () => {
  const flags = ["- P1 S2 \"x\" | Risk: High | Signals 1: tidy", "- P2 S1 \"x\" | Risk: Medium | Signals 2: stock", "- P3 S6 \"x\" | Risk: High | Signals 3: list"];
  const result = stitchReport(essay, [{ idx: 0, ok: true, truncated: false, report: answer(flags) }]);
  const plan = scanPlan(essay);
  const total = plan.sentences.length;
  const prefix = flaggedPrefix(plan, ratingsBySentence(result));
  const final = result.summary.flaggedShare;
  assert.equal(liveEstimate(prefix, total, final, 1.5), null, "too little to show before two sentences are read");
  assert.equal(liveEstimate(prefix, total, final, 2), 0.5, "sentence 2 is flagged: 1 of 2");
  assert.equal(liveEstimate(prefix, total, final, 4), 0.25);
  let prev = liveEstimate(prefix, total, final, 2)!;
  let ups = 0;
  let downs = 0;
  for (let at = 2.01; at < total; at += 0.01) {
    const v = liveEstimate(prefix, total, final, at)!;
    assert.ok(Math.abs(v - prev) < 0.02, "moves smoothly, word by word");
    if (v > prev + 1e-9) ups++;
    if (v < prev - 1e-9) downs++;
    prev = v;
  }
  assert.ok(ups > 0 && downs > 0, "goes both ways");
  assert.ok(Math.abs(prev - final) < 0.02);
  assert.equal(liveEstimate(prefix, total, final, total), final);
  assert.equal(Math.round(final * 100), 20);
});

test("scan logs point at the text but never say how it is judged", () => {
  const flags = ["- P1 S2 \"x\" | Risk: High | Signals 1, 4: repeated wording and even sentence lengths"];
  const result = stitchReport(essay, [{ idx: 0, ok: true, truncated: false, report: answer(flags) }]);
  const plan = scanPlan(essay);
  const ratings = ratingsBySentence(result);
  const lines = [
    ...plan.sentences.flatMap((x) => [lookaheadLine(x), verifyLine(x), thinkingLine(x), ...reviewerLines(x, ratings.get(x.n))]),
    ...plan.paragraphs.flatMap((p) => [contextLine(p.p, "start", 3), contextLine(p.p, "end", 3)]),
  ].map((l) => l.text);
  for (const t of lines) assert.doesNotMatch(t, /signal|repeat|rhythm|phrase|length|transition|connector|words?\b|×|avg|spread/i, t);
  assert.ok(lines.some((t) => /P1 S2 .*→ HIGH/.test(t)), "the real rating is shown");
  assert.ok(lines.some((t) => /paragraph 2 of 3/.test(t)));
});

test("scan length: a fixed rate per character, no floor or cap", () => {
  assert.equal(scanDurationMs(5_000), 70_000);
  assert.equal(scanDurationMs(500), 7_000);
  assert.equal(scanDurationMs(20_000), 280_000);
  assert.equal(quickScanDurationMs(2_000), 8_000);
  assert.equal(quickScanDurationMs(200), 800);
});

test("scan position walks through the sentences in order", () => {
  const plan = scanPlan(essay);
  assert.deepEqual(scanPosition(plan, 0), { index: 0, within: 0 });
  assert.equal(scanPosition(plan, 1).index, plan.sentences.length);
  let prev = 0;
  for (let f = 0; f <= 1; f += 0.01) {
    const { index } = scanPosition(plan, f);
    assert.ok(index >= prev);
    prev = index;
  }
});
