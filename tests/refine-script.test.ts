import { test } from "node:test";
import assert from "node:assert/strict";
import { stitchReport } from "../lib/auto-report/stitch";
import { SCAN_MS_PER_CHAR, scanDurationMs } from "../lib/auto-report/scan-script";
import { pickFlagged, type ReportRewrite } from "../lib/auto-report/rewrite";
import {
  REFINE_INTRO_MS,
  clearedBy,
  jobPhase,
  passedAt,
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

test("each sentence is erased then retyped after the reader passes it, one at a time", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const jobs = refineJobs(plan, result, rewriteOf(), 0, readMs);
  assert.deepEqual(jobs.map((j) => j.n), [2, 6, 15]);
  let free = 0;
  for (const j of jobs) {
    assert.ok(j.start >= passedAt(plan, j.i, readMs), "not before the reader has read it");
    assert.ok(j.start >= free, "one sentence at a time");
    assert.ok(j.start < j.erased && j.erased < j.end);
    free = j.end;
  }
  assert.equal(refineEndMs(jobs, readMs), Math.max(readMs, jobs[2].end));
});

test("erasing counts down the original and typing counts up the suggestion", () => {
  const plan = refinePlan(result);
  const [j] = refineJobs(plan, result, rewriteOf(), 0);
  assert.deepEqual(jobPhase(j, j.start - 1), { phase: "waiting" });
  assert.deepEqual(jobPhase(j, j.start), { phase: "erasing", left: j.original.length });
  const mid = jobPhase(j, (j.start + j.erased) / 2);
  assert.equal(mid.phase, "erasing");
  assert.ok(mid.phase === "erasing" && mid.left > 0 && mid.left < j.original.length);
  assert.deepEqual(jobPhase(j, j.erased), { phase: "typing", typed: 0 });
  const typing = jobPhase(j, (j.erased + j.end) / 2);
  assert.ok(typing.phase === "typing" && typing.typed > 0 && typing.typed < (j.rewrite?.length ?? 0));
  assert.deepEqual(jobPhase(j, j.end), { phase: "done" });
});

test("suggestions that arrive late are caught up faster", () => {
  const plan = refinePlan(result);
  const readMs = refineReadMs(plan.chars);
  const onTime = refineJobs(plan, result, rewriteOf(), 0, readMs);
  const late = refineJobs(plan, result, rewriteOf(), readMs, readMs);
  assert.ok(late.every((j) => j.start >= readMs));
  const span = (j: (typeof late)[number]) => j.end - j.start;
  assert.ok(span(late[0]) < span(onTime[0]), "a late start works faster");
  assert.ok(span(late[0]) >= span(onTime[0]) / 4 - 1, "at most four times");
});

test("the projected rate starts at the report's score and only falls as counted sentences are rewritten", () => {
  const plan = refinePlan(result);
  const rate = refineRate(result);
  assert.equal(projectedScore(rate, 0), rate.original);
  const jobs = refineJobs(plan, result, rewriteOf([15]), 0);
  const end = refineEndMs(jobs, refineReadMs(plan.chars));
  let prev = rate.original;
  for (let t = 0; t <= end; t += 50) {
    const v = projectedScore(rate, clearedBy(jobs, t));
    assert.ok(v <= prev + 1e-12, "never rises");
    prev = v;
  }
  // Sentence 2 (High) counts; 6 is a Medium that doesn't count toward the score; 15 kept its own wording.
  assert.equal(clearedBy(jobs, end), 1, "only rewritten sentences that count move the rate");
  assert.ok(prev < rate.original);
  assert.ok(prev > 0);
  assert.equal(projectedScore(rate, rate.counted), 0);
});
