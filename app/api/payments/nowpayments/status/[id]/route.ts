import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchPayment, isMockMode, processPaymentUpdate } from "@/lib/payments/nowpayments";
import { DEAD_STATUSES, PAID_STATUSES, type NpStatus } from "@/lib/payments/nowpayments/core";
import { notifyOwner } from "@/lib/notify";
import { formatUSD } from "@/config/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { shortId } from "@/lib/utils";

const COLUMNS = "id,usd,pay_currency,network,pay_amount,actually_paid,pay_address,status,expires_at,created_at,paid_at,np_payment_id,last_synced_at";

/**
 * The payment page polls this. It returns only the signed-in owner's payment
 * (row-level security: someone else's id is simply "not found"). While a
 * payment is still open it also asks NOWPayments for the real status
 * (server to server) so a delayed webhook never leaves the page stuck. The
 * browser can never report a payment as successful.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  let { data: row } = await supabase.from("crypto_payments").select(COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const open = !PAID_STATUSES.includes(row.status as NpStatus) && !DEAD_STATUSES.includes(row.status as NpStatus);
  const stale = !row.last_synced_at || Date.now() - new Date(row.last_synced_at).getTime() > 8000;
  if (row.np_payment_id && (open || row.status === "partially_paid") && stale && !isMockMode()) {
    const db = createAdminClient();
    await db.from("crypto_payments").update({ last_synced_at: new Date().toISOString() }).eq("id", row.id);
    try {
      const remote = await fetchPayment(row.np_payment_id);
      if (remote) {
        // The record we hold decides: the order id must match ours.
        const { data: mine } = await db.from("crypto_payments").select("order_id,usd").eq("id", row.id).single();
        const res = await processPaymentUpdate({ ...remote, order_id: remote.order_id ?? mine?.order_id }, "sync");
        if (res.ok && res.credited) {
          notifyOwner("payment_confirmed", { topup: shortId(res.rec.topup_id), method: `Crypto (${row.pay_currency})`, amount: formatUSD(res.rec.usd) });
        }
        const again = await supabase.from("crypto_payments").select(COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
        if (again.data) row = again.data;
      }
    } catch (e) {
      console.warn("[nowpayments] status sync failed", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ payment: row }, { headers: { "cache-control": "no-store" } });
}
