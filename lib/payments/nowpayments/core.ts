/**
 * NOWPayments rules that need no database or network: the coin list, IPN
 * signature checking, and the decision of what a payment update means.
 * Kept free of imports so it can be unit-tested on its own.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const NP_STATUSES = [
  "waiting",
  "confirming",
  "confirmed",
  "sending",
  "finished",
  "partially_paid",
  "failed",
  "refunded",
  "expired",
] as const;
export type NpStatus = (typeof NP_STATUSES)[number];

export function isNpStatus(v: unknown): v is NpStatus {
  return typeof v === "string" && (NP_STATUSES as readonly string[]).includes(v);
}

/** Statuses where the customer's full payment has arrived on-chain. */
export const PAID_STATUSES: readonly NpStatus[] = ["confirmed", "sending", "finished"];
/** Statuses that will not change by themselves any more. */
export const DEAD_STATUSES: readonly NpStatus[] = ["failed", "expired", "refunded"];

export interface Coin {
  /** NOWPayments ticker. */
  id: string;
  asset: "USDT" | "USDC" | "BTC";
  /** Network shown to the customer. */
  network: string;
  /** Short hint, e.g. typical fee level. */
  hint?: string;
}

/**
 * Assets offered at checkout. Tickers follow NOWPayments' naming. When the
 * API key is set, the list is cut down to what the account actually supports.
 */
export const COINS: readonly Coin[] = [
  { id: "usdttrc20", asset: "USDT", network: "TRON (TRC20)", hint: "Low fees" },
  { id: "usdtbsc", asset: "USDT", network: "BNB Smart Chain (BEP20)" },
  { id: "usdterc20", asset: "USDT", network: "Ethereum (ERC20)", hint: "Higher fees" },
  { id: "usdcerc20", asset: "USDC", network: "Ethereum (ERC20)", hint: "Higher fees" },
  { id: "usdcsol", asset: "USDC", network: "Solana" },
  { id: "btc", asset: "BTC", network: "Bitcoin" },
];

export function findCoin(id: string): Coin | undefined {
  return COINS.find((c) => c.id === id);
}

/** Recursively sorts object keys, as NOWPayments does before signing. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) out[k] = sortKeys((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

export function signBody(body: unknown, secret: string): string {
  return createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
}

/** True only when `signature` is the HMAC-SHA512 of the sorted body under `secret`. */
export function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const expected = Buffer.from(signBody(parsed, secret), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(signature.trim().toLowerCase(), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The fields of a NOWPayments payment / IPN body that we read. */
export interface PaymentPayload {
  payment_id?: string | number;
  payment_status?: string;
  pay_address?: string;
  price_amount?: number | string;
  price_currency?: string;
  pay_amount?: number | string;
  actually_paid?: number | string;
  pay_currency?: string;
  order_id?: string;
  network?: string;
  payin_hash?: string | null;
  valid_until?: string;
  expiration_estimate_date?: string;
}

/** What we stored when the payment was created. */
export interface PaymentRecord {
  id: string;
  order_id: string;
  topup_id: string;
  usd: number;
  pay_currency: string;
  pay_amount: number | null;
  pay_address: string | null;
  np_payment_id: string | null;
  status: NpStatus;
}

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export type Decision =
  /** Not about this payment, or malformed: answer 4xx and change nothing. */
  | { kind: "reject"; reason: string }
  /** Valid but nothing to change (stale or repeated). */
  | { kind: "keep"; reason: string }
  /** Record the new status; add credits only when `credit` is true. */
  | { kind: "update"; status: NpStatus; credit: boolean; flag?: "underpaid" | "mismatch" };

const RANK: Partial<Record<NpStatus, number>> = { waiting: 0, confirming: 1, confirmed: 2, sending: 3, finished: 4 };

/**
 * Decides what a payment update (from a signed webhook or from asking
 * NOWPayments directly) means for our record. Money is only ever released
 * when the payment id, order id, currency, fiat amount and paid amount all
 * match what WE stored at checkout, never what the browser sent.
 */
export function decide(rec: PaymentRecord, p: PaymentPayload): Decision {
  if (!isNpStatus(p.payment_status)) return { kind: "reject", reason: "unknown status" };
  const status = p.payment_status;

  if (p.order_id !== rec.order_id) return { kind: "reject", reason: "order mismatch" };
  const pid = p.payment_id === undefined ? null : String(p.payment_id);
  if (!pid || (rec.np_payment_id && rec.np_payment_id !== pid)) return { kind: "reject", reason: "payment id mismatch" };
  if (p.pay_currency && p.pay_currency.toLowerCase() !== rec.pay_currency) return { kind: "reject", reason: "currency mismatch" };
  const priceAmount = num(p.price_amount);
  if (priceAmount !== null && priceAmount !== rec.usd) return { kind: "reject", reason: "amount mismatch" };
  if (p.price_currency && p.price_currency.toLowerCase() !== "usd") return { kind: "reject", reason: "amount mismatch" };
  if (rec.pay_address && p.pay_address && p.pay_address !== rec.pay_address) return { kind: "reject", reason: "address mismatch" };

  // A payment that already succeeded can only move forward (or be refunded).
  const cur = rec.status;
  const curPaid = PAID_STATUSES.includes(cur);
  if (curPaid) {
    if (status === "refunded") return { kind: "update", status, credit: false };
    const a = RANK[cur] ?? 0;
    const b = RANK[status] ?? -1;
    if (b > a) return { kind: "update", status, credit: false };
    return { kind: "keep", reason: "already paid" };
  }

  if (PAID_STATUSES.includes(status)) {
    const expected = rec.pay_amount ?? num(p.pay_amount);
    const paid = num(p.actually_paid);
    if (expected === null || paid === null) return { kind: "update", status: "confirming", credit: false, flag: "mismatch" };
    // Tolerate rounding in the last decimals only.
    if (paid + 1e-9 < expected * 0.9999) return { kind: "update", status: "partially_paid", credit: false, flag: "underpaid" };
    return { kind: "update", status, credit: true };
  }
  if (status === "partially_paid") return { kind: "update", status, credit: false, flag: "underpaid" };
  if (DEAD_STATUSES.includes(cur) && (status === "waiting" || status === "confirming")) {
    return { kind: "keep", reason: "already closed" };
  }
  if (cur === "confirming" && status === "waiting") return { kind: "keep", reason: "stale" };
  if (cur === status) return { kind: "keep", reason: "no change" };
  return { kind: "update", status, credit: false };
}

/** Customer-facing wording for each status. */
export const STATUS_COPY: Record<NpStatus, { title: string; body: string; tone: "info" | "progress" | "success" | "danger" | "warn" }> = {
  waiting: { title: "Waiting for your payment", body: "Send the exact amount to the address below. This page updates by itself.", tone: "info" },
  confirming: { title: "Payment received, confirming", body: "We can see your transfer on the network. Credits are added once it is confirmed.", tone: "progress" },
  confirmed: { title: "Payment confirmed", body: "Your credits are being added.", tone: "success" },
  sending: { title: "Payment confirmed", body: "Your credits are being added.", tone: "success" },
  finished: { title: "Payment complete", body: "Your credits have been added to your balance.", tone: "success" },
  partially_paid: {
    title: "Partially paid",
    body: "We received less than the full amount, so your credits were not added. Don't send the rest to a new address. Contact support with this payment ID and we will fix it.",
    tone: "warn",
  },
  failed: { title: "Payment failed", body: "This payment didn't go through. You can start a new one.", tone: "danger" },
  expired: { title: "Payment expired", body: "The time for this payment ran out. Please don't send anything to this address; start a new payment instead.", tone: "danger" },
  refunded: { title: "Payment refunded", body: "This payment was refunded.", tone: "warn" },
};
