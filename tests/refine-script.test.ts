import { test } from "node:test";
import assert from "node:assert/strict";
import { stitchReport } from "../lib/auto-report/stitch";
import { SCAN_MS_PER_CHAR, scanDurationMs } from "../lib/auto-report/scan-script";
import { pickFlagged, type ReportRewrite } from "../lib/auto-report/rewrite";
import {
  CHASE_MS,
  DRAFT_SHARE,
  REFINE_INTRO_MS,
  clearedBy,
  jobPhase,
  passedAt,
  projectedAt,
  projectedScore,
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

test("R1 encodes each flagged sentence on the reader's tail, before the suggestions are in", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const pending = refineJobs(plan, result, null, null, readMs);
  assert.deepEqual(pending.map((j) => j.n), [2, 6, 15]);
  let free = 0;
  for (const j of pending) {
    assert.ok(j.start >= passedAt(plan, j.i, readMs) + CHASE_MS, "after the reader has read it");
    assert.ok(j.start >= free, "R1 one sentence at a time");
    assert.ok(j.start < j.erased);
    assert.equal(j.known, false);
    assert.equal(j.write, Infinity);
    assert.equal(jobPhase(j, j.erased + 1).phase, "drafting");
    free = j.erased;
  }
  assert.equal(refineEndMs(pending, readMs), Infinity);
});

test("what was already shown doesn't change when the suggestions arrive", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const pending = refineJobs(plan, result, null, null, readMs);
  const at = pending[1].erased + 10;
  const jobs = refineJobs(plan, result, rewriteOf(), at, readMs);
  for (let k = 0; k < 2; k++) {
    assert.equal(jobs[k].start, pending[k].start);
    assert.equal(jobs[k].erased, pending[k].erased);
    assert.ok(jobs[k].write >= at, "no writing before the suggestions are in");
  }
  for (let t = 0; t < at; t += 25) for (let k = 0; k < jobs.length; k++) assert.deepEqual(jobPhase(jobs[k], t), jobPhase(pending[k], t));
});

test("encoding counts up the original and typing counts up the suggestion", () => {
  const plan = refinePlan(result);
  const [j] = refineJobs(plan, result, rewriteOf(), 0);
  assert.deepEqual(jobPhase(j, j.start - 1), { phase: "waiting" });
  assert.deepEqual(jobPhase(j, j.start), { phase: "erasing", encoded: 0 });
  const mid = jobPhase(j, (j.start + j.erased) / 2);
  assert.ok(mid.phase === "erasing" && mid.encoded > 0 && mid.encoded < j.original.length);
  assert.deepEqual(jobPhase(j, j.write), { phase: "typing", typed: 0 });
  const typing = jobPhase(j, (j.write + j.end) / 2);
  assert.ok(typing.phase === "typing" && typing.typed > 0 && typing.typed < (j.rewrite?.length ?? 0));
  assert.deepEqual(jobPhase(j, j.end), { phase: "done" });
});

test("suggestions that arrive late are written side by side, and faster", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const onTime = refineJobs(plan, result, rewriteOf(), 0, readMs);
  const late = refineJobs(plan, result, rewriteOf(), readMs, readMs);
  assert.ok(late.every((j) => j.write >= readMs));
  assert.deepEqual(late.slice(0, 2).map((j) => j.lane), [0, 1], "more than one writer at once");
  assert.ok(late[1].write < late[0].end, "they overlap");
  const span = (j: (typeof late)[number]) => j.end - j.write;
  assert.ok(span(late[0]) < span(onTime[0]), "a late start works faster");
  assert.ok(span(late[0]) >= span(onTime[0]) / 1.5 - 1, "at most 1.5 times as fast: the writers share the work instead");
});

test("the projected rate falls steadily with the rewrite and lands on the real projection", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  const readMs = refineReadMs(plan.chars);
  assert.equal(projectedScore(rate, 0), rate.original);
  const jobs = refineJobs(plan, result, rewriteOf([15]), 0, readMs);
  const end = refineEndMs(jobs, readMs);
  const [j] = jobs;
  // Part of the way once encoded, the rest as it is typed.
  assert.ok(projectedAt(rate, jobs, j.erased) < rate.original);
  assert.ok(projectedAt(rate, jobs, j.erased) > projectedAt(rate, jobs, j.end));
  let prev = rate.original;
  for (let t = 0; t <= end; t += 50) {
    const v = projectedAt(rate, jobs, t);
    assert.ok(v <= prev + 1e-12, "never rises when the suggestions are in on time");
    prev = v;
  }
  // Sentence 2 (High) counts; 6 is a Medium that doesn't count toward the score; 15 kept its own wording.
  assert.equal(clearedBy(jobs, end), 1, "only rewritten sentences that count move the rate");
  assert.equal(projectedAt(rate, jobs, end), projectedScore(rate, 1), "ends exactly on the projection");
  assert.ok(prev < rate.original);
  assert.ok(prev > 0);
  assert.equal(projectedScore(rate, rate.counted), 0);
});

test("while the writer drafts, the rate falls part of the way and no further", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  const readMs = refineReadMs(plan.chars);
  const pending = refineJobs(plan, result, null, null, readMs);
  // Sentences 2 and 15 count (6 doesn't): long into drafting, each shows DRAFT_SHARE of its drop.
  const long = projectedAt(rate, pending, readMs * 10);
  assert.ok(long < rate.original && long > projectedScore(rate, 2), "a share of the drop, not all of it");
  assert.ok(Math.abs(long - projectedScore(rate, 2 * DRAFT_SHARE)) < 1e-3);
  // A sentence encoded before it turned out to be kept gives its share back, so the end is still exact.
  const jobs = refineJobs(plan, result, rewriteOf([2]), readMs, readMs);
  const end = refineEndMs(jobs, readMs);
  assert.equal(jobs[0].kept, "the number was changed");
  assert.equal(jobPhase(jobs[0], (jobs[0].write + jobs[0].end) / 2).phase, "restoring");
  assert.equal(projectedAt(rate, jobs, end), projectedScore(rate, 1), "only sentence 15 cleared");
});
