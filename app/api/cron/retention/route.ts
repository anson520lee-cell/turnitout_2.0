import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retention, uploads } from "@/config/app";
import { audit } from "@/lib/audit";

/**
 * Daily retention job (vercel.json schedules it). Deletes source documents
 * and refinement source text N days after an order closes, and reports after
 * their own window. Protected by CRON_SECRET.
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

  if (sources || reports) await audit("retention_run", { detail: { sources, reports } });
  return NextResponse.json({ sources, reports });
}
