import { test } from "node:test";
import assert from "node:assert/strict";
import { aiScore, COUNTED_CURVE, stitchReport, type AutoReportResult } from "../lib/auto-report/stitch";
import { SCAN_MS_PER_CHAR, scanDurationMs } from "../lib/auto-report/scan-script";
import { pickFlagged, type ReportRewrite } from "../lib/auto-report/rewrite";
import {
  CHASE_MS,
  type Arrival,
  draftStrokes,
  strokesAt,
  strokesMs,
  REFINE_INTRO_MS,
  clearedBy,
  countedIn,
  jobPhase,
  passedAt,
  projectedAt,
  projectedScore,
  readerAt,
  recheckStartLine,
  recheckedLine,
  refineEndMs,
  refineJobs,
  refinePlan,
  refineRate,
  refineReadMs,
  replayLevels,
  stillLine,
} from "../lib/auto-report/refine-script";

const sentence = (n: number) => `This is sentence number ${n} of the sample, written to have a fair length.`;
const paragraph = (start: number, count: number) => Array.from({ length: count }, (_, i) => sentence(start + i)).join(" ");
const essay = [paragraph(1, 5), paragraph(6, 4), paragraph(10, 6)].join("\n\n");
const answer = (flags: string[]) => `A. Sentence flags\n${flags.join("\n")}\n\nB. Paragraph overview\n\nC. Overall\n- Overall risk: Medium.`;
const flags = ["- P1 S2 \"x\" | Risk: High | Signals 1: tidy", "- P2 S1 \"x\" | Risk: Medium | Signals 2: stock", "- P3 S6 \"x\" | Risk: High | Signals 3: list"];
const result = stitchReport(essay, [{ idx: 0, ok: true, truncated: false, report: answer(flags) }]);

const rewriteOf = (keep: number[] = []): ReportRewrite => ({
  version: 1,
  model: "test",
  createdAt: "2026-10-27T00:00:00Z",
  items: pickFlagged(result).map((s) => ({ n: s.n, original: s.text, rewrite: keep.includes(s.n) ? null : `Here sentence ${s.n} of the sample is put in plainer words.`, ...(keep.includes(s.n) ? { kept: "the number was changed" } : {}) })),
});

test("the rewrite runs 1.2 times the report scan's pace, per character", () => {
  assert.ok(Math.abs(refineReadMs(5_000) * 1.2 - scanDurationMs(5_000)) <= 1);
  assert.ok(Math.abs(REFINE_INTRO_MS * 1.2 - 24_000) < 1e-6);
  assert.ok(refineReadMs(10_000) > refineReadMs(5_000), "longer texts take longer");
  assert.ok(Math.abs(SCAN_MS_PER_CHAR / (refineReadMs(60_000) / 60_000) - 1.2) < 1e-4);
});

test("the plan numbers sentences as the report does", () => {
  const plan = refinePlan(result);
  const flat = result.paragraphs.flatMap((p) => p.sentences);
  assert.equal(plan.sentences.length, flat.length);
  plan.sentences.forEach((x, i) => assert.equal(x.n, flat[i].n));
  assert.equal(plan.paragraphs.length, 3);
});

/** Every suggestion of `rw` in at `at`, or each at its own time from `times` (by sentence number). */
const arrive = (rw: ReportRewrite, at: number, times: Record<number, number> = {}): Map<number, Arrival> => new Map(rw.items.map((item) => [item.n, { at: times[item.n] ?? at, item }]));

test("the reader goes at one pace and never waits for the suggestions", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  assert.equal(readerAt(0, readMs), 0);
  assert.equal(readerAt(readMs / 2, readMs), 0.5);
  assert.equal(readerAt(readMs * 2, readMs), 1);
  const last = plan.sentences.length - 1;
  assert.ok(Math.abs(passedAt(plan, last, readMs) - readMs) < 1e-6);
});

test("R1 marks each flagged sentence on the reader's tail, before its suggestion is in", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const jobs = refineJobs(plan, result, new Map(), readMs);
  assert.deepEqual(jobs.map((j) => j.n), pickFlagged(result).map((s) => s.n));
  for (const j of jobs) {
    assert.equal(j.mark, passedAt(plan, j.i, readMs) + CHASE_MS);
    assert.equal(j.known, false);
    assert.equal(jobPhase(j, j.mark + 1).phase, "marked");
    assert.equal(jobPhase(j, 1e12).phase, "marked", "nothing is rewritten before its suggestion is in");
  }
  assert.equal(refineEndMs(jobs, readMs), Infinity);
});

test("each sentence is rewritten as soon as its own suggestion is in, right behind the reader", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const rw = rewriteOf();
  // In from the start: every sentence is erased and retyped just behind the reader.
  for (const j of refineJobs(plan, result, arrive(rw, 0), readMs)) {
    assert.ok(j.start >= j.mark && j.start - j.mark < 1_500, `P${j.p} S${j.s} starts right behind the reader`);
    assert.ok(j.start < j.erased && j.erased <= j.typeAt && j.typeAt < j.end);
  }
  // Only the first suggestion is in: the first sentence is rewritten, the others wait for theirs.
  const [first, ...rest] = rw.items;
  const some = refineJobs(plan, result, new Map([[first.n, { at: 0, item: first }]]), readMs);
  assert.ok(Number.isFinite(some[0].end));
  assert.ok(some.slice(1).every((j) => j.start === Infinity));
  // The rest come in later: what was already under way does not move.
  const later = refineJobs(plan, result, arrive(rw, 0, Object.fromEntries(rest.map((it) => [it.n, some[0].end + 5_000]))), readMs);
  assert.equal(later[0].start, some[0].start);
  assert.equal(later[0].end, some[0].end);
  assert.ok(later.slice(1).every((j) => j.start >= some[0].end + 5_000));
});

test("R1 erases the next sentence while R2 is still typing the one before", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  // All in late, after the reader is through: they queue up and overlap.
  const jobs = refineJobs(plan, result, arrive(rewriteOf(), readMs + 1_000), readMs);
  const [a, b] = jobs;
  assert.ok(b.start < a.end + 100 && b.start <= a.erased + 200, "R1 moves on once it has erased, without waiting for R2");
  assert.ok(b.typeAt >= a.end, "R2 types one sentence at a time");
  assert.equal(jobPhase(b, (b.erased + b.typeAt) / 2).phase === "erasing" || b.erased === b.typeAt, true);
});

test("erasing counts down the original and typing counts up the suggestion", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const [j] = refineJobs(plan, result, arrive(rewriteOf(), 0), readMs);
  const e = jobPhase(j, (j.start + j.erased) / 2);
  assert.equal(e.phase, "erasing");
  assert.ok(e.phase === "erasing" && e.left > 0 && e.left < j.original.length);
  const ty = jobPhase(j, (j.typeAt + j.end) / 2);
  assert.ok(ty.phase === "typing" && ty.typed > 0 && ty.typed < (j.rewrite?.length ?? 0));
  assert.equal(jobPhase(j, j.end).phase, "done");
});

test("a sentence kept as written is checked, not retyped", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const keep = pickFlagged(result)[1].n;
  const j = refineJobs(plan, result, arrive(rewriteOf([keep]), 0), readMs).find((x) => x.n === keep)!;
  assert.equal(j.rewrite, null);
  assert.equal(j.kept, "the number was changed");
  assert.equal(jobPhase(j, (j.start + j.end) / 2).phase, "checking");
});

test("suggestions that arrive after the reader passed a sentence are caught up faster", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const onTime = refineJobs(plan, result, arrive(rewriteOf(), 0), readMs);
  const late = refineJobs(plan, result, arrive(rewriteOf(), 30_000), readMs);
  assert.ok(late.every((j) => j.start >= 30_000));
  const span = (j: (typeof late)[number]) => j.end - j.start;
  assert.ok(span(late[0]) < span(onTime[0]), "a late start works faster");
  assert.ok(span(late[0]) >= span(onTime[0]) / 2.5 - 1, "at most 2.5 times as fast");
});

test("the projected rate falls from the first rewritten sentence, and lands on the real projection", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  const readMs = refineReadMs(plan.chars);
  assert.equal(projectedScore(rate, 0), rate.original);
  const rw = rewriteOf([15]);
  // All in at once, or one by one a few seconds apart.
  const times = Object.fromEntries(rw.items.map((it, k) => [it.n, 2_000 + k * 4_000]));
  for (const arrivals of [arrive(rw, 0), arrive(rw, 30_000), arrive(rw, 0, times)]) {
    const jobs = refineJobs(plan, result, arrivals, readMs);
    const end = refineEndMs(jobs, readMs);
    const first = jobs.filter((j) => j.counts && j.rewrite).sort((a, b) => a.start - b.start)[0];
    assert.equal(projectedAt(rate, jobs, first.start), rate.original, "nothing moves before the first rewrite");
    const a = projectedAt(rate, jobs, (first.start + first.erased) / 2);
    const b = projectedAt(rate, jobs, (first.typeAt + first.end) / 2);
    assert.ok(a < rate.original && b < a && projectedAt(rate, jobs, first.end) < b, "it falls while the first sentence is rewritten");
    let prev = rate.original;
    for (let t = 0; t <= end; t += 50) {
      const v = projectedAt(rate, jobs, t);
      assert.ok(v <= prev + 1e-12, "never rises");
      prev = v;
    }
    assert.equal(projectedAt(rate, jobs, end), projectedScore(rate, clearedBy(jobs, Infinity)), "ends exactly on the projection");
  }
  assert.equal(projectedScore(rate, rate.counted), 0);
});

test("the projected rate steps down evenly, one equal step per counted sentence", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  const readMs = refineReadMs(plan.chars);
  const jobs = refineJobs(plan, result, arrive(rewriteOf(), 0), readMs);
  const total = clearedBy(jobs, Infinity);
  const final = projectedScore(rate, total);
  const counted = jobs.filter((j) => j.rewrite && j.counts).sort((a, b) => a.end - b.end);
  counted.forEach((j, k) => {
    const want = k + 1 === total ? final : rate.original + ((final - rate.original) * (k + 1)) / total;
    assert.ok(Math.abs(projectedAt(rate, jobs, j.end) - want) < 1e-9, `step ${k + 1} of ${total}`);
  });
});

test("R2 types like a person: second thoughts taken back, ending exactly on the suggestion", () => {
  const original = "Furthermore, the benefits of accessible neighbourhoods extend beyond convenience for everyone involved.";
  const rewrite = "Neighbourhoods where things are close by give you more than convenience, and that matters to everyone.";
  const strokes = draftStrokes(original, rewrite, 7);
  assert.deepEqual(strokes, draftStrokes(original, rewrite, 7), "the same sentence is always typed the same way");
  assert.equal(strokes[strokes.length - 1].text, rewrite);
  assert.ok(strokes.some((x) => x.kind === "delete"), "it takes something back");
  const keyMs = strokes[0].ms / strokes[0].text.length;
  assert.ok(strokesMs(strokes) > rewrite.length * keyMs * 1.3, "it takes longer than typing straight through, at the same keystroke pace");
  let prev = "";
  let wrong = false;
  for (let t = 0; t <= strokesMs(strokes); t += 5) {
    const { text } = strokesAt(strokes, t);
    assert.ok(Math.abs(text.length - prev.length) <= 40, "no jumps");
    if (!rewrite.startsWith(text)) wrong = true;
    prev = text;
  }
  assert.ok(wrong, "a second thought shows on screen");
  assert.equal(strokesAt(strokes, Infinity).text, rewrite);
});

test("a sentence being typed only moves the rate forward, even while R2 takes something back", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const [j] = refineJobs(plan, result, arrive(rewriteOf(), 0), readMs);
  let prev = -1;
  for (let t = j.typeAt; t <= j.end; t += 10) {
    const ph = jobPhase(j, t);
    if (ph.phase !== "typing") continue;
    assert.ok(ph.f >= prev);
    prev = ph.f;
  }
});

test("the re-check's lines give each round's real score and say which round is kept", () => {
  assert.match(recheckStartLine({ kind: "check", round: 1 }).text, /R4 RE-CHECK · round 1/);
  assert.match(recheckStartLine({ kind: "round", round: 2 }).text, /ROUND 2/);
  const scores = [0.98, 0.97, 0.99];
  assert.equal(recheckedLine(scores, 0).text, "R4 RE-CHECK · round 1 · 98% on the same detector as your report");
  assert.equal(recheckedLine(scores, 0).tone, "warn");
  assert.match(recheckedLine(scores, 1).text, /round 2 · 97% · lower than 98%, this round is kept/);
  assert.match(recheckedLine(scores, 2).text, /round 3 · 99% · not lower than 97%, round 2 stays/);
  assert.equal(recheckedLine([0.12], 0).tone, "ok");
  assert.equal(stillLine({ stillCounted: [1, 2], cleared: [3] }).text, "R4 · 2 of 3 rewritten sentences still read as AI · 1 cleared");
  assert.equal(countedIn({ result }), result.paragraphs.flatMap((p) => p.sentences).filter((x) => x.counts).length);
});

test("a re-check lands as the rate falling one cleared sentence at a time, ending on its score", () => {
  const summary = (countedShare: number) => ({ high: 0, medium: 0, uncertain: 0, sentences: 10, words: 100, paragraphs: 1, flaggedShare: countedShare, countedShare, counted: Math.round(countedShare * 10), riskyParagraphs: 0, overall: "elevated" as const });
  const check = { score: aiScore(0.3, COUNTED_CURVE), stillCounted: [2, 6], cleared: [1, 3, 4, 5, 7], result: { paragraphs: [], summary: summary(0.3) } as unknown as AutoReportResult };
  const { steps, levels } = replayLevels({ fromScore: aiScore(0.9, COUNTED_CURVE), fromShare: 0.9, check, seen: new Set() });
  assert.deepEqual(steps.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(levels.length, steps.length);
  assert.equal(levels[levels.length - 1], check.score);
  // Falls at each cleared sentence, holds on the ones still counted.
  assert.ok(levels[0] < aiScore(0.9, COUNTED_CURVE));
  assert.ok(levels[2] < levels[1]);
  assert.ok(levels.every((v, i) => i === 0 || v <= levels[i - 1] + 1e-12));
});

test("a later round only walks what it newly cleared, and a rise or no change is not replayed", () => {
  const result = { paragraphs: [], summary: { flaggedShare: 0.2, countedShare: 0.2 } } as unknown as AutoReportResult;
  const check = { score: aiScore(0.2, COUNTED_CURVE), stillCounted: [2], cleared: [1, 3, 4], result };
  const seen = new Set([1, 3]);
  const r = replayLevels({ fromScore: aiScore(0.35, COUNTED_CURVE), fromShare: 0.35, check, seen });
  assert.equal(r.levels.length, 4);
  // Sentences cleared in an earlier round hold the rate; only the newly cleared one takes it down, onto the score.
  assert.deepEqual(r.levels.slice(0, 3), [aiScore(0.35, COUNTED_CURVE), aiScore(0.35, COUNTED_CURVE), aiScore(0.35, COUNTED_CURVE)]);
  assert.equal(r.levels[3], check.score);
  assert.deepEqual(replayLevels({ fromScore: 0.05, fromShare: 0.1, check, seen: new Set() }).levels, []);
  assert.deepEqual(replayLevels({ fromScore: 0.9, fromShare: 0.9, check: { ...check, cleared: [] }, seen: new Set() }).levels, []);
});
