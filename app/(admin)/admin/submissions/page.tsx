import type { Metadata } from "next";
import Link from "next/link";
import { assertAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDateTime, shortId } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Submissions" };

/** Uploaded documents and recent free scans (metadata only, never text). */
export default async function AdminSubmissions() {
  await assertAdmin();
  const db = createAdminClient();
  const [{ data: files }, { data: scans }] = await Promise.all([
    db.from("order_files").select("id,order_id,file_name,mime_type,file_size,verified,created_at,orders(status,source_deleted_at)").order("created_at", { ascending: false }).limit(200),
    db.from("scan_results").select("id,word_count,overall_risk,analyzer,created_at,profiles(email)").order("created_at", { ascending: false }).limit(50),
  ]);
  type FileRow = { id: string; order_id: string; file_name: string; mime_type: string; file_size: number; verified: boolean; created_at: string; orders: { status: string; source_deleted_at: string | null } | null };
  type ScanRow = { id: string; word_count: number; overall_risk: string; analyzer: string; created_at: string; profiles: { email: string } | null };
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
      <h2 className="mt-8 text-[15px] font-semibold">Uploaded documents</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="bg-white/[0.03] text-[11.5px] uppercase tracking-wide text-fg-subtle">
            <tr><th className="px-4 py-3 font-medium">File</th><th className="px-4 py-3 font-medium">Order</th><th className="px-4 py-3 font-medium">Size</th><th className="px-4 py-3 font-medium">Stored</th><th className="px-4 py-3 font-medium">Uploaded</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {((files ?? []) as unknown as FileRow[]).map((f) => (
              <tr key={f.id}>
                <td className="max-w-[260px] truncate px-4 py-3">{f.file_name}</td>
                <td className="px-4 py-3"><Link className="font-mono text-accent hover:underline" href={`/admin/orders/${f.order_id}`}>#{shortId(f.order_id)}</Link></td>
                <td className="px-4 py-3 text-fg-muted">{formatBytes(f.file_size)}</td>
                <td className="px-4 py-3">{f.orders?.source_deleted_at ? <Badge>Deleted</Badge> : f.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDateTime(f.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 text-[15px] font-semibold">Recent free scans <span className="font-normal text-fg-subtle">· metadata only</span></h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[600px] text-left text-[13px]">
          <thead className="bg-white/[0.03] text-[11.5px] uppercase tracking-wide text-fg-subtle">
            <tr><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Words</th><th className="px-4 py-3 font-medium">Risk</th><th className="px-4 py-3 font-medium">Analyzer</th><th className="px-4 py-3 font-medium">When</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {((scans ?? []) as unknown as ScanRow[]).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{s.profiles?.email ?? "—"}</td>
                <td className="px-4 py-3">{s.word_count}</td>
                <td className="px-4 py-3 capitalize">{s.overall_risk}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-fg-muted">{s.analyzer}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDateTime(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
