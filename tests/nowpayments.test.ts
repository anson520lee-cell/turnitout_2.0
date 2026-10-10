import { test } from "node:test";
import assert from "node:assert/strict";
import { signBody, verifySignature, decide, type PaymentRecord } from "../lib/payments/nowpayments/core";
import { applyPaymentUpdate, type Store, type StoredPayment } from "../lib/payments/nowpayments/apply";

const SECRET = "test-ipn-secret";

function rec(over: Partial<StoredPayment> = {}): StoredPayment {
  return {
    id: "pay-1", order_id: "order-1", topup_id: "topup-1", user_id: "user-1", usd: 20,
    pay_currency: "usdttrc20", pay_amount: 20.37, pay_address: "TAddr", np_payment_id: "555",
    status: "waiting", paid_at: null, ...over,
  };
}
const ipn = (over: Record<string, unknown> = {}) => ({
  payment_id: 555, payment_status: "finished", pay_address: "TAddr", price_amount: 20, price_currency: "usd",
  pay_amount: 20.37, actually_paid: 20.37, pay_currency: "usdttrc20", order_id: "order-1", ...over,
});

/** In-memory stand-in for the database with the same one-time-credit rule as credit_confirm_topup. */
function memStore(initial: StoredPayment) {
  const row = { ...initial };
  const topup = { status: "awaiting_payment" as string };
  const state = { balance: 0, credits: 0 };
  const store: Store = {
    async findByOrderId(id) { return id === row.order_id ? { ...row } : null; },
    async save(_id, expected, patch) {
      if (row.status !== expected) return false;
      Object.assign(row, patch);
      return true;
    },
    async credit() {
      if (topup.status === "cancelled") topup.status = "awaiting_payment";
      if (topup.status !== "awaiting_payment") return "already";
      topup.status = "confirmed";
      state.balance += 156; state.credits++;
      return "credited";
    },
    async cancelTopup() { if (topup.status === "awaiting_payment") topup.status = "cancelled"; },
  };
  return { store, row, topup, state };
}

test("signature: valid, tampered, missing and wrong secret", () => {
  const body = ipn();
  const raw = JSON.stringify(body);
  const sig = signBody(body, SECRET);
  assert.equal(verifySignature(raw, sig, SECRET), true);
  // key order in the raw body must not matter (NOWPayments sorts keys)
  assert.equal(verifySignature(JSON.stringify(Object.fromEntries(Object.entries(body).reverse())), sig, SECRET), true);
  assert.equal(verifySignature(JSON.stringify({ ...body, price_amount: 1 }), sig, SECRET), false);
  assert.equal(verifySignature(raw, null, SECRET), false);
  assert.equal(verifySignature(raw, "zz", SECRET), false);
  assert.equal(verifySignature(raw, sig, "other"), false);
  assert.equal(verifySignature(raw, sig, undefined), false);
  assert.equal(verifySignature("not json", sig, SECRET), false);
});

test("finished payment adds credits once", async () => {
  const m = memStore(rec());
  const r = await applyPaymentUpdate(m.store, ipn());
  assert.ok(r.ok && r.credited);
  assert.equal(m.state.credits, 1);
  assert.equal(m.row.status, "finished");
  assert.ok(m.row.paid_at);
});

test("same webhook delivered 3 times, also in parallel, credits once", async () => {
  const m = memStore(rec());
  await Promise.all([1, 2, 3].map(() => applyPaymentUpdate(m.store, ipn())));
  await applyPaymentUpdate(m.store, ipn());
  await applyPaymentUpdate(m.store, ipn({ payment_status: "confirmed" }));
  assert.equal(m.state.credits, 1);
  assert.equal(m.row.status, "finished");
});

test("full lifecycle waiting → confirming → confirmed → sending → finished credits once", async () => {
  const m = memStore(rec());
  for (const s of ["waiting", "confirming", "confirmed", "sending", "finished"]) {
    await applyPaymentUpdate(m.store, ipn({ payment_status: s, actually_paid: s === "waiting" ? 0 : 20.37 }));
  }
  assert.equal(m.state.credits, 1);
  assert.equal(m.row.status, "finished");
});

test("underpayment is not credited and shows partially_paid", async () => {
  const m = memStore(rec());
  const r = await applyPaymentUpdate(m.store, ipn({ payment_status: "partially_paid", actually_paid: 19.5 }));
  assert.ok(r.ok && !r.credited && r.flag === "underpaid");
  assert.equal(m.row.status, "partially_paid");
  assert.equal(m.state.credits, 0);
  // even a 'finished' status with too little paid never credits
  const r2 = await applyPaymentUpdate(m.store, ipn({ payment_status: "finished", actually_paid: 9.5 }));
  assert.ok(r2.ok && !r2.credited);
  assert.equal(m.state.credits, 0);
});

test("expired and failed close the top-up and never credit", async () => {
  for (const s of ["expired", "failed"]) {
    const m = memStore(rec());
    const r = await applyPaymentUpdate(m.store, ipn({ payment_status: s, actually_paid: 0 }));
    assert.ok(r.ok && !r.credited);
    assert.equal(m.row.status, s);
    assert.equal(m.topup.status, "cancelled");
    // a stale 'waiting' afterwards cannot reopen it
    await applyPaymentUpdate(m.store, ipn({ payment_status: "waiting", actually_paid: 0 }));
    assert.equal(m.row.status, s);
    assert.equal(m.state.credits, 0);
  }
});

test("a complete payment that arrives after expiry is still credited once", async () => {
  const m = memStore(rec());
  await applyPaymentUpdate(m.store, ipn({ payment_status: "expired", actually_paid: 0 }));
  m.row.status = "waiting"; // NOWPayments can revive a payment when funds do arrive
  const r = await applyPaymentUpdate(m.store, ipn());
  assert.ok(r.ok && r.credited);
  assert.equal(m.state.credits, 1);
});

test("webhook for another order, payment id, coin, amount or address is rejected", async () => {
  const m = memStore(rec());
  const cases: [Record<string, unknown>, string][] = [
    [{ order_id: "order-2" }, "unknown order"],
    [{ payment_id: 999 }, "payment id mismatch"],
    [{ pay_currency: "btc" }, "currency mismatch"],
    [{ price_amount: 1 }, "amount mismatch"],
    [{ price_currency: "eur" }, "amount mismatch"],
    [{ pay_address: "Attacker" }, "address mismatch"],
    [{ payment_status: "hacked" }, "unknown status"],
  ];
  for (const [over, reason] of cases) {
    const r = await applyPaymentUpdate(m.store, ipn(over));
    assert.ok(!r.ok && r.reason === reason, `${JSON.stringify(over)} → ${!r.ok && r.reason}`);
  }
  assert.equal(m.state.credits, 0);
  assert.equal(m.row.status, "waiting");
});

test("price comes from the stored record, never from the request", () => {
  // The only price the payload can carry is price_amount; it must equal what the server stored.
  const d = decide(rec() as PaymentRecord, ipn({ price_amount: 1, actually_paid: 1, pay_amount: 1 }));
  assert.equal(d.kind, "reject");
});

test("a paid payment cannot be pushed back by an old webhook", async () => {
  const m = memStore(rec());
  await applyPaymentUpdate(m.store, ipn());
  await applyPaymentUpdate(m.store, ipn({ payment_status: "waiting", actually_paid: 0 }));
  await applyPaymentUpdate(m.store, ipn({ payment_status: "failed", actually_paid: 0 }));
  assert.equal(m.row.status, "finished");
  assert.equal(m.state.credits, 1);
});
