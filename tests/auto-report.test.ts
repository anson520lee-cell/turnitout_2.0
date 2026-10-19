import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../lib/chunking";
import { overallFor, stitchReport } from "../lib/auto-report/stitch";

const sentence = (n: number) => `This is sentence number ${n} of the sample, written to have a fair length.`;
const paragraph = (start: number, count: number) => Array.from({ length: count }, (_, i) => sentence(start + i)).join(" ");
const essay = [paragraph(1, 5), paragraph(6, 4), paragraph(10, 6), paragraph(16, 3)].join("\n\n");

const answer = (flags: string[]) => `A. Sentence flags\n${flags.join("\n")}\n\nB. Paragraph overview\n- P1: 3 high/medium sentences in a row | Risk: High | Almost no natural sentences.\n\nC. Overall\n- Overall risk: High, because of P1.\n\nD. Grammar (location and type only)\n- P1 S2: subject-verb agreement`;

test("labels of a later piece are mapped back to the whole text", () => {
  const chunks = chunkText(essay, 500);
  assert.ok(chunks.length >= 2);
  const second = chunks[1];
  const flag = `- P1 S1 "This is sentence..." | Risk: High | Signals 3, 4: tidy | Ask: How would you say it?`;
  const result = stitchReport(essay, [
    { idx: 0, ok: true, truncated: false, report: answer(["- No sentences flagged."]) },
    { idx: 1, ok: true, truncated: false, report: answer([flag]) },
  ], 500);
  const hit = result.paragraphs.flatMap((p) => p.sentences).find((s) => s.risk === "high");
  assert.equal(hit?.n, second.first + 1);
  assert.equal(hit?.ask, "How would you say it?");
  assert.equal(result.summary.high, 1);
  assert.equal(result.grammar.length >= 1, true);
});

test("pieces that failed are not counted as reviewed", () => {
  const result = stitchReport(essay, [{ idx: 0, ok: false, truncated: false, report: "" }], 500);
  assert.equal(result.pieces.reviewed, 0);
  assert.equal(result.summary.flaggedShare, 0);
  assert.equal(result.summary.sentences, 18);
});

test("a paragraph is never rated safer than its sentences", () => {
  const flags = [1, 2, 3].map((s) => `- P1 S${s} "This is..." | Risk: Medium | Signal 3`);
  const result = stitchReport(paragraph(1, 5), [{ idx: 0, ok: true, truncated: false, report: answer(flags) }], 5000);
  assert.equal(result.paragraphs[0].risk, "high");
});

test("overall bands", () => {
  assert.equal(overallFor(0.1), "low");
  assert.equal(overallFor(0.4), "moderate");
  assert.equal(overallFor(0.49), "moderate");
  assert.equal(overallFor(0.5), "elevated");
  assert.equal(overallFor(0.8), "elevated");
});

import { refinementPrice, reportPrice, reportPricing } from "../config/pricing";
import { reportCharError } from "../lib/orders/limits";

test("report price: 1 credit per 200 characters, rounded up, minimum 10 credits, at most 40 credits", () => {
  assert.equal(reportPrice(500), 1000);
  assert.equal(reportPrice(2000), 1000);
  assert.equal(reportPrice(2001), 1100);
  assert.equal(reportPrice(7999), 4000);
  assert.equal(reportPrice(6000), 3000);
  assert.equal(reportPrice(12345), 4000);
  assert.equal(reportPrice(20000), 4000);
});

test("refinement price: 1 credit per 200 characters, rounded up, minimum 15 credits", () => {
  assert.equal(refinementPrice(500), 1500);
  assert.equal(refinementPrice(3000), 1500);
  assert.equal(refinementPrice(3001), 1600);
  assert.equal(refinementPrice(4250), 2200);
});

test("report length limits are in characters", () => {
  assert.equal(reportCharError(reportPricing.minChars), null);
  assert.equal(reportCharError(reportPricing.maxChars), null);
  assert.ok(reportCharError(reportPricing.minChars - 1));
  assert.ok(reportCharError(reportPricing.maxChars + 1));
});

import { topUpBonusPercent, usdToCredits } from "../config/pricing";

test("top-up bonus: larger top-ups add bonus credits", () => {
  assert.equal(usdToCredits(5), 40);
  assert.equal(usdToCredits(10), 80);
  assert.equal(usdToCredits(20), 168);
  assert.equal(usdToCredits(100), 920);
  assert.equal(usdToCredits(150), 1380);
  assert.equal(usdToCredits(200), 2000);
  assert.equal(usdToCredits(500), 5200);
  assert.equal(topUpBonusPercent(19), 0);
  assert.equal(topUpBonusPercent(20), 5);
});
