import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsers() {
  await assertAdmin();
  const db = createAdminClient();
  const [{ data: profiles }, { data: orders }] = await Promise.all([
    db.from("profiles").select("id,email,display_name,role,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("orders").select("user_id,status"),
  ]);
  const counts = new Map<string, number>();
  (orders ?? []).forEach((o) => counts.set(o.user_id, (counts.get(o.user_id) ?? 0) + 1));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Roles are changed in the database only (see README). The app never trusts a role from the browser.</p>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-white/[0.03] text-[11.5px] uppercase tracking-wide text-fg-subtle">
            <tr><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Orders</th><th className="px-4 py-3 font-medium">Joined</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(profiles ?? []).map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">{p.email}</td>
                <td className="px-4 py-3 text-fg-muted">{p.display_name ?? "—"}</td>
                <td className="px-4 py-3">{p.role === "admin" ? <Badge tone="progress">admin</Badge> : <span className="text-fg-muted">user</span>}</td>
                <td className="px-4 py-3">{counts.get(p.id) ?? 0}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
