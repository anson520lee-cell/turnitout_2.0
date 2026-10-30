import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentClaim } from "@/types/domain";

/*
 * Alipay orders start first and are checked later (Jordan 2026-10-26: checking
 * every payment by hand before the report starts can't keep up). When a
 * customer sends the transaction number, the order is marked paid at once and
 * the report starts; the claim stays "pending" until the admin compares it
 * with the AlipayHK records whenever there is time.
 *
 * The only limit: an account whose number turned out to be fake can't pay
 * orders by Alipay any more. A fake claim costs only the AI cost of one report.
 * The fake mark is an audit event, so no table change is needed. Any number of
 * payments per account may be unchecked at a time, whatever the number looks like.
 */

export const FAKE_CLAIM_EVENT = "payment_claim_fake";

/** True when an earlier Alipay number from this account was marked fake. */
export async function markedFake(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { count } = await db
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("event", FAKE_CLAIM_EVENT)
    .eq("detail->>customer", userId);
  return (count ?? 0) > 0;
}

/** now: the report starts as soon as the number is sent; blocked: no Alipay orders. */
export type PayFirst = "now" | "blocked";

/** An account whose number turned out to be fake can't pay orders by Alipay; any other account starts at once. */
export async function payFirstFor(userId: string): Promise<PayFirst> {
  return (await markedFake(userId)) ? "blocked" : "now";
}

/** True when this claim's order was started on trust (its payment record points at the claim) and is no longer unpaid. */
export async function startedOnClaim(claim: Pick<PaymentClaim, "id" | "method" | "order_id">): Promise<boolean> {
  const db = createAdminClient();
  const [{ data: pay }, { data: order }] = await Promise.all([
    db.from("payments").select("id").eq("provider", claim.method).eq("provider_payment_id", claim.id).maybeSingle(),
    db.from("orders").select("status").eq("id", claim.order_id).maybeSingle<{ status: string }>(),
  ]);
  return Boolean(pay && order && order.status !== "awaiting_payment");
}
