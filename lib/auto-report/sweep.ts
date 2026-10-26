import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceAutoReport, type ReportState } from "./run";

/*
 * A report is normally moved forward by its order page while the customer has it
 * open. A report that started with nobody watching (the customer closed the page,
 * or the admin confirmed a payment hours later) would otherwise wait until the
 * customer comes back. The database scheduler calls the background runner every
 * minute (app/api/cron/chunk-queue), and it first moves on the oldest such report.
 */

/** How long a report must sit untouched before the background runner takes it over. */
const IDLE_MS = 90_000;

/** Advances the oldest paid report nobody is moving forward. Returns null when there is none. */
export async function advanceIdleReport(): Promise<{ orderId: string; state: ReportState } | null> {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - IDLE_MS).toISOString();
  const { data: orders } = await db
    .from("orders")
    .select("id,updated_at")
    .in("status", ["paid", "queued", "screening"])
    .neq("service_type", "refinement")
    .not("source_text", "is", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(10)
    .returns<{ id: string; updated_at: string }[]>();
  if (!orders?.length) return null;
  const { data: reports } = await db
    .from("auto_reports")
    .select("order_id,status,updated_at,lease_until")
    .in("order_id", orders.map((o) => o.id))
    .returns<{ order_id: string; status: string; updated_at: string; lease_until: string | null }[]>();
  const byOrder = new Map((reports ?? []).map((r) => [r.order_id, r]));
  const now = new Date().toISOString();
  const idle = orders.find((o) => {
    const r = byOrder.get(o.id);
    if (!r) return true; // paid, report not started yet
    return r.status === "running" && r.updated_at < cutoff && (!r.lease_until || r.lease_until < now);
  });
  if (!idle) return null;
  return { orderId: idle.id, state: await advanceAutoReport(idle.id) };
}
