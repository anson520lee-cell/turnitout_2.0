import type { Metadata } from "next";
import Link from "next/link";
import { adminActivity, type ActivityKind } from "@/lib/data/admin";
import { ActivityText } from "@/components/admin/activity-text";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCredits } from "@/config/pricing";
import { ORDER_STATUSES, statusMeta } from "@/lib/orders/status";
import { Badge, type Tone } from "@/components/ui/badge";
import { formatDateTime, shortId } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Activity" };

const kinds: Record<ActivityKind, string> = {
  free_scan: "Free scan",
  free_report: "Free report",
  paid_report: "Paid report",
  refinement: "Refinement",
};
const levelTone: Record<string, Tone> = { low: "success", moderate: "warn", elevated: "danger" };

/** Every free scan and every order (free report, paid report, refinement, with its uploaded file) in one table, with filters. This replaces the separate Orders and Submissions lists. */
export default async function AdminActivity({ searchParams }: PageProps<"/admin/activity">) {
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && (sp.kind in kinds || sp.kind === "orders") ? (sp.kind as ActivityKind | "orders") : "";
  const level = typeof sp.level === "string" ? sp.level : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().replace(/^#/, "") : "";
  const all = await adminActivity(1000);
  const rows = all.filter(
    (r) =>
      (!kind || (kind === "orders" ? r.orderId !== null : r.kind === kind)) &&
      (!level || r.level === level) &&
      (!status || r.status === status) &&
      (!q || (r.email ?? "").toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q) || (r.orderId ?? "").toLowerCase().startsWith(q)),
  );
  const count = (k: ActivityKind) => all.filter((r) => r.kind === k).length;
  const select = "h-10 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[13px] text-fg";
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-2 max-w-3xl text-[13px] text-fg-muted">
        Free scans, free reports, paid reports and refinements together, newest first (this page replaces the old Orders and Submissions lists). Free scans made without an account are not stored, so they are not listed, and a free scan&rsquo;s text is never stored.
        An order&rsquo;s text can be opened here while it is still kept ({count("free_report") + count("paid_report") + count("refinement")} orders); each view is logged.
      </p>
      <form className="mt-6 flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Email, order ID or title" className={`${select} w-64`} />
        <label className="sr-only" htmlFor="kind">Type</label>
        <select id="kind" name="kind" defaultValue={kind} className={select}>
          <option value="">All types</option>
          <option value="orders">Only orders (all kinds)</option>
          <option value="free_scan">Only free scan ({count("free_scan")})</option>
          <option value="free_report">Only free report ({count("free_report")})</option>
          <option value="paid_report">Only paid report ({count("paid_report")})</option>
          <option value="refinement">Only refinement ({count("refinement")})</option>
        </select>
        <label className="sr-only" htmlFor="status">Order status</label>
        <select id="status" name="status" defaultValue={status} className={select}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}
        </select>
        <label className="sr-only" htmlFor="level">Level</label>
        <select id="level" name="level" defaultValue={level} className={select}>
          <option value="">All levels</option>
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="elevated">Elevated</option>
        </select>
        <button className="h-10 rounded-xl bg-accent px-4 text-[13px] font-medium text-white">Filter</button>
      </form>
      <p className="mt-4 text-[12.5px] text-fg-subtle">{rows.length} shown of {all.length}</p>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[1120px] text-left text-[13px]">
          <thead className="bg-white/[0.03] text-[11.5px] uppercase tracking-wide text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Words</th>
              <th className="px-4 py-3 font-medium">AI rate</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium">Text</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] align-top">
            {rows.map((r) => (
              <tr key={r.key} className={r.paymentToVerify ? "bg-warn/[0.04] hover:bg-warn/[0.07]" : "hover:bg-white/[0.02]"}>
                <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(r.at)}</td>
                <td className="px-4 py-3">
                  {kinds[r.kind]}
                  {r.orderId && (
                    <Link href={`/admin/orders/${r.orderId}`} className="ml-2 font-mono text-[12px] text-accent hover:underline">#{shortId(r.orderId)}</Link>
                  )}
                  {r.title && <p className="max-w-[220px] truncate text-fg-muted">{r.title}</p>}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-fg-muted">{r.email ?? "—"}</td>
                <td className="px-4 py-3 text-fg-muted">{r.words?.toLocaleString() ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.score !== null ? `${r.score}%` : r.range ? `${r.range}% (range)` : "—"}
                </td>
                <td className="px-4 py-3">{r.level ? <Badge tone={levelTone[r.level]} dot className="capitalize">{r.level}</Badge> : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{r.price === null ? "—" : formatCredits(r.price)}</td>
                <td className="px-4 py-3">
                  {r.status ? (
                    <div className="flex flex-col items-start gap-1">
                      {r.paymentToVerify && <Badge tone="warn" dot>Payment to verify</Badge>}
                      <StatusBadge status={r.status} />
                    </div>
                  ) : "—"}
                </td>
                <td className="max-w-[340px] px-4 py-3 text-[12.5px] text-fg-muted">
                  {r.detail.map((d) => <p key={d}>{d}</p>)}
                </td>
                <td className="px-4 py-3">
                  {r.orderId && r.hasText ? <ActivityText orderId={r.orderId} fileBase={`order-${shortId(r.orderId)}`} /> : <span className="text-fg-subtle">{r.orderId ? "Deleted" : "Not stored"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
