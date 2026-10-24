import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../lib/chunking";
import { COUNTED_CURVE, PIECE_SIZE, aiScore, countsTowardScore, overallFor, reportOverall, reportScore, stitchReport } from "../lib/auto-report/stitch";

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
  // Bands follow the AI score: under 30 Low, 30 to 59 Moderate, 60 and over Elevated.
  assert.equal(overallFor(0.1), "low");
  assert.equal(overallFor(0.52), "low");
  assert.equal(overallFor(0.53), "moderate");
  assert.equal(overallFor(0.63), "moderate");
  assert.equal(overallFor(0.64), "elevated");
  assert.equal(overallFor(0.8), "elevated");
});

test("the AI score leans to 0 below 60% flagged and to 100 above it", () => {
  const pct = (share: number) => Math.round(aiScore(share) * 100);
  assert.equal(pct(0), 0);
  assert.equal(pct(1), 100);
  assert.equal(pct(0.6), 50);
  assert.equal(pct(0.5), 23);
  assert.equal(pct(0.7), 77);
  assert.equal(pct(-0.2), 0);
  assert.equal(pct(1.3), 100);
  for (let x = 0; x < 1; x += 0.05) assert.ok(aiScore(x + 0.05) > aiScore(x), "keeps the order of texts");
});

test("a sentence counts toward the score when High, or Medium citing signal 7, 8 or 9", () => {
  assert.equal(countsTowardScore("high"), true);
  assert.equal(countsTowardScore("high", "Signals 1, 5: formal synonym"), true);
  assert.equal(countsTowardScore("medium", "Signals 7b, 1: carries a three-item list"), true);
  assert.equal(countsTowardScore("medium", "Signal 8: every word is the obvious one"), true);
  assert.equal(countsTowardScore("medium", "Signals 4, 9: tidy closing line"), true);
  assert.equal(countsTowardScore("medium", "Signals 1, 3: ready-made phrase; run of short sentences"), false);
  assert.equal(countsTowardScore("medium", "Signal 6: flawless, though it mentions 7 days"), false);
  assert.equal(countsTowardScore("medium", "Signal: passive, agentless description"), false);
  assert.equal(countsTowardScore("medium"), false);
  assert.equal(countsTowardScore("uncertain", "Signal 8: obvious wording"), false);
  assert.equal(countsTowardScore("low", "Signal 7"), false);
});

test("the report scores only the counted sentences, on the counted curve", () => {
  const flags = [
    `- P1 S1 "This is..." | Risk: High | Signals 1, 2: stock frame`,
    `- P1 S2 "This is..." | Risk: Medium | Signals 7a, 1: template opening`,
    `- P1 S3 "This is..." | Risk: Medium | Signals 1, 5: formal synonym`,
    `- P1 S4 "This is..." | Risk: Medium | Signal 3: run of short sentences`,
  ];
  const result = stitchReport(paragraph(1, 5), [{ idx: 0, ok: true, truncated: false, report: answer(flags) }], 5000);
  const sentences = result.paragraphs[0].sentences;
  assert.deepEqual(sentences.map((x) => Boolean(x.counts)), [true, true, false, false, false]);
  assert.equal(result.summary.flaggedShare, 0.8);
  assert.equal(result.summary.counted, 2);
  assert.equal(result.summary.countedShare, 0.4);
  assert.equal(Math.round(reportScore(result.summary) * 100), 50, "40% counted sits at the middle of the counted curve");
  assert.equal(result.summary.overall, "moderate");
  assert.equal(reportOverall(result.summary), "moderate");
});

test("reports made before counted sentences keep the old score", () => {
  const old = { flaggedShare: 0.7 };
  assert.equal(reportScore(old), aiScore(0.7));
  assert.equal(reportOverall(old), overallFor(0.7));
});

test("counted curve bands: red from about 43.5% of sentences counted, yellow from about 33%", () => {
  assert.equal(overallFor(0.33, COUNTED_CURVE), "low");
  assert.equal(overallFor(0.34, COUNTED_CURVE), "moderate");
  assert.equal(overallFor(0.43, COUNTED_CURVE), "moderate");
  assert.equal(overallFor(0.44, COUNTED_CURVE), "elevated");
  assert.equal(Math.round(aiScore(0, COUNTED_CURVE) * 100), 0);
  assert.equal(Math.round(aiScore(1, COUNTED_CURVE) * 100), 100);
});

import { billableChars, refinementPrice, reportChargedChars, reportPrice, reportPricing, toCredits } from "../config/pricing";
import { reportCharError } from "../lib/orders/limits";

test("report price: 1 credit per 200 characters, minimum 10 credits, first 8,000 of every 20,000 charged", () => {
  assert.equal(reportPrice(500), 1000);
  assert.equal(reportPrice(2000), 1000);
  assert.equal(reportPrice(2001), 1100);
  assert.equal(reportPrice(6000), 3000);
  assert.equal(reportPrice(7999), 4000);
  // Characters 8,001 to 20,000 are free, so the first cycle never costs more than 40 credits.
  assert.equal(reportPrice(8000), 4000);
  assert.equal(reportPrice(12345), 4000);
  assert.equal(reportPrice(20000), 4000);
  // The next cycle starts charging again at 20,001.
  assert.equal(reportPrice(20001), 4100);
  assert.equal(reportPrice(28000), 8000);
  assert.equal(reportPrice(40000), 8000);
  assert.equal(reportPrice(50000), 12_000);
  assert.equal(reportPrice(100000), 20_000);
});

test("charged characters follow the cycle constants", () => {
  assert.equal(reportChargedChars(0), 0);
  assert.equal(reportChargedChars(8000), 8000);
  assert.equal(reportChargedChars(19999), 8000);
  assert.equal(reportChargedChars(20000), 8000);
  assert.equal(reportChargedChars(20500), 8500);
  assert.equal(reportChargedChars(100000), 5 * reportPricing.chargedChars);
  assert.equal(reportChargedChars(100000) + 5 * (reportPricing.cycleChars - reportPricing.chargedChars), 100000);
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
  assert.equal(reportPricing.maxChars, 100_000);
  assert.match(reportCharError(reportPricing.maxChars + 1) ?? "", /up to 100,000/);
});

test("a 100,000-character report is about 29 pieces, priced up front and stitched from mocked answers", () => {
  const paragraphs = Array.from({ length: 280 }, (_, i) => paragraph(i * 5 + 1, 5));
  const text = paragraphs.join("\n\n").slice(0, reportPricing.maxChars);
  const chars = billableChars(text);
  assert.equal(reportCharError(chars), null);
  const pieces = chunkText(text, PIECE_SIZE);
  assert.ok(pieces.length >= 26 && pieces.length <= 33, `${pieces.length} pieces`);
  assert.ok(pieces.every((c) => c.text.length <= PIECE_SIZE * 1.25), "no piece is over 1.25 times the base size");
  // Free characters still cost model calls, but only the charged ones are priced: 200 credits at most.
  assert.equal(toCredits(reportPrice(chars)), Math.ceil(reportChargedChars(chars) / reportPricing.blockChars));
  assert.ok(toCredits(reportPrice(chars)) <= 200);
  const flag = `- P1 S1 "This is sentence..." | Risk: High | Signals 3, 4: tidy | Ask: How would you say it?`;
  const answers = pieces.map((_, idx) => ({ idx, ok: true, truncated: false, report: answer([flag]) }));
  const result = stitchReport(text, answers, PIECE_SIZE);
  assert.equal(result.pieces.total, pieces.length);
  assert.equal(result.pieces.reviewed, pieces.length);
  assert.equal(result.summary.high, pieces.length);
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
