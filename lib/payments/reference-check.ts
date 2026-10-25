import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * True when this payment reference (an Alipay transaction number, a PayPal
 * transaction ID) has already been claimed by this method, for a top-up or for
 * an order, and that claim is waiting or confirmed. One transfer must never pay
 * for two things. Rejected claims don't count, so a customer can resend a
 * corrected number. Unique indexes (migrations 0019 and 0021) back this up when
 * two requests arrive at the same moment.
 */
export async function referenceTaken(method: string, reference: string): Promise<boolean> {
  const db = createAdminClient();
  const variants = [...new Set([reference, reference.toUpperCase(), reference.toLowerCase()])];
  const [topups, claims] = await Promise.all([
    db.from("credit_topups").select("id").eq("method", method).in("payer_reference", variants).in("status", ["pending", "confirmed"]).limit(1),
    db.from("payment_claims").select("id").eq("method", method).in("payer_reference", variants).in("status", ["pending", "confirmed"]).limit(1),
  ]);
  return Boolean(topups.data?.length || claims.data?.length);
}
