import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport } from "../lib/report-format";
import { reviewVerdict } from "../lib/review-verdict";
import { freeScanLine, lineCounts } from "../lib/scanning/counted-line";

/** A report as the browser receives it: every line passed through the server's stripping and marking. */
const asSent = (lines: string[]) => lines.map((l) => freeScanLine(l)).filter(Boolean).join("\n");
// Signal 3 is a signal that does not count when Medium; signal 8 counts.
const flag = (n: number, risk: string, signal = 3) => `- P1 S${n} "Some sentence ${n}." | Risk: ${risk} | Signals ${signal}: a reason`;

test("one counted sentence of fourteen is Low even when the reviewer calls itself High", () => {
  const report = asSent(["A. Sentence flags", flag(2, "High"), "Overall risk: High, because it reads tidy."]);
  const v = reviewVerdict(parseReport(report), 14);
  assert.equal(v?.risk, "low");
  assert.ok(Math.abs((v?.share ?? 0) - 1 / 14) < 1e-9);
});

test("most sentences counted is High", () => {
  const report = asSent(["A. Sentence flags", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => flag(n, n % 2 ? "High" : "Medium", 8)), "Overall risk: High"]);
  assert.equal(reviewVerdict(parseReport(report), 12)?.risk, "high");
});

test("Medium sentences that only cite the other signals are shown but not counted", () => {
  const report = asSent(["A. Sentence flags", ...[1, 2, 3, 4, 5, 6].map((n) => flag(n, "Medium", 3)), "Overall risk: High"]);
  const v = reviewVerdict(parseReport(report), 10);
  assert.equal(v?.risk, "low");
  assert.equal(v?.share, 0);
});

test("a High sentence always counts, a Medium one only when it cites signal 7, 8 or 9", () => {
  assert.equal(lineCounts(flag(1, "High", 1)), true);
  assert.equal(lineCounts(flag(1, "Medium", 7)), true);
  assert.equal(lineCounts(flag(1, "Medium", 9)), true);
  assert.equal(lineCounts(flag(1, "Medium", 5)), false);
  assert.equal(lineCounts(flag(1, "Low", 8)), false);
  assert.equal(lineCounts(flag(1, "Uncertain", 8)), false);
});

test("the line sent to the browser carries the mark but no reason", () => {
  const sent = freeScanLine(flag(4, "Medium", 8));
  assert.ok(sent?.endsWith("| Counted"));
  assert.ok(!/reason|Signal/i.test(sent ?? ""));
  assert.ok(!freeScanLine(flag(4, "Medium", 3))?.includes("Counted"));
});

test("Uncertain and Low sentences do not count", () => {
  const report = asSent(["A. Sentence flags", flag(1, "Uncertain", 8), flag(2, "Low", 8), "Overall risk: Medium"]);
  assert.equal(reviewVerdict(parseReport(report), 10)?.risk, "low");
});

test("without the sentence count it repeats the stated overall risk", () => {
  const v = reviewVerdict(parseReport("Overall risk: High, because it reads tidy."), undefined);
  assert.equal(v?.risk, "high");
});

test("says nothing while the report has said nothing", () => {
  assert.equal(reviewVerdict(parseReport("A. Sentence flags"), 10), undefined);
});
