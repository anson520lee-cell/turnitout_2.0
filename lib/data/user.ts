import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AutoReportResult } from "@/lib/auto-report/stitch";
import type { ReportRewrite } from "@/lib/auto-report/rewrite";
import type {
  Order,
  OrderFile,
  PaymentClaim,
  PaymentRow,
  RefinementResultRow,
  ScreeningResultRow,
} from "@/types/domain";

/** All reads here use the user's session, so RLS decides what comes back. */

export async function listOrders(limit = 50): Promise<Order[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Order[];
}

/** Order ids that have a payment claim waiting for the admin to check. */
export async function listPendingClaimOrderIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("payment_claims").select("order_id").eq("status", "pending");
  return new Set((data ?? []).map((c: { order_id: string }) => c.order_id));
}

export async function getOrderBundle(id: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order) return null;
  const [files, screening, refinement, payments, claims] = await Promise.all([
    supabase.from("order_files").select("*").eq("order_id", id),
    supabase.from("screening_results").select("*").eq("order_id", id).maybeSingle<ScreeningResultRow>(),
    supabase.from("refinement_results").select("*").eq("order_id", id).maybeSingle<RefinementResultRow>(),
    supabase.from("payments").select("*").eq("order_id", id).order("created_at"),
    supabase.from("payment_claims").select("*").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  return {
    order,
    file: ((files.data ?? []) as OrderFile[])[0] ?? null,
    screening: screening.data ?? null,
    refinement: refinement.data ?? null,
    payments: (payments.data ?? []) as PaymentRow[],
    /** Newest first. */
    claims: (claims.data ?? []) as PaymentClaim[],
  };
}

/**
 * The automatic report of an order, or null when the order has none (older orders were made by hand).
 * The page checks the viewer owns the order before calling this.
 */
export async function getAutoReport(orderId: string): Promise<{ status: "running" | "done" | "failed"; result: AutoReportResult | null; updatedAt: string } | null> {
  const { data } = await createAdminClient()
    .from("auto_reports")
    .select("status,result,updated_at")
    .eq("order_id", orderId)
    .maybeSingle<{ status: "running" | "done" | "failed"; result: AutoReportResult | null; updated_at: string }>();
  return data ? { status: data.status, result: data.result, updatedAt: data.updated_at } : null;
}

/**
 * The saved suggested rewrites of a report, or null when the rewrite column doesn't exist yet (migration 0023 not
 * applied): the report page then simply doesn't offer rewrites, instead of failing. `saved` is null until they are made.
 */
export async function getReportRewrite(orderId: string): Promise<{ saved: ReportRewrite | null } | null> {
  const { data, error } = await createAdminClient().from("auto_reports").select("rewrite").eq("order_id", orderId).maybeSingle<{ rewrite: ReportRewrite | null }>();
  return error ? null : { saved: data?.rewrite ?? null };
}
