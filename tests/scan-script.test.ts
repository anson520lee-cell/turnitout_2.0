import { test } from "node:test";
import assert from "node:assert/strict";
import { stitchReport } from "../lib/auto-report/stitch";
import { liveRate, ratingsBySentence, scanDurationMs, scanPlan, scanPosition } from "../lib/auto-report/scan-script";

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

test("the live rate climbs and lands exactly on the report's figure", () => {
  const flags = ["- P1 S2 \"x\" | Risk: High | Signals 1: tidy", "- P2 S1 \"x\" | Risk: Medium | Signals 2: stock", "- P3 S6 \"x\" | Risk: High | Signals 3: list"];
  const result = stitchReport(essay, [{ idx: 0, ok: true, truncated: false, report: answer(flags) }]);
  const ratings = ratingsBySentence(result);
  const total = scanPlan(essay).sentences.length;
  let last = 0;
  for (let k = 0; k <= total; k++) {
    const r = liveRate(result, ratings, k, total);
    assert.ok(r >= last, "never goes down");
    assert.ok(r <= result.summary.flaggedShare + 1e-9, "never above the final figure");
    last = r;
  }
  assert.equal(liveRate(result, ratings, total, total), result.summary.flaggedShare);
  assert.equal(Math.round(result.summary.flaggedShare * 100), 20);
});

test("scan length: about two minutes for 5,000 characters, within 40 s to 5 min", () => {
  assert.equal(scanDurationMs(5_000), 120_000);
  assert.equal(scanDurationMs(500), 40_000);
  assert.equal(scanDurationMs(20_000), 300_000);
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
