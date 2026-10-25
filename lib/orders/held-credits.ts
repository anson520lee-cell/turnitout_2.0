import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shortId } from "@/lib/utils";

/*
 * When a customer pays an order by Alipay with some credits already on their
 * account, those credits are used first (taken when they send the Alipay
 * payment) and only the rest is paid by Alipay. Those ledger rows are marked by
 * their notes, so they are never mixed up with a full credit payment or a
 * refund for a failed report on the same order.
 */
const HELD_MARK = "credits used first";
const RETURN_PREFIX = "Returned:";

/** The ledger note for credits taken first for an order paid by `method`. */
export function heldNote(orderId: string, methodLabel: string): string {
  return `Order ${shortId(orderId)}: ${HELD_MARK}, rest by ${methodLabel}`;
}

/** The ledger note for giving those credits back. */
export function returnNote(orderId: string, why: string): string {
  return `${RETURN_PREFIX} order ${shortId(orderId)} ${why}`;
}

type Row = { order_id: string; delta: number; kind: string; note: string | null };

function heldDelta(r: Row): number {
  if (r.kind === "spend" && r.note?.includes(HELD_MARK)) return -r.delta;
  if (r.kind === "refund" && r.note?.startsWith(RETURN_PREFIX)) return -r.delta;
  return 0;
}

/** Credits taken first for an order and not given back yet. */
export async function creditsHeldFor(orderId: string): Promise<number> {
  return (await creditsHeldForMany([orderId])).get(orderId) ?? 0;
}

/** The same for several orders at once (admin lists). */
export async function creditsHeldForMany(orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orderIds.length) return out;
  const db = createAdminClient();
  const { data } = await db.from("credit_transactions").select("order_id,delta,kind,note").in("order_id", orderIds).in("kind", ["spend", "refund"]);
  for (const r of (data ?? []) as Row[]) out.set(r.order_id, (out.get(r.order_id) ?? 0) + heldDelta(r));
  for (const [k, v] of out) out.set(k, Math.max(0, v));
  return out;
}

/** Gives back credits taken first for an order (its Alipay payment was rejected, or it was paid another way). */
export async function releaseHeldCredits(orderId: string, userId: string, why: string): Promise<number> {
  const held = await creditsHeldFor(orderId);
  if (held <= 0) return 0;
  const db = createAdminClient();
  await db.rpc("credit_add", {
    p_user: userId,
    p_amount: held,
    p_kind: "refund",
    p_order: orderId,
    p_topup: null,
    p_note: returnNote(orderId, why),
  });
  return held;
}
