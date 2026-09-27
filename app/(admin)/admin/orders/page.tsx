import type { Metadata } from "next";
import { adminOrders } from "@/lib/data/admin";
import { OrdersTable } from "@/components/admin/orders-table";
import { ORDER_STATUSES, statusMeta } from "@/lib/orders/status";
import { serviceLabels } from "@/config/services";

export const metadata: Metadata = { title: "Admin · Orders" };

export default async function AdminOrders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const service = typeof sp.service === "string" ? sp.service : "";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await adminOrders(1000);
  const orders = all.filter(
    (o) =>
      (!status || o.status === status) &&
      (!service || o.service_type === service) &&
      (!q || o.id.toLowerCase().startsWith(q.replace(/^#/, "")) || o.title.toLowerCase().includes(q) || (o.profiles?.email ?? "").toLowerCase().includes(q)),
  );
  const select = "h-10 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[13px] text-fg";
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      <form className="mt-6 flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Order ID, title or email" className={`${select} w-64`} />
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status} className={select}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}
        </select>
        <label className="sr-only" htmlFor="service">Service</label>
        <select id="service" name="service" defaultValue={service} className={select}>
          <option value="">All services</option>
          {Object.entries(serviceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-accent px-4 text-[13px] font-medium text-white">Filter</button>
      </form>
      <p className="mt-4 text-[12.5px] text-fg-subtle">{orders.length} orders</p>
      <div className="mt-2"><OrdersTable orders={orders} /></div>
    </>
  );
}
