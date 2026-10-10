import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { COINS, findCoin, num, type Coin, type NpStatus, type PaymentPayload } from "./core";
import { applyPaymentUpdate, type ApplyResult, type Store, type StoredPayment } from "./apply";

/**
 * NOWPayments (crypto) client and database glue. Secrets are read from the
 * server environment only:
 *   NOWPAYMENTS_API_KEY     account API key
 *   NOWPAYMENTS_IPN_SECRET  secret that signs webhooks (IPN)
 *   NOWPAYMENTS_API_URL     optional; default is the live API. For the sandbox
 *                           use https://api-sandbox.nowpayments.io/v1
 *   NOWPAYMENTS_MOCK=true   development only: fake payments, no real API
 */
const LIVE_URL = "https://api.nowpayments.io/v1";

export function isMockMode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NOWPAYMENTS_MOCK === "true";
}

export function isNowPaymentsConfigured(): boolean {
  if (isMockMode()) return true;
  return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
}

function apiUrl(): string {
  return (process.env.NOWPAYMENTS_API_URL || LIVE_URL).replace(/\/+$/, "");
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not set");
  const res = await fetch(`${apiUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new NowPaymentsError(res.status, msg);
  }
  return json as T;
}

export class NowPaymentsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let coinCache: { at: number; ids: Set<string> | null } | null = null;

/** The offered coins, cut down to what the NOWPayments account has enabled. */
export async function availableCoins(): Promise<Coin[]> {
  if (isMockMode() || !process.env.NOWPAYMENTS_API_KEY) return [...COINS];
  if (!coinCache || Date.now() - coinCache.at > 10 * 60_000) {
    try {
      const r = await call<{ selectedCurrencies?: string[] }>("/merchant/coins");
      coinCache = { at: Date.now(), ids: new Set((r.selectedCurrencies ?? []).map((c) => c.toLowerCase())) };
    } catch {
      coinCache = { at: Date.now() - 9 * 60_000, ids: null }; // retry in a minute; show all meanwhile
    }
  }
  const ids = coinCache.ids;
  const list = ids && ids.size > 0 ? COINS.filter((c) => ids.has(c.id)) : [...COINS];
  return list.length > 0 ? list : [...COINS];
}

export interface CreatedPayment extends PaymentPayload {
  payment_id: string | number;
  pay_address: string;
  pay_amount: number | string;
}

export async function createPayment(args: {
  orderId: string;
  usd: number;
  coin: Coin;
  callbackUrl: string;
}): Promise<CreatedPayment> {
  if (isMockMode()) {
    const rate: Record<string, number> = { BTC: 0.0000085, USDT: 1, USDC: 1 };
    return {
      payment_id: `mock-${args.orderId.slice(0, 8)}`,
      payment_status: "waiting",
      pay_address: args.coin.asset === "BTC" ? "bc1qmockmockmockmockmockmockmockmockmock" : "TMockMockMockMockMockMockMockMock12",
      pay_amount: Number((args.usd * rate[args.coin.asset] + (args.coin.asset === "BTC" ? 0 : 0.37)).toFixed(args.coin.asset === "BTC" ? 8 : 6)),
      pay_currency: args.coin.id,
      price_amount: args.usd,
      price_currency: "usd",
      order_id: args.orderId,
      network: args.coin.network,
      valid_until: new Date(Date.now() + 20 * 60_000).toISOString(),
    } as CreatedPayment;
  }
  return call<CreatedPayment>("/payment", {
    method: "POST",
    body: {
      price_amount: args.usd,
      price_currency: "usd",
      pay_currency: args.coin.id,
      order_id: args.orderId,
      order_description: "Credit top-up",
      ipn_callback_url: args.callbackUrl,
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    },
  });
}

/** Asks NOWPayments for the current state of a payment (server-to-server, key-authenticated). */
export async function fetchPayment(npPaymentId: string): Promise<PaymentPayload | null> {
  if (isMockMode()) return null;
  return call<PaymentPayload>(`/payment/${encodeURIComponent(npPaymentId)}`);
}

/** Store backed by the real database. */
export function supabaseStore(): Store {
  const db = createAdminClient();
  return {
    async findByOrderId(orderId) {
      const { data } = await db
        .from("crypto_payments")
        .select("id,order_id,topup_id,user_id,usd,pay_currency,pay_amount,pay_address,np_payment_id,status,paid_at")
        .eq("order_id", orderId)
        .maybeSingle();
      if (!data) return null;
      return { ...data, pay_amount: num(data.pay_amount) } as StoredPayment;
    },
    async save(id, expected, patch) {
      const { data, error } = await db
        .from("crypto_payments")
        .update(patch)
        .eq("id", id)
        .eq("status", expected)
        .select("id");
      if (error) throw new Error(`crypto_payments update failed: ${error.message}`);
      return Boolean(data?.length);
    },
    async credit(rec) {
      // A payment that arrives after we closed the top-up (late but complete) is still real money.
      await db
        .from("credit_topups")
        .update({ status: "awaiting_payment" })
        .eq("id", rec.topup_id)
        .eq("status", "cancelled")
        .eq("method", "nowpayments");
      const { data, error } = await db.rpc("credit_confirm_topup", {
        p_topup: rec.topup_id,
        p_reviewer: null,
        p_provider_ref: `nowpayments:${rec.np_payment_id ?? rec.order_id}`,
      });
      if (error) throw new Error(`credit_confirm_topup failed: ${error.message}`);
      return typeof data === "number" && data >= 0 ? "credited" : "already";
    },
    async cancelTopup(rec) {
      await db.from("credit_topups").update({ status: "cancelled" }).eq("id", rec.topup_id).eq("status", "awaiting_payment");
    },
  };
}

export async function processPaymentUpdate(payload: PaymentPayload, source: "webhook" | "sync"): Promise<ApplyResult> {
  const res = await applyPaymentUpdate(supabaseStore(), payload);
  if (res.ok) {
    if (res.credited) await audit("crypto_topup_confirmed", { actorId: res.rec.user_id, detail: { topup: res.rec.topup_id, np: res.rec.np_payment_id, source } });
    if (res.flag) await audit("crypto_payment_flag", { actorId: res.rec.user_id, detail: { topup: res.rec.topup_id, flag: res.flag, status: res.status, source } });
  } else if (res.reason !== "unknown order") {
    await audit("crypto_payment_rejected", { detail: { reason: res.reason, order: String(payload.order_id ?? "").slice(0, 64), source } });
  }
  return res;
}

export type { NpStatus };
export { findCoin };
