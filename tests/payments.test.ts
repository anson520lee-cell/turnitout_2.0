import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsClaims, enabledManualPayments, hkdAmount, isManualPaymentMethod, manualAmountText, manualPayments, paymentMethodLabel, payeeReady } from "../config/payments";
import { topUp, topUpAmountError, usdToCredits } from "../config/pricing";

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
