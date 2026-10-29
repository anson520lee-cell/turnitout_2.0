import { CREDITS_PER_USD, toCredits } from "../../config/pricing";

/**
 * Money actually received, for the admin overview, in HK$ (to the cent).
 *
 * Real money comes in two ways: credit top-ups (US$, any method) and orders
 * paid directly by a manual method such as Alipay (the order's credit price at
 * the top-up rate). Orders paid with credits are not counted again: that money
 * was counted when the credits were bought. Free reports, admin gifts and test
 * payments are never money. A cancelled order (refunded) doesn't count.
 *
 * An Alipay order that started, or an Alipay top-up that was credited, before the
 * admin found the money in AlipayHK ("check later") is kept apart as `unchecked`
 * until it is marked received.
 */

/** HK$ is pegged to the US$; Alipay amounts are worked out at the same rate. */
export const HKD_PER_USD = 7.8;

/** Payment providers that never bring money in. */
export const NOT_MONEY_PROVIDERS = ["dev", "admin_free", "free_daily", "credits"] as const;

export type RevenueTopup = { usd: number; /** credited on trust, the payment not found in AlipayHK yet */ unchecked?: boolean };
export type RevenueOrderPayment = {
  provider: string;
  /** cents, 100 = 1 credit */
  amount: number;
  orderStatus: string;
  /** For a manual method: the status of the claim this payment came from. */
  claimStatus?: string | null;
};

export type Revenue = { checked: number; unchecked: number; topups: number; orders: number };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** HK$ for an order price in cents (100 = 1 credit): 3 credits = HK$2.93, as the customer is asked to pay. */
export function orderHkd(cents: number): number {
  return round2((toCredits(cents) * HKD_PER_USD) / CREDITS_PER_USD);
}

export function revenueTotals(topups: RevenueTopup[], payments: RevenueOrderPayment[]): Revenue {
  const topupHkd = round2(topups.filter((t) => !t.unchecked).reduce((s, t) => s + t.usd * HKD_PER_USD, 0));
  let orders = 0;
  let unchecked = topups.filter((t) => t.unchecked).reduce((s, t) => s + t.usd * HKD_PER_USD, 0);
  for (const p of payments) {
    if ((NOT_MONEY_PROVIDERS as readonly string[]).includes(p.provider)) continue;
    if (p.orderStatus === "cancelled" || p.orderStatus === "awaiting_payment") continue;
    if (p.claimStatus === "rejected") continue;
    if (p.claimStatus === "pending") unchecked += orderHkd(p.amount);
    else orders += orderHkd(p.amount);
  }
  orders = round2(orders);
  unchecked = round2(unchecked);
  return { checked: round2(topupHkd + orders), unchecked, topups: topupHkd, orders };
}

/** "HK$85.80", "HK$78". */
export function formatHkdDollars(v: number): string {
  return `HK$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}
