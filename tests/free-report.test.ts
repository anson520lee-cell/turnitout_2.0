import { test } from "node:test";
import assert from "node:assert/strict";
import { freeReportCharError } from "../lib/orders/limits";
import { freeReport } from "../config/app";

test("the free report accepts 500 to 4,000 characters only", () => {
  assert.equal(freeReportCharError(freeReport.minChars), null);
  assert.equal(freeReportCharError(freeReport.maxChars), null);
  assert.match(freeReportCharError(freeReport.minChars - 1) ?? "", /at least 500/);
  assert.match(freeReportCharError(freeReport.maxChars + 1) ?? "", /up to 4,000/);
});

test("every account gets exactly one free report, ever", () => {
  // Must match `1` in consume_free_report / free_report_remaining (migration 0019).
  assert.equal(freeReport.perUserLimit, 1);
});
