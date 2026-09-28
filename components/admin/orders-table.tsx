import Link from "next/link";
import type { AdminOrder } from "@/lib/data/admin";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { serviceLabels } from "@/config/services";
import { formatHKD } from "@/config/pricing";
import { formatDateTime, shortId } from "@/lib/utils";

export function OrdersTable({ orders }: { orders: AdminOrder[] }) {
  if (!orders.length) return <p className="rounded-xl border border-dashed border-[var(--line-strong)] p-8 text-center text-[13px] text-fg-muted">No orders match.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <thead className="bg-white/[0.03] text-[11.5px] uppercase tracking-wide text-fg-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Order</th>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">Words</th>
            <th className="px-4 py-3 font-medium">Price</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {orders.map((o) => (
            <tr key={o.id} className={o.pending_claim ? "bg-warn/[0.04] hover:bg-warn/[0.07]" : "hover:bg-white/[0.02]"}>
              <td className="px-4 py-3">
                <Link href={`/admin/orders/${o.id}`} className="font-mono text-accent hover:underline">#{shortId(o.id)}</Link>
                <p className="max-w-[220px] truncate text-fg-muted">{o.title}</p>
              </td>
              <td className="max-w-[200px] truncate px-4 py-3 text-fg-muted">{o.profiles?.email ?? "—"}</td>
              <td className="px-4 py-3">{serviceLabels[o.service_type]}</td>
              <td className="px-4 py-3 text-fg-muted">{o.word_count?.toLocaleString() ?? "—"}</td>
              <td className="px-4 py-3">{formatHKD(o.price)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  {o.pending_claim && o.status === "awaiting_payment" && <Badge tone="warn" dot>Payment to verify</Badge>}
                  <StatusBadge status={o.status} />
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(o.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
