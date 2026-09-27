import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retention, uploads } from "@/config/app";
import { audit } from "@/lib/audit";

/**
 * Daily retention job (vercel.json schedules it). Cancels unpaid orders left
 * for `retention.unpaidOrderDays` with no reported payment (deleting their
 * text and uploads), deletes source documents and pasted text N days after an
 * order closes, and reports after their own window. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const day = 86_400_000;
  const sourceCutoff = new Date(Date.now() - retention.sourceDocumentDays * day).toISOString();
  const reportCutoff = new Date(Date.now() - retention.reportDays * day).toISOString();
  const unpaidCutoff = new Date(Date.now() - retention.unpaidOrderDays * day).toISOString();

  // Abandoned unpaid orders: the paste flow stores text before payment, so
  // without this it would never reach a closed status and never be deleted.
  const { data: stale } = await db
    .from("orders")
    .select("id")
    .eq("status", "awaiting_payment")
    .lt("created_at", unpaidCutoff)
    .limit(500);
  let unpaid = 0;
  if (stale?.length) {
    const { data: claimed } = await db
      .from("payment_claims")
      .select("order_id")
      .eq("status", "pending")
      .in("order_id", stale.map((o) => o.id));
    const waiting = new Set((claimed ?? []).map((c) => c.order_id as string));
    for (const o of stale) {
      if (waiting.has(o.id)) continue; // a person still has to check this payment
      const { data: files } = await db.from("order_files").select("storage_path").eq("order_id", o.id);
      if (files?.length) await db.storage.from(uploads.documentsBucket).remove(files.map((f) => f.storage_path));
      const now = new Date().toISOString();
      const { count } = await db
        .from("orders")
        .update({ status: "cancelled", cancelled_at: now, source_deleted_at: now, source_text: null }, { count: "exact" })
        .eq("id", o.id)
        .eq("status", "awaiting_payment");
      if (count) unpaid++;
    }
  }

  const { data: closed } = await db
    .from("orders")
    .select("id,completed_at,cancelled_at")
    .is("source_deleted_at", null)
    .in("status", ["completed", "cancelled"])
    .or(`completed_at.lt.${sourceCutoff},cancelled_at.lt.${sourceCutoff}`)
    .limit(500);

  let sources = 0;
  for (const o of closed ?? []) {
    const { data: files } = await db.from("order_files").select("storage_path").eq("order_id", o.id);
    if (files?.length) {
      await db.storage.from(uploads.documentsBucket).remove(files.map((f) => f.storage_path));
    }
    await db
      .from("orders")
      .update({ source_deleted_at: new Date().toISOString(), source_text: null })
      .eq("id", o.id);
    sources++;
  }

  const { data: oldReports } = await db
    .from("screening_results")
    .select("id,order_id,report_storage_path,orders!inner(completed_at)")
    .not("report_storage_path", "is", null)
    .lt("orders.completed_at", reportCutoff)
    .limit(500);
  let reports = 0;
  for (const r of oldReports ?? []) {
    await db.storage.from(uploads.reportsBucket).remove([r.report_storage_path as string]);
    await db.from("screening_results").update({ report_storage_path: null }).eq("id", r.id);
    reports++;
  }

  // Guest scan counters only matter for the current Hong Kong day.
  const hkToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
  const { count: guestRows } = await db
    .from("guest_scan_usage")
    .delete({ count: "exact" })
    .lt("usage_date", hkToday);

  const summary = { unpaid, sources, reports, guestRows: guestRows ?? 0 };
  if (unpaid || sources || reports || guestRows) await audit("retention_run", { detail: summary });
  return NextResponse.json(summary);
}
