import type { Metadata } from "next";
import Link from "next/link";
import { adminMetrics, adminOrders } from "@/lib/data/admin";
import { OrdersTable } from "@/components/admin/orders-table";
import { TopupReview, type PendingTopup } from "@/components/admin/topup-review";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHKD } from "@/config/pricing";
import { paymentMethodLabel } from "@/config/payments";
import { ACTIVE_STATUSES } from "@/lib/orders/status";
import { formatDateTime, shortId } from "@/lib/utils";

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
    reference: (r.payer_reference as string | null) ?? null,
    email: emails.get(r.user_id as string) ?? "—",
    createdAt: formatDateTime(r.created_at as string),
  }));
}

export default async function AdminHome() {
  const [m, orders, topupRows] = await Promise.all([adminMetrics(), adminOrders(200), pendingTopups()]);
  const queue = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).reverse(); // oldest first
  // Customers waiting on us to find their Alipay / PayMe / bank payment come first.
  const toVerify = orders
    .filter((o) => o.pending_claim && o.status === "awaiting_payment")
    .sort((a, b) => a.pending_claim!.created_at.localeCompare(b.pending_claim!.created_at));
  const stats: [string, string | number, boolean?][] = [
    ["Payments to verify", m.claimsPending, m.claimsPending > 0],
    ["Waiting in queue", m.queued],
    ["In progress", m.inScreening],
    ["Completed", m.completed],
    ["Orders today", m.ordersToday],
    ["Orders", m.orders],
    ["Revenue", formatHKD(m.revenue)],
    ["Users", m.users],
    ["Free scans today (accounts)", m.scans],
    ["Free scans today (visitors)", m.guestScans],
  ];
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([k, v, alert]) => (
          <div key={k} className={alert ? "glass rounded-2xl border-warn/40 p-4 shadow-[0_0_0_1px_rgb(245_195_91/0.2)]" : "glass rounded-2xl p-4"}>
            <p className={alert ? "text-[12px] text-warn" : "text-[12px] text-fg-muted"}>{k}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{v}</p>
          </div>
        ))}
      </div>
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
      {toVerify.length > 0 && (
        <>
          <h2 className="mt-10 text-[16px] font-semibold">
            Payments to verify <span className="text-fg-subtle">· oldest first</span>
          </h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">Check the account for the reference and amount, then confirm or reject on the order page.</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {toVerify.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  data-tilt="5"
                  data-press
                  className="glass flex items-center justify-between gap-4 rounded-2xl border-warn/30 p-4 transition hover:border-warn/60"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] text-accent">#{shortId(o.id)}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">
                      {paymentMethodLabel(o.pending_claim!.method)} · {o.profiles?.email ?? "—"}
                    </p>
                    <p className="text-[11.5px] text-fg-subtle">Reported {formatDateTime(o.pending_claim!.created_at)}</p>
                  </div>
                  <span className="text-[18px] font-semibold">{formatHKD(o.pending_claim!.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold">Work queue <span className="text-fg-subtle">· oldest first</span></h2>
        <Link href="/admin/orders" className="text-[13px] text-accent hover:underline">All orders</Link>
      </div>
      <div className="mt-4"><OrdersTable orders={queue} /></div>
    </>
  );
}
