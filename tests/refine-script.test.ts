import { test } from "node:test";
import assert from "node:assert/strict";
import { stitchReport } from "../lib/auto-report/stitch";
import { SCAN_MS_PER_CHAR, scanDurationMs } from "../lib/auto-report/scan-script";
import { pickFlagged, type ReportRewrite } from "../lib/auto-report/rewrite";
import {
  CHASE_MS,
  REFINE_INTRO_MS,
  clearedBy,
  jobPhase,
  passedAt,
  projectedAt,
  projectedScore,
  readerAt,
  readerTime,
  refineEndMs,
  refineJobs,
  refinePlan,
  refineRate,
  refineReadMs,
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

test("while the suggestions are written the reader slows down instead of running ahead", () => {
  const readMs = 40_000;
  assert.ok(Math.abs(readerAt(1_000, readMs, null) - 1_000 / readMs) < 0.003, "normal pace at first");
  assert.ok(readerAt(readMs, readMs, null) < 0.5, "well short of the end after a full reading time");
  for (let t = 0; t < 200_000; t += 500) assert.ok(readerAt(t + 500, readMs, null) > readerAt(t, readMs, null), "never stops dead");
  // Once the suggestions are in, normal pace from where it was.
  const at = 30_000;
  const held = readerAt(at, readMs, at);
  assert.ok(Math.abs(readerAt(at + 4_000, readMs, at) - (held + 0.1)) < 1e-9);
  assert.equal(readerAt(at + readMs, readMs, at), 1);
  for (const share of [0.05, held / 2, held, (held + 1) / 2, 1]) assert.ok(Math.abs(readerAt(readerTime(share, readMs, at), readMs, at) - share) < 1e-6);
  // Known from the start: the plain reading pace.
  assert.equal(readerAt(readMs / 2, readMs, 0), 0.5);
});

test("R1 marks each flagged sentence on the reader's tail, before the suggestions are in", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const pending = refineJobs(plan, result, null, null, readMs);
  assert.deepEqual(pending.map((j) => j.n), [2, 6, 15]);
  const [j] = pending;
  assert.equal(j.mark, passedAt(plan, j.i, readMs, null) + CHASE_MS);
  assert.equal(jobPhase(j, j.mark + 1).phase, "marked");
  assert.equal(j.start, Infinity, "nothing is rewritten before the suggestions are in");
  assert.equal(refineEndMs(pending, readMs, null), Infinity);
});

test("once the suggestions are in, each sentence is erased then retyped right behind the reader", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const jobs = refineJobs(plan, result, rewriteOf(), 0, readMs);
  let free = 0;
  for (const j of jobs) {
    assert.equal(j.mark, passedAt(plan, j.i, readMs, 0) + CHASE_MS);
    assert.ok(j.start >= j.mark, "not before the reader has read it");
    assert.ok(j.start >= free, "one sentence at a time");
    assert.ok(j.start < j.erased && j.erased < j.end);
    free = j.end;
  }
  assert.equal(refineEndMs(jobs, readMs, 0), Math.max(readMs, jobs[2].end));
});

test("erasing counts down the original and typing counts up the suggestion", () => {
  const plan = refinePlan(result);
  const [j] = refineJobs(plan, result, rewriteOf(), 0);
  assert.deepEqual(jobPhase(j, j.mark - 1), { phase: "waiting" });
  assert.deepEqual(jobPhase(j, j.start), { phase: "erasing", left: j.original.length });
  const mid = jobPhase(j, (j.start + j.erased) / 2);
  assert.ok(mid.phase === "erasing" && mid.left > 0 && mid.left < j.original.length);
  assert.deepEqual(jobPhase(j, j.erased), { phase: "typing", typed: 0 });
  const typing = jobPhase(j, (j.erased + j.end) / 2);
  assert.ok(typing.phase === "typing" && typing.typed > 0 && typing.typed < (j.rewrite?.length ?? 0));
  assert.deepEqual(jobPhase(j, j.end), { phase: "done" });
});

test("suggestions that arrive after the reader passed a sentence are caught up faster", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const onTime = refineJobs(plan, result, rewriteOf(), 0, readMs);
  const late = refineJobs(plan, result, rewriteOf(), 30_000, readMs);
  assert.ok(late.every((j) => j.start >= 30_000));
  const span = (j: (typeof late)[number]) => j.end - j.start;
  assert.ok(span(late[0]) < span(onTime[0]), "a late start works faster");
  assert.ok(span(late[0]) >= span(onTime[0]) / 2.5 - 1, "at most 2.5 times as fast");
});

test("the projected rate falls as each counted sentence is rewritten, and lands on the real projection", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  const readMs = refineReadMs(plan.chars);
  assert.equal(projectedScore(rate, 0), rate.original);
  for (const resultAt of [0, 30_000]) {
    const jobs = refineJobs(plan, result, rewriteOf([15]), resultAt, readMs);
    const end = refineEndMs(jobs, readMs, resultAt);
    const [j] = jobs;
    assert.equal(projectedAt(rate, jobs, j.start), rate.original, "nothing moves before the first rewrite");
    const a = projectedAt(rate, jobs, (j.start + j.erased) / 2);
    const b = projectedAt(rate, jobs, (j.erased + j.end) / 2);
    assert.ok(a < rate.original && b < a && projectedAt(rate, jobs, j.end) < b, "it falls while the sentence is rewritten");
    let prev = rate.original;
    for (let t = 0; t <= end; t += 50) {
      const v = projectedAt(rate, jobs, t);
      assert.ok(v <= prev + 1e-12, "never rises");
      prev = v;
    }
    // Sentence 2 (High) counts; 6 is a Medium that doesn't count toward the score; 15 kept its own wording.
    assert.equal(clearedBy(jobs, end), 1, "only rewritten sentences that count move the rate");
    assert.equal(projectedAt(rate, jobs, end), projectedScore(rate, 1), "ends exactly on the projection");
  }
  assert.equal(projectedScore(rate, rate.counted), 0);
});

test("the projected rate steps down evenly, one equal step per counted sentence", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  const readMs = refineReadMs(plan.chars);
  const jobs = refineJobs(plan, result, rewriteOf(), 0, readMs);
  const total = clearedBy(jobs, Infinity);
  const final = projectedScore(rate, total);
  const counted = jobs.filter((j) => j.rewrite && j.counts).sort((a, b) => a.end - b.end);
  counted.forEach((j, k) => {
    const want = k + 1 === total ? final : rate.original + ((final - rate.original) * (k + 1)) / total;
    assert.ok(Math.abs(projectedAt(rate, jobs, j.end) - want) < 1e-9, `step ${k + 1} of ${total}`);
  });
});
