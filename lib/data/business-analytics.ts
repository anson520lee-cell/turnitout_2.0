import "server-only";
import { unstable_cache } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPayFirstTopupMethod } from "@/config/payments";
import { NOT_MONEY_PROVIDERS } from "@/lib/payments/revenue";
import { periodStart, summarize, type Period, type Receipt, type Use } from "@/lib/analytics/business";

type Result<T> = { data: T[] | null; error: { message: string } | null };
async function pages<T>(firstId: string, read: (after: string) => PromiseLike<Result<T & { id: string | number }>>) {
  const rows: T[] = [];
  let cursor = firstId;
  for (;;) {
    const { data, error } = await read(cursor);
    if (error || !data) throw new Error("Could not load business analytics", { cause: error?.message });
    rows.push(...data);
    if (data.length < 500) return rows;
    cursor = String(data[data.length - 1].id);
  }
}
type Order = { user_id: string; service_type: string; price: number; paid_at: string; status: string;
  payments: { provider: string; status: string }[]; audit_events: { chars: string | null }[] };
type Rewrite = { created_at: string; credits: string | null; orders: { user_id: string } };
type Payment = { amount: number; provider: string; provider_payment_id: string; created_at: string;
  orders: { status: string; credit_transactions: { kind: string }[] } };
type Topup = { usd: number; method: string; reviewed_by: string | null; created_at: string };

const load = unstable_cache(async (period: Period, day: string) => {
  const now = Date.now();
  const start = periodStart(period, Date.parse(day + "T12:00:00+08:00"));
  const since = new Date(start ?? 0).toISOString();
  const until = new Date(now).toISOString();
  const firstUuid = "00000000-0000-0000-0000-000000000000";
  const db = createAdminClient();
  const [orders, rewrites, payments, topups] = await Promise.all([
    pages<Order>(firstUuid, after => db.from("orders")
      .select("id,user_id,service_type,price,paid_at,status,profiles!inner(role),payments(provider,status),audit_events(chars:detail->>chars)")
      .neq("profiles.role", "admin").eq("audit_events.event", "order_created")
      .gte("paid_at", since).lte("paid_at", until).neq("status", "cancelled").gt("id", after).order("id").limit(500).returns<(Order & { id: string })[]>()),
    pages<Rewrite>("0", after => db.from("audit_events")
      .select("id,created_at,credits:detail->>credits,orders!inner(user_id,profiles!inner(role))")
      .eq("event", "report_rewrite_made").neq("orders.profiles.role", "admin")
      .gte("created_at", since).lte("created_at", until).gt("id", after).order("id").limit(500).returns<(Rewrite & { id: number })[]>()),
    pages<Payment>(firstUuid, after => db.from("payments")
      .select("id,amount,provider,provider_payment_id,created_at,orders!inner(status,credit_transactions(kind))")
      .eq("status", "succeeded").not("provider", "in", `(${NOT_MONEY_PROVIDERS.join(",")})`)
      .eq("orders.credit_transactions.kind", "refund").gte("created_at", since).lte("created_at", until)
      .gt("id", after).order("id").limit(500).returns<(Payment & { id: string })[]>()),
    pages<Topup>(firstUuid, after => db.from("credit_topups").select("id,usd,method,reviewed_by,created_at")
      .eq("status", "confirmed").gte("created_at", since).lte("created_at", until).gt("id", after).order("id").limit(500).returns<(Topup & { id: string })[]>()),
  ]);
  const ids = [...new Set(payments.map(p => p.provider_payment_id).filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
  const claimStatus = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("payment_claims").select("id,status").in("id", ids.slice(i, i + 100));
    if (error) throw new Error("Could not verify payment claims", { cause: error.message });
    for (const claim of data ?? []) claimStatus.set(claim.id, claim.status);
  }
  const uses: Use[] = [];
  for (const o of orders) {
    const paid = o.payments.filter(p => p.status === "succeeded");
    if (!paid.some(p => p.provider !== "dev" && p.provider !== "admin_free")) continue;
    const labels: Record<string, string> = { refinement: "Writing Refinement", ai_screening: "AI screening (legacy)", similarity_screening: "Similarity screening (legacy)" };
    const free = o.price === 0 || paid.some(p => p.provider === "free_daily");
    uses.push({ user: o.user_id, product: labels[o.service_type] ?? (free ? "Daily free report" : "Paid report"),
      at: o.paid_at, bought: !free, completed: o.status === "completed",
      chars: Number(o.audit_events.find(e => Number(e.chars) > 0)?.chars) });
  }
  for (const r of rewrites) uses.push({ user: r.orders.user_id, product: "Writing Refinement",
    at: r.created_at, bought: Number(r.credits) > 0, completed: true });
  const receipts: Receipt[] = topups.map(t => ({ at: t.created_at, topup: { usd: t.usd,
    unchecked: isPayFirstTopupMethod(t.method) && !t.reviewed_by } }));
  for (const p of payments) receipts.push({ at: p.created_at, payment: { provider: p.provider, amount: p.amount,
    orderStatus: p.orders.status, claimStatus: claimStatus.get(p.provider_payment_id),
    refundedToCredits: p.orders.credit_transactions.length > 0 } });
  return summarize(uses, receipts, period, now);
}, ["admin-business-v1"], { revalidate: 120 });

export async function businessAnalytics(period: Period) {
  await requireAdmin();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
  return load(period, day);
}
