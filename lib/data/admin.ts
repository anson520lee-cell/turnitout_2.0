import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/auth/session";
import type {
  AdminNote,
  Order,
  OrderFile,
  PaymentClaim,
  PaymentRow,
  Profile,
  RefinementResultRow,
  ScreeningResultRow,
} from "@/types/domain";

export type PendingClaimSummary = Pick<PaymentClaim, "id" | "method" | "amount" | "created_at">;

export type AdminOrder = Order & {
  profiles: Pick<Profile, "email" | "display_name"> | null;
  /** Set when the customer has reported a manual payment that nobody has checked yet. */
  pending_claim?: PendingClaimSummary | null;
};

/** Every function asserts the admin role before using the service-role client. */

export async function adminMetrics() {
  await assertAdmin();
  const db = createAdminClient();
  // Hong Kong has no DST, so midnight HKT is always UTC+8.
  const hkDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
  const todayIso = new Date(`${hkDate}T00:00:00+08:00`).toISOString();

  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [users, orders, ordersToday, queued, inScreening, completed, payments, scansToday, guestScansToday, claimsPending] = await Promise.all([
    count(db.from("profiles").select("id", { count: "exact", head: true })),
    count(db.from("orders").select("id", { count: "exact", head: true })),
    count(db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", todayIso)),
    count(db.from("orders").select("id", { count: "exact", head: true }).in("status", ["paid", "queued"])),
    count(db.from("orders").select("id", { count: "exact", head: true }).in("status", ["screening", "under_review", "processing", "report_ready"])),
    count(db.from("orders").select("id", { count: "exact", head: true }).eq("status", "completed")),
    db.from("payments").select("amount,provider").eq("status", "succeeded"),
    db.from("scan_usage").select("scan_count").eq("usage_date", hkDate),
    db.from("guest_scan_usage").select("scan_count").eq("usage_date", hkDate),
    count(db.from("payment_claims").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  const revenue = (payments.data ?? []).filter((p) => p.provider !== "dev").reduce((s, p) => s + p.amount, 0);
  const sum = (rows: { scan_count: number }[] | null) => (rows ?? []).reduce((s, r) => s + r.scan_count, 0);
  const scans = sum(scansToday.data);
  const guestScans = sum(guestScansToday.data);
  return { users, orders, ordersToday, queued, inScreening, completed, revenue, scans, guestScans, claimsPending };
}

export async function adminOrders(limit = 500): Promise<AdminOrder[]> {
  await assertAdmin();
  const db = createAdminClient();
  const [{ data }, { data: claims }] = await Promise.all([
    db
      .from("orders")
      .select("*, profiles(email,display_name)")
      .order("created_at", { ascending: false })
      .limit(limit),
    db.from("payment_claims").select("id,order_id,method,amount,created_at").eq("status", "pending"),
  ]);
  const pending = new Map<string, PendingClaimSummary>();
  for (const c of (claims ?? []) as (PendingClaimSummary & { order_id: string })[]) {
    pending.set(c.order_id, { id: c.id, method: c.method, amount: c.amount, created_at: c.created_at });
  }
  return ((data ?? []) as AdminOrder[]).map((o) => ({ ...o, pending_claim: pending.get(o.id) ?? null }));
}

export async function adminOrderBundle(id: string) {
  await assertAdmin();
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*, profiles(email,display_name)").eq("id", id).maybeSingle<AdminOrder>();
  if (!order) return null;
  const [files, screening, refinement, payments, notes, events, claims] = await Promise.all([
    db.from("order_files").select("*").eq("order_id", id),
    db.from("screening_results").select("*").eq("order_id", id).maybeSingle<ScreeningResultRow>(),
    db.from("refinement_results").select("*").eq("order_id", id).maybeSingle<RefinementResultRow>(),
    db.from("payments").select("*").eq("order_id", id).order("created_at"),
    db.from("admin_notes").select("*").eq("order_id", id).order("created_at"),
    db.from("audit_events").select("id,event,detail,created_at,actor_id").eq("order_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("payment_claims").select("*").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  return {
    order,
    file: ((files.data ?? []) as OrderFile[])[0] ?? null,
    screening: screening.data,
    refinement: refinement.data,
    payments: (payments.data ?? []) as PaymentRow[],
    notes: (notes.data ?? []) as AdminNote[],
    /** Newest first. */
    claims: (claims.data ?? []) as PaymentClaim[],
    events: (events.data ?? []) as { id: number; event: string; detail: Record<string, unknown>; created_at: string }[],
  };
}
