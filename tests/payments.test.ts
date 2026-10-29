import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsClaims, directPayMethods, isPayFirstTopupMethod, enabledManualPayments, hkdAmount, isDirectPayMethod, isManualPaymentMethod, manualAmountText, manualPayments, orderAmountParts, orderAmountText, orderPayAmount, paymentMethodLabel, payeeReady } from "../config/payments";
import { priceUsd, reportPrice, topUp, topUpAmountError, usdToCredits } from "../config/pricing";

test("Alipay is a hand-confirmed method that takes claims on a live site", () => {
  const a = manualPayments.alipay;
  assert.equal(a.enabled, true);
  assert.ok(isManualPaymentMethod("alipay"));
  assert.ok(enabledManualPayments().some((m) => m.id === "alipay"));
  assert.equal(a.qrImage, "/payments/alipay-qr.png");
  // The QR is the payee, so there are no placeholder payee lines that would block claims in production.
  assert.equal(payeeReady(a), true);
  assert.equal(acceptsClaims(a), true);
  assert.equal(paymentMethodLabel("alipay"), "Alipay");
});

test("Alipay shows the Hong Kong dollar amount at HK$7.8 per US$1", () => {
  const a = manualPayments.alipay;
  assert.equal(hkdAmount(a, 5), 39);
  assert.equal(hkdAmount(a, 10), 78);
  assert.equal(hkdAmount(a, 20), 156);
  assert.equal(hkdAmount(a, 500), 3900);
  // PayPal is paid in US dollars: no HK$ amount.
  assert.equal(hkdAmount(manualPayments.paypal, 10), null);
  assert.equal(manualAmountText("alipay", 10), "US$10 (HK$78)");
  assert.equal(manualAmountText("paypal", 10), "US$10");
  assert.equal(manualAmountText("unknown", 10), "US$10");
});

test("Alipay top-ups follow the PayPal rules: from US$5, same credits and bonus", () => {
  assert.equal(topUpAmountError(5, false), null);
  assert.ok(topUpAmountError(4, false));
  assert.ok((topUp.presetsOtherUsd as readonly number[]).includes(5));
  assert.equal(usdToCredits(5), 40);
  assert.equal(usdToCredits(20), 168);
});

test("One order paid directly by Alipay costs its exact price, with no top-up minimum", () => {
  const a = manualPayments.alipay;
  assert.ok(isDirectPayMethod("alipay"));
  assert.equal(isDirectPayMethod("paypal"), false);
  assert.deepEqual(directPayMethods().map((m) => m.id), ["alipay"]);
  // 2 credits (the smallest report): US$0.25 = HK$1.95.
  assert.deepEqual(orderPayAmount(a, reportPrice(1500)), { usd: 0.25, hkd: 1.95 });
  // 3,000 characters = 3 credits = US$0.375: shown as US$0.38, HK$ from the exact amount.
  assert.deepEqual(orderPayAmount(a, reportPrice(3000)), { usd: 0.38, hkd: 2.93 });
  assert.equal(priceUsd(reportPrice(3000)), 0.38);
  // A full 20,000-character cycle: 8 credits = US$1 = HK$7.8.
  assert.deepEqual(orderPayAmount(a, reportPrice(20_000)), { usd: 1, hkd: 7.8 });
  assert.deepEqual(orderPayAmount(a, reportPrice(100_000)), { usd: 5, hkd: 39 });
  assert.equal(orderAmountText("alipay", reportPrice(3000)), "HK$2.93 (US$0.38 · 3 credits)");
  assert.equal(orderAmountText("paypal", reportPrice(3000)), "US$0.38 (3 credits)");
  assert.deepEqual(orderAmountParts("alipay", 800), { main: "HK$7.80", sub: "US$1 · 8 credits" });
});

test("Only Alipay top-ups are credited first and checked later; PayPal and crypto keep their own rules", () => {
  assert.ok(isPayFirstTopupMethod("alipay"));
  for (const m of ["paypal", "usdt", "usdc", "bitcoin", "payme", "bank_transfer", "stripe", "nowpayments"]) {
    assert.equal(isPayFirstTopupMethod(m), false, m);
  }
});
