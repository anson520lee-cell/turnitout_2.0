import { test } from "node:test";
import assert from "node:assert/strict";
import { freeReportCharError } from "../lib/orders/limits";
import { nextHkMidnight } from "../lib/free-report-time";
import { freeReport } from "../config/app";

test("daily free report accepts 500 to 4,000 characters only", () => {
  assert.equal(freeReportCharError(freeReport.minChars), null);
  assert.equal(freeReportCharError(freeReport.maxChars), null);
  assert.match(freeReportCharError(freeReport.minChars - 1) ?? "", /at least 500/);
  assert.match(freeReportCharError(freeReport.maxChars + 1) ?? "", /up to 4,000/);
});

test("the daily reset is the next Hong Kong midnight", () => {
  // 2026-10-20 16:00 UTC = 2026-10-21 00:00 HK, so the next midnight is a full day later.
  const hkMidnight = Date.UTC(2026, 9, 20, 16, 0, 0);
  assert.equal(nextHkMidnight(hkMidnight), hkMidnight + 86_400_000);
  // 10:00 HK on 2026-10-20 (02:00 UTC) resets 14 hours later.
  const morning = Date.UTC(2026, 9, 20, 2, 0, 0);
  assert.equal(nextHkMidnight(morning), morning + 14 * 3_600_000);
});
