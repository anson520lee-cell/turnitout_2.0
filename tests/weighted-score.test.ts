import assert from "node:assert/strict";
import { test } from "node:test";
import { aiScore, COUNTED_CURVE, type AutoReportResult, type ReportSentence } from "../lib/auto-report/stitch";
import { scoreWeightedRisk, weightedRiskEvidence } from "../lib/auto-report/weighted-score";

const noAgreement = { strongest: -4, second: -5 };
const neutral = {
  total: 40, strong: 0, structural: 0, high: 0, plain: 0, template: 0, residual: 0, confirmed: false,
  structuralParagraphs: 0, highParagraphs: 0, plainParagraphs: 0, weakHighParagraphs: 0,
};

function report(sentences: ReportSentence[], confirmed: number[]): AutoReportResult {
  return {
    version: 1, reviewFormat: 1, pieces: { total: 1, reviewed: 1 }, grammar: [],
    calibration: { version: "base", confirmed },
    summary: { words: 10, sentences: sentences.length, paragraphs: 1, high: 2, medium: 2, uncertain: 1,
      riskyParagraphs: 1, flaggedShare: 1, counted: 1, countedShare: 1 / sentences.length, overall: "low" },
    paragraphs: [{ p: 1, risk: "high", sentences }],
  };
}

test("every unconfirmed risk contributes at its own weight and confirmed flags are counted once", () => {
  const draft = report([
    { n: 1, text: "A.", risk: "high", counts: true, signals: [1, 2] },
    { n: 2, text: "B.", risk: "medium", signals: [8] },
    { n: 3, text: "C.", risk: "high", why: "Signals 2, 8: The reason." },
    { n: 4, text: "D.", risk: "medium", signals: [2, 4] },
    { n: 5, text: "E.", risk: "uncertain", signals: [1] },
  ], [4]);
  const evidence = weightedRiskEvidence(draft);
  assert.ok(evidence);
  assert.equal(evidence.strong, 1 / 5);
  assert.ok(Math.abs(evidence.residual - (.56 * .25 + .65 * .50) / 5) < 1e-12);
  assert.equal(evidence.weakHighParagraphs, 1);
  assert.equal(evidence.confirmed, true);
});

test("generic weak evidence adds score within the low band without making an unsupported alert", () => {
  const old = aiScore(1 / 19, COUNTED_CURVE);
  const after = scoreWeightedRisk(old, { ...neutral, total: 19, strong: 1 / 19, residual: .56 * 9 / 19 }, noAgreement);
  assert.ok(Math.abs(after - old - .06) < 1e-12);
  assert.ok(scoreWeightedRisk(.28, { ...neutral, strong: .32, residual: .35 }, noAgreement) < .295);
});

test("structured warnings can move up when the same pattern has separate support", () => {
  const old = aiScore(.30, COUNTED_CURVE);
  const evidence = { ...neutral, strong: .30, structural: .30, plain: .18, residual: .0252,
    template: .10, high: .02, structuralParagraphs: 8, plainParagraphs: 6, highParagraphs: 1 };
  assert.ok(scoreWeightedRisk(old, evidence, noAgreement) < .30);
  assert.ok(scoreWeightedRisk(old, evidence, { strongest: -1.70, second: -2.20 }) >= .60);
});

test("an unsupported template-driven Elevated score is reconsidered and an isolated mixed section stays Moderate", () => {
  const old = .97;
  assert.ok(scoreWeightedRisk(old, { ...neutral, strong: .65, structural: .65, template: .65, structuralParagraphs: 20 },
    noAgreement) < .295);
  const evidence = { ...neutral, strong: .46, structural: .33, high: .28, highParagraphs: 5,
    structuralParagraphs: 6, template: .15, residual: .12 };
  assert.equal(scoreWeightedRisk(.80, evidence, { strongest: -.59, second: -2.89 }), .5949);
});
