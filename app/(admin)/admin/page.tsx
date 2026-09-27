import type { Metadata } from "next";
import Link from "next/link";
import { adminMetrics, adminOrders } from "@/lib/data/admin";
import { OrdersTable } from "@/components/admin/orders-table";
import { formatHKD } from "@/config/pricing";
import { ACTIVE_STATUSES } from "@/lib/orders/status";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  const [m, orders] = await Promise.all([adminMetrics(), adminOrders(200)]);
  const queue = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).reverse(); // oldest first
  const stats: [string, string | number][] = [
    ["Users", m.users],
    ["Orders", m.orders],
    ["Orders today", m.ordersToday],
    ["Waiting in queue", m.queued],
    ["In progress", m.inScreening],
    ["Completed", m.completed],
    ["Revenue (Stripe)", formatHKD(m.revenue)],
    ["Free scans today", m.scans],
  ];
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="glass rounded-2xl p-4">
            <p className="text-[12px] text-fg-muted">{k}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold">Work queue <span className="text-fg-subtle">· oldest first</span></h2>
        <Link href="/admin/orders" className="text-[13px] text-accent hover:underline">All orders</Link>
      </div>
      <div className="mt-4"><OrdersTable orders={queue} /></div>
    </>
  );
}
