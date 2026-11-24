import assert from "node:assert/strict";
import test from "node:test";
import { periodStart, summarize, type Use } from "../lib/analytics/business";

const now = Date.parse("2026-11-25T10:00:00Z");
const sample: Use = { user: "a", product: "Paid report", at: "2026-11-24T16:00:00Z", bought: true, completed: true, chars: 1000 };

test("uses Hong Kong calendar days and emits every day, including empty dates", () => {
  assert.equal(periodStart("7", now), Date.parse("2026-11-18T16:00:00Z"));
  const d = summarize([], [], "7", now);
  assert.equal(d.series[0].date, "2026-11-19");
  assert.equal(d.series.length, 7);
  assert.equal(d.average, null);
  assert.equal(d.hours.reduce((a, b) => a + b), 0);
});

test("deduplicates buyers by hour and ranks products by people, not volume", () => {
  const d = summarize([sample, sample, { ...sample, chars: undefined },
    ...["a", "b"].map(user => ({ ...sample, user, product: "Daily free report", bought: false, chars: 2000 })),
    { ...sample, at: "2026-11-16T12:00:00Z" }, { ...sample, completed: false, chars: 90000 },
  ], [], "7", now);
  assert.deepEqual(d.mix.map(p => [p.name, p.users, p.uses]), [["Daily free report", 2, 2], ["Paid report", 1, 3]]);
  assert.equal(d.purchases, 4);
  assert.equal(d.hours[0], 1);
  assert.equal(d.repeat, 1);
  assert.equal(d.average, 1500);
  assert.equal(d.measured, 4);
});

test("uses the overview's cash rules and accumulates across empty days", () => {
  const at = "2026-11-21T16:00:00Z";
  const payment = { provider: "alipay", orderStatus: "completed", amount: 300 };
  const d = summarize([], [
    { at, topup: { usd: 10 } }, { at, topup: { usd: 10, unchecked: true } },
    { at, payment: { ...payment, provider: "credits" } },
    { at, payment: { ...payment, orderStatus: "cancelled", claimStatus: "confirmed", refundedToCredits: true } },
    { at, payment: { ...payment, claimStatus: "pending" } },
  ], "all", now);
  assert.equal(d.transactions, 2);
  assert.equal(d.series[0].date, "2026-11-22");
  assert.equal(d.series[0].daily, 80.93);
  assert.deepEqual(d.series.at(-1), { date: "2026-11-25", daily: 0, cumulative: 80.93 });
  assert.equal(d.unchecked, 80.93);
});
