import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHkdDollars, orderHkd, revenueTotals } from "../lib/payments/revenue";

test("an order's HK$ is what the customer was asked to pay by Alipay", () => {
  assert.equal(orderHkd(300), 2.93); // 3 credits = US$0.375
  assert.equal(orderHkd(800), 7.8); // 8 credits = US$1
});

test("revenue counts top-ups and Alipay orders, keeps unchecked ones apart, skips free, credit and refunded orders", () => {
  const r = revenueTotals(
    [{ usd: 10 }],
    [
      { provider: "alipay", amount: 800, orderStatus: "completed", claimStatus: "confirmed" },
      { provider: "alipay", amount: 300, orderStatus: "completed", claimStatus: "confirmed" },
      // refunded as credits: the order was cancelled
      { provider: "alipay", amount: 1000, orderStatus: "cancelled", claimStatus: "confirmed" },
      // started on trust, not found in AlipayHK yet
      { provider: "alipay", amount: 500, orderStatus: "screening", claimStatus: "pending" },
      { provider: "alipay", amount: 200, orderStatus: "completed", claimStatus: "rejected" },
      { provider: "credits", amount: 400, orderStatus: "completed" },
      { provider: "free_daily", amount: 0, orderStatus: "completed" },
      { provider: "admin_free", amount: 900, orderStatus: "completed" },
      { provider: "dev", amount: 900, orderStatus: "completed" },
    ],
  );
  assert.equal(r.topups, 78);
  assert.equal(r.orders, 10.73);
  assert.equal(r.checked, 88.73);
  assert.equal(r.unchecked, 4.88);
});

test("HK$ amounts print like the rest of the admin pages", () => {
  assert.equal(formatHkdDollars(78), "HK$78");
  assert.equal(formatHkdDollars(88.73), "HK$88.73");
  assert.equal(formatHkdDollars(1234.5), "HK$1,234.50");
});
