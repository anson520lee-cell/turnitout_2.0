import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreReport, truthFromFlaggedLines, type TruthSentence } from "../lib/eval";

// Two paragraphs of three sentences. Turnitin flagged all of P1 and nothing in P2.
const truth: TruthSentence[] = [
  { p: 1, s: 1, flagged: true },
  { p: 1, s: 2, flagged: true },
  { p: 1, s: 3, flagged: true },
  { p: 2, s: 1, flagged: false },
  { p: 2, s: 2, flagged: false },
  { p: 2, s: 3, flagged: false },
];

const report = `A. Sentence flags
- P1 S1 "Urban streets..." | Risk: High | Signal 1 | Ask: Who?
- P1 S2 "Streets carry..." | Risk: Medium | Signal 2
- P2 S1 "So why..." | Risk: Medium | Signal 3
- P2 S2 "It sounds..." | Risk: Uncertain | Course wording
B. Paragraph overview
- P1: 3 high/medium sentences in a row | Risk: High | No natural sentence.
- P2: one medium sentence | Risk: Low | Mostly natural.
C. Overall
- Overall risk: High, because P1 is High.`;

test("sentences are counted at the three levels", () => {
  const m = scoreReport(report, truth);
  assert.equal(m.flagged, 3);
  // High only: P1 S1 → 1 called, 1 hit, 2 missed.
  assert.deepEqual(
    { called: m.high.called, hit: m.high.hit, falseAlarm: m.high.falseAlarm, missed: m.high.missed },
    { called: 1, hit: 1, falseAlarm: 0, missed: 2 },
  );
  assert.equal(m.high.precision, 1);
  assert.ok(Math.abs((m.high.recall ?? 0) - 1 / 3) < 1e-9);
  // High + Medium adds P1 S2 (hit) and P2 S1 (false alarm).
  assert.deepEqual(
    { called: m.highMedium.called, hit: m.highMedium.hit, falseAlarm: m.highMedium.falseAlarm, missed: m.highMedium.missed },
    { called: 3, hit: 2, falseAlarm: 1, missed: 1 },
  );
  // Any flag adds P2 S2 (false alarm).
  assert.equal(m.anyFlag.called, 4);
  assert.equal(m.anyFlag.falseAlarm, 2);
});

test("paragraph ratings are compared with Turnitin's", () => {
  const m = scoreReport(report, truth);
  assert.deepEqual(m.paragraphs.map((x) => [x.p, x.ai, x.truthRisky, x.agreesStrict]), [
    [1, "high", true, true],
    [2, "low", false, true],
  ]);
  assert.equal(m.paragraphAccuracyStrict, 1);
  assert.equal(m.overall, "high");
});

test("a Medium paragraph is wrong in strict mode but right in loose mode when Turnitin flagged it", () => {
  const m = scoreReport("- P1: x | Risk: Medium | y\n- P2: x | Risk: Low | y", truth);
  assert.equal(m.paragraphs[0].agreesStrict, false);
  assert.equal(m.paragraphs[0].agreesLoose, true);
  assert.equal(m.paragraphAccuracyStrict, 0.5);
  assert.equal(m.paragraphAccuracyLoose, 1);
});

test("an empty report scores zero calls and null precision", () => {
  const m = scoreReport("nothing useful here", truth);
  assert.equal(m.high.called, 0);
  assert.equal(m.high.precision, null);
  assert.equal(m.high.recall, 0);
  assert.equal(m.paragraphAccuracyStrict, null);
});

test("flagged lines are matched to sentences, even as fragments", () => {
  const body = "Urban streets deserve greater attention. Streets carry traffic, but they are public spaces.\n\nSo why do people drive so much? Because the bus is slow.";
  const { truth: t, unmatched } = truthFromFlaggedLines(
    body,
    "Urban streets deserve greater attention.\nstreets carry traffic, but they are public\nA line that is not in the essay at all",
  );
  assert.deepEqual(t.map((x) => x.flagged), [true, true, false, false]);
  assert.deepEqual(unmatched, ["A line that is not in the essay at all"]);
});
