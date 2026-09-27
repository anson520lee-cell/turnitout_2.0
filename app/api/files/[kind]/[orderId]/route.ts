import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedUrl } from "@/lib/storage/files";
import { uuid } from "@/lib/validation/schemas";
import { uploads } from "@/config/app";
import { audit } from "@/lib/audit";

/**
 * Issues a 60-second signed URL after checking access, then redirects to it.
 *   /api/files/report/:orderId   customer (order completed) or admin
 *   /api/files/source/:orderId   admin only
 * Add ?download=1 to force a download.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/files/[kind]/[orderId]">,
) {
  const { kind, orderId } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  if (!uuid.safeParse(orderId).success || (kind !== "report" && kind !== "source")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const isAdmin = user.profile.role === "admin";
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("id,user_id,status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";

  if (kind === "source") {
    if (!isAdmin) return new NextResponse("Forbidden", { status: 403 });
    const { data: file } = await db
      .from("order_files")
      .select("storage_path,file_name")
      .eq("order_id", order.id)
      .maybeSingle();
    if (!file) return new NextResponse("File unavailable", { status: 404 });
    const url = await signedUrl(uploads.documentsBucket, file.storage_path, { download: download ? file.file_name : false });
    if (!url) return new NextResponse("File unavailable (it may have been deleted under the retention policy)", { status: 410 });
    await audit("source_downloaded", { actorId: user.id, orderId: order.id });
    return NextResponse.redirect(url);
  }

  const owns = order.user_id === user.id && order.status === "completed";
  if (!owns && !isAdmin) return new NextResponse("Not found", { status: 404 });
  const { data: res } = await db
    .from("screening_results")
    .select("report_storage_path,report_file_name")
    .eq("order_id", order.id)
    .maybeSingle();
  if (!res?.report_storage_path) return new NextResponse("No report file for this order", { status: 404 });
  const url = await signedUrl(uploads.reportsBucket, res.report_storage_path, {
    download: download ? res.report_file_name ?? "report" : false,
  });
  if (!url) return new NextResponse("Report unavailable", { status: 410 });
  await audit(download ? "report_downloaded" : "report_opened", { actorId: user.id, orderId: order.id });
  return NextResponse.redirect(url);
}
