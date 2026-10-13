import { test } from "node:test";
import assert from "node:assert/strict";
import { HeuristicWritingAnalyzer } from "../lib/scanning/heuristic-analyzer";
import { samples } from "../tools/calib/samples";

const analyzer = new HeuristicWritingAnalyzer();

test("a very even rhythm is not diluted by connector-free wording", async () => {
  const r = await analyzer.analyze(samples.gemini_like_urban.text);
  assert.equal(r.overallRisk, "elevated");
});

test("varied human samples stay low", async () => {
  for (const k of ["human_blog", "human_academic", "human_short_essay"]) {
    const r = await analyzer.analyze(samples[k].text);
    assert.equal(r.overallRisk, "low", k);
  }
});

test("three paragraphs are too few for the paragraph signal", async () => {
  const r = await analyzer.analyze(samples.human_blog.text);
  assert.equal(r.signals.find((s) => s.id === "paragraph_consistency")?.score, null);
});

test("a plain academic abstract with a few even sentences is not flagged", async () => {
  const text = `We study the effect of word order on neural machine translation. Our model uses a small recurrent encoder and a standard attention decoder. We train it on three language pairs from the WMT shared task. The results show a gain of two BLEU points on average. We also find that the gain is larger for languages with free word order. An error analysis suggests that most remaining mistakes involve rare words.`;
  const r = await new HeuristicWritingAnalyzer().analyze(text);
  assert.equal(r.overallRisk, "low");
});

test("a long essay with unusually even vocabulary is not rated low", async () => {
  const r = await new HeuristicWritingAnalyzer().analyze(samples.gemini_like_metrics_essay.text);
  assert.notEqual(r.overallRisk, "low");
});

test("a Hong Kong student's own essay with grammar slips stays low", async () => {
  const r = await new HeuristicWritingAnalyzer().analyze(samples.human_hk_student_mobility.text);
  assert.equal(r.overallRisk, "low");
});
