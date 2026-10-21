import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport } from "../lib/report-format";
import { reviewVerdict } from "../lib/review-verdict";

const flag = (n: number, risk: string) => `- P1 S${n} "Some sentence ${n}." | Risk: ${risk} | Signals 3`;

test("one marked sentence of fourteen is Low even when the reviewer calls itself High", () => {
  const report = ["A. Sentence flags", flag(2, "Medium"), "Overall risk: High, because it reads tidy."].join("\n");
  const v = reviewVerdict(parseReport(report), 14);
  assert.equal(v?.risk, "low");
  assert.ok(Math.abs((v?.share ?? 0) - 1 / 14) < 1e-9);
});

test("most sentences marked is High", () => {
  const report = ["A. Sentence flags", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => flag(n, n % 2 ? "High" : "Medium")), "Overall risk: High"].join("\n");
  assert.equal(reviewVerdict(parseReport(report), 12)?.risk, "high");
});

test("Uncertain and Low sentences do not count", () => {
  const report = ["A. Sentence flags", flag(1, "Uncertain"), flag(2, "Low"), "Overall risk: Medium"].join("\n");
  assert.equal(reviewVerdict(parseReport(report), 10)?.risk, "low");
});

test("without the sentence count it repeats the stated overall risk", () => {
  const v = reviewVerdict(parseReport("Overall risk: High, because it reads tidy."), undefined);
  assert.equal(v?.risk, "high");
});

test("says nothing while the report has said nothing", () => {
  assert.equal(reviewVerdict(parseReport("A. Sentence flags"), 10), undefined);
});
