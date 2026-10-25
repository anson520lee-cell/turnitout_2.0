import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBytes } from "@/lib/utils";
import { assertAdmin } from "@/lib/auth/session";
import { reportScore, type AutoReportResult } from "@/lib/auto-report/stitch";
import type { OrderStatus } from "@/lib/orders/status";
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
  const [users, orders, ordersToday, queued, inScreening, completed, payments, claimsPending] = await Promise.all([
    count(db.from("profiles").select("id", { count: "exact", head: true })),
    count(db.from("orders").select("id", { count: "exact", head: true })),
    count(db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", todayIso)),
    count(db.from("orders").select("id", { count: "exact", head: true }).in("status", ["paid", "queued"])),
    count(db.from("orders").select("id", { count: "exact", head: true }).in("status", ["screening", "under_review", "processing", "report_ready"])),
    count(db.from("orders").select("id", { count: "exact", head: true }).eq("status", "completed")),
    db.from("payments").select("amount,provider").eq("status", "succeeded"),
    count(db.from("payment_claims").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  const revenue = (payments.data ?? []).filter((p) => p.provider !== "dev" && p.provider !== "admin_free" && p.provider !== "free_daily").reduce((s, p) => s + p.amount, 0);
  return { users, orders, ordersToday, queued, inScreening, completed, revenue, claimsPending };
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
  const [files, screening, refinement, payments, notes, events, claims, auto] = await Promise.all([
    db.from("order_files").select("*").eq("order_id", id),
    db.from("screening_results").select("*").eq("order_id", id).maybeSingle<ScreeningResultRow>(),
    db.from("refinement_results").select("*").eq("order_id", id).maybeSingle<RefinementResultRow>(),
    db.from("payments").select("*").eq("order_id", id).order("created_at"),
    db.from("admin_notes").select("*").eq("order_id", id).order("created_at"),
    db.from("audit_events").select("id,event,detail,created_at,actor_id").eq("order_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("payment_claims").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("auto_reports").select("status,total_pieces,error,updated_at,result").eq("order_id", id).maybeSingle(),
  ]);
  const autoRow = auto.data as { status: "running" | "done" | "failed"; total_pieces: number; error: string | null; updated_at: string; result: AutoReportResult | null } | null;
  return {
    order,
    /** The automatic report of this order; null for older hand-made reports and other services. */
    auto: autoRow ? { status: autoRow.status, totalPieces: autoRow.total_pieces, error: autoRow.error, updatedAt: autoRow.updated_at, summary: autoRow.result?.summary ?? null } : null,
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

export type ActivityKind = "free_report" | "paid_report" | "refinement";

export interface ActivityRow {
  key: string;
  at: string;
  kind: ActivityKind;
  email: string | null;
  words: number | null;
  /** Exact AI score (0 to 100) for reports. */
  score: number | null;
  level: "low" | "moderate" | "elevated" | null;
  /** Everything else worth reading, as short "name: value" parts. */
  detail: string[];
  /** Set for orders: their id (opens the order, and the text can be fetched while it is still kept). */
  orderId: string | null;
  /** True while the submitted text is still stored. */
  hasText: boolean;
  status: OrderStatus | null;
  title: string | null;
  /** Credits charged (orders only). */
  price: number | null;
  /** A reported payment nobody has checked yet. */
  paymentToVerify: boolean;
}

type ActivityOrder = {
  id: string;
  service_type: string;
  price: number;
  status: OrderStatus;
  title: string;
  word_count: number | null;
  created_at: string;
  source_text: string | null;
  profiles: { email: string } | null;
  order_files: { file_name: string; file_size: number; verified: boolean }[] | null;
  auto_reports: { status: string; summary: AutoReportResult["summary"] | null } | { status: string; summary: AutoReportResult["summary"] | null }[] | null;
};

/**
 * Every free report, paid report and refinement in one list, newest first. Metadata only:
 * no text and no report content leave this function (the text is fetched one order at a time, by
 * viewOrderText, and each view is logged).
 */
export async function adminActivity(limit = 1000): Promise<ActivityRow[]> {
  await assertAdmin();
  const db = createAdminClient();
  const [{ data: orders }, { data: claims }] = await Promise.all([
    db
      .from("orders")
      // `summary` is only the counts; the report body (which quotes the text) is never selected.
      .select("id,service_type,price,status,title,word_count,created_at,source_text,profiles(email),order_files(file_name,file_size,verified),auto_reports(status,summary:result->summary)")
      .order("created_at", { ascending: false })
      .limit(limit),
    db.from("payment_claims").select("order_id").eq("status", "pending"),
  ]);
  const toVerify = new Set(((claims ?? []) as { order_id: string }[]).map((c) => c.order_id));
  const rows: ActivityRow[] = [];
  for (const o of (orders ?? []) as unknown as ActivityOrder[]) {
    const auto = Array.isArray(o.auto_reports) ? o.auto_reports[0] : o.auto_reports;
    const sum = auto?.summary ?? null;
    const kind: ActivityKind = o.service_type === "refinement" ? "refinement" : o.price === 0 ? "free_report" : "paid_report";
    rows.push({
      key: `order-${o.id}`,
      at: o.created_at,
      kind,
      email: o.profiles?.email ?? null,
      words: sum?.words ?? o.word_count,
      score: sum ? Math.round(reportScore(sum) * 100) : null,
      level: sum?.overall ?? null,
      detail: sum
        ? [
            `${sum.high} high, ${sum.medium} medium, ${sum.uncertain} uncertain of ${sum.sentences} sentences`,
            `flagged ${Math.round(sum.flaggedShare * 100)}%`,
            `${sum.riskyParagraphs} of ${sum.paragraphs} paragraphs risky`,
            ...(auto && auto.status !== "done" ? [`report ${auto.status}`] : []),
          ]
        : auto
          ? [`report ${auto.status}`]
          : [],
      orderId: o.id,
      hasText: Boolean(o.source_text),
      status: o.status,
      title: o.title,
      price: o.price,
      paymentToVerify: toVerify.has(o.id) && o.status === "awaiting_payment",
    });
    for (const f of o.order_files ?? []) {
      rows[rows.length - 1].detail.push(`file: ${f.file_name} (${formatBytes(f.file_size)}, ${f.verified ? "verified" : "unverified"})`);
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
