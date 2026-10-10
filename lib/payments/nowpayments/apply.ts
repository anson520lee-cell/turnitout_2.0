/**
 * Applies a payment update to our records. The same function handles a
 * signature-checked webhook and a status check made directly against the
 * NOWPayments API, and talks to the database only through `Store`, so the
 * rules can be tested without one.
 */
import {
  DEAD_STATUSES,
  decide,
  isNpStatus,
  num,
  type NpStatus,
  type PaymentPayload,
  type PaymentRecord,
} from "./core";

export interface StoredPayment extends PaymentRecord {
  user_id: string;
  paid_at: string | null;
}

export interface Store {
  findByOrderId(orderId: string): Promise<StoredPayment | null>;
  /** Writes `patch` only if the row still has `expected` status. False when it changed meanwhile. */
  save(id: string, expected: NpStatus, patch: Record<string, unknown>): Promise<boolean>;
  /** Confirms the top-up and adds credits in one step. 'already' when it was credited before. */
  credit(rec: StoredPayment): Promise<"credited" | "already">;
  /** Closes an unpaid top-up whose payment failed or expired. */
  cancelTopup(rec: StoredPayment): Promise<void>;
}

export type ApplyResult =
  | { ok: false; reason: string }
  | { ok: true; credited: boolean; flag?: "underpaid" | "mismatch"; status: NpStatus; rec: StoredPayment };

export async function applyPaymentUpdate(store: Store, payload: PaymentPayload): Promise<ApplyResult> {
  if (typeof payload.order_id !== "string" || !payload.order_id) return { ok: false, reason: "missing order" };
  if (!isNpStatus(payload.payment_status)) return { ok: false, reason: "unknown status" };

  let everCredited = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const rec = await store.findByOrderId(payload.order_id);
    if (!rec) return { ok: false, reason: "unknown order" };
    const d = decide(rec, payload);
    if (d.kind === "reject") return { ok: false, reason: d.reason };
    if (d.kind === "keep") return { ok: true, credited: everCredited, status: rec.status, rec };

    let credited = false;
    const status = d.status;
    if (d.credit) {
      const res = await store.credit(rec);
      credited = res === "credited";
      everCredited ||= credited;
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      np_payment_id: String(payload.payment_id),
      updated_at: now,
      raw: payload,
    };
    const paid = num(payload.actually_paid);
    if (paid !== null) patch.actually_paid = paid;
    const amount = num(payload.pay_amount);
    if (amount !== null && rec.pay_amount === null) patch.pay_amount = amount;
    if (payload.pay_address && !rec.pay_address) patch.pay_address = payload.pay_address;
    if (payload.network) patch.network = payload.network;
    if (payload.payin_hash) patch.tx_hash = payload.payin_hash;
    if (d.credit && !rec.paid_at) patch.paid_at = now;

    const saved = await store.save(rec.id, rec.status, patch);
    if (!saved) continue; // another delivery changed the row first: decide again on fresh data
    if (DEAD_STATUSES.includes(status) && status !== "refunded") await store.cancelTopup(rec);
    return { ok: true, credited: everCredited, flag: d.flag, status, rec };
  }
  return { ok: false, reason: "busy" };
}
