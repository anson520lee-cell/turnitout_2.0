import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderFile, RefinementResultRow, ScanResultRow, ScreeningResultRow, PaymentRow } from "@/types/domain";

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

export async function listScans(limit = 5): Promise<ScanResultRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scan_results")
    .select("id,user_id,word_count,overall_risk,result_json,analyzer,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ScanResultRow[];
}

export async function getOrderBundle(id: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order) return null;
  const [files, screening, refinement, payments] = await Promise.all([
    supabase.from("order_files").select("*").eq("order_id", id),
    supabase.from("screening_results").select("*").eq("order_id", id).maybeSingle<ScreeningResultRow>(),
    supabase.from("refinement_results").select("*").eq("order_id", id).maybeSingle<RefinementResultRow>(),
    supabase.from("payments").select("*").eq("order_id", id).order("created_at"),
  ]);
  return {
    order,
    file: ((files.data ?? []) as OrderFile[])[0] ?? null,
    screening: screening.data ?? null,
    refinement: refinement.data ?? null,
    payments: (payments.data ?? []) as PaymentRow[],
  };
}
