import type { Metadata } from "next";
import Link from "next/link";
import { adminMetrics, adminOrders } from "@/lib/data/admin";
import { OrdersTable } from "@/components/admin/orders-table";
import { TopupReview, type PendingTopup } from "@/components/admin/topup-review";
import { ClaimQuickReview } from "@/components/admin/payment-claims";
import { PaymentAlert } from "@/components/admin/payment-alert";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { creditsHeldForMany } from "@/lib/orders/held-credits";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHKD } from "@/config/pricing";
import { hkdAmount, isManualPaymentMethod, manualPayments, paymentMethodLabel } from "@/config/payments";
import { ACTIVE_STATUSES } from "@/lib/orders/status";
import { formatDateTime } from "@/lib/utils";
import type { PaymentClaim } from "@/types/domain";
import { recheckStableTopups } from "@/lib/payments/stable-topups";

export const metadata: Metadata = { title: "Admin" };

async function pendingTopups(): Promise<PendingTopup[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("credit_topups")
    .select("id,usd,amount,method,payer_reference,created_at,user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const { data: profs } = ids.length ? await db.from("profiles").select("id,email").in("id", ids) : { data: [] };
  const emails = new Map((profs ?? []).map((p) => [p.id as string, p.email as string]));
  return rows.map((r) => ({
    id: r.id as string,
    usd: r.usd as number,
    amount: r.amount as number,
    method: r.method as string,
    methodLabel: paymentMethodLabel(r.method as string),
    // What should have arrived in the customer's own currency, e.g. HK$78 for a US$10 Alipay top-up.
    expectHkd: isManualPaymentMethod(r.method as string) ? hkdAmount(manualPayments[r.method as keyof typeof manualPayments], r.usd as number) : null,
    reference: (r.payer_reference as string | null) ?? null,
    email: emails.get(r.user_id as string) ?? "—",
    createdAt: formatDateTime(r.created_at as string),
  }));
}

export default async function AdminHome() {
  // stablecoin top-ups that have since settled on chain are credited before the lists are read
  await recheckStableTopups().catch(() => 0);
  const [m, orders, topupRows] = await Promise.all([adminMetrics(), adminOrders(200), pendingTopups()]);
  const queue = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).reverse(); // oldest first
  // Customers waiting on us to find their Alipay / PayMe / bank payment come first.
  const toVerify = orders
    .filter((o) => o.pending_claim && o.status === "awaiting_payment")
    .sort((a, b) => a.pending_claim!.created_at.localeCompare(b.pending_claim!.created_at));
  const [claimRows, held] = toVerify.length
    ? await Promise.all([
        createAdminClient().from("payment_claims").select("*").in("id", toVerify.map((o) => o.pending_claim!.id)).then((r) => (r.data ?? []) as PaymentClaim[]),
        creditsHeldForMany(toVerify.map((o) => o.id)),
      ])
    : [[] as PaymentClaim[], new Map<string, number>()];
  const claimById = new Map(claimRows.map((c) => [c.id, c]));
  const stats: [string, string | number, boolean?][] = [
    ["Payments to verify", m.claimsPending, m.claimsPending > 0],
    ["Waiting in queue", m.queued],
    ["In progress", m.inScreening],
    ["Completed", m.completed],
    ["Orders today", m.ordersToday],
    ["Orders", m.orders],
    ["Revenue", formatHKD(m.revenue)],
    ["Users", m.users],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        {/* one fixed place, so it notices when a new payment arrives on a refresh */}
        <PaymentAlert count={toVerify.length} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([k, v, alert]) => (
          <div key={k} className={alert ? "glass rounded-2xl border-warn/40 p-4 shadow-[0_0_0_1px_rgb(141_179_255/0.2)]" : "glass rounded-2xl p-4"}>
            <p className={alert ? "text-[12px] text-warn" : "text-[12px] text-fg-muted"}>{k}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{v}</p>
          </div>
        ))}
      </div>
      {toVerify.length > 0 && (
        <>
          <h2 className="mt-10 text-[16px] font-semibold">
            Payments to verify <span className="text-fg-subtle">· oldest first</span>
          </h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            Customers who paid one order by Alipay. Open your AlipayHK transaction records, find the transaction number, and check the amount is exactly what is shown here. Nothing is made for the customer until you press Confirm; if the money is missing or less, press Reject.
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {toVerify.map((o) => {
              const c = claimById.get(o.pending_claim!.id);
              return c ? (
                <li key={o.id}>
                  <ClaimQuickReview claim={c} orderId={o.id} orderPrice={o.price} email={o.profiles?.email ?? null} held={held.get(o.id) ?? 0} />
                </li>
              ) : null;
            })}
          </ul>
        </>
      )}
      {topupRows.length > 0 && (
        <>
          <h2 className="mt-10 text-[16px] font-semibold">
            Top-ups to verify <span className="text-fg-subtle">· oldest first</span>
          </h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">Check the account for the reference and amount, then confirm to add the credits.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {topupRows.map((t) => <TopupReview key={t.id} t={t} />)}
          </div>
        </>
      )}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold">Work queue <span className="text-fg-subtle">· oldest first</span></h2>
        <Link href="/admin/activity?kind=orders" className="text-[13px] text-accent hover:underline">All orders</Link>
      </div>
      <div className="mt-4"><OrdersTable orders={queue} /></div>
      <AutoRefresh every={20_000} className="mt-6" />
    </>
  );
}
