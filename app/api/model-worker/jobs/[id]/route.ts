import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWorkerRequest, localModelEnabled } from "@/lib/local-model/jobs";
import { audit } from "@/lib/audit";
import { notifyOwner } from "@/lib/notify";
import { uuid } from "@/lib/validation/schemas";
import { shortId } from "@/lib/utils";
import { localModel } from "@/config/app";

/**
 * The worker reports on a job it claimed from /api/model-worker/next:
 * `{ progress: true }` while a long draft is still being written (keeps its
 * claim alive), `{ ok: true, output }` when done, `{ ok: false, error }` when
 * the model failed. Only a running job can be reported on.
 */

const body = z.union([
  z.object({ progress: z.literal(true), model: z.string().trim().max(200).optional() }),
  z.object({ ok: z.literal(true), output: z.string() }),
  z.object({ ok: z.literal(false), error: z.string().max(2000) }),
]);

const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest, ctx: RouteContext<"/api/model-worker/jobs/[id]">) {
  if (!localModelEnabled()) return NextResponse.json({ error: "The local model isn't enabled on this site." }, { status: 503, headers: noStore });
  if (!isWorkerRequest(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  const report = parsed.data;

  const db = createAdminClient();
  const { data: job } = await db
    .from("model_jobs")
    .select("id,kind,status,order_id")
    .eq("id", id)
    .maybeSingle<{ id: string; kind: "scan_feedback" | "refinement_draft"; status: string; order_id: string | null }>();
  // Gone: scan feedback expired (the visitor's window passed) or the draft was replaced.
  if (!job || job.status !== "running") return NextResponse.json({ error: "This job is no longer open." }, { status: 409, headers: noStore });
  const now = new Date().toISOString();

  if ("progress" in report) {
    await db.from("model_jobs").update({ claimed_at: now }).eq("id", id).eq("status", "running");
    if (report.model) await db.rpc("touch_model_worker", { p_model: report.model });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  if (!report.ok) {
    await db
      .from("model_jobs")
      .update({ status: "failed", error: report.error.slice(0, 300) || "The model failed.", finished_at: now })
      .eq("id", id)
      .eq("status", "running");
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  const output = report.output.trim();
  const max = job.kind === "scan_feedback" ? localModel.maxFeedbackChars : localModel.maxDraftChars;
  if (!output || output.length > max) {
    await db
      .from("model_jobs")
      .update({ status: "failed", error: output ? `The model returned more than ${max} characters.` : "The model returned nothing.", finished_at: now })
      .eq("id", id)
      .eq("status", "running");
    return NextResponse.json({ error: "Output rejected" }, { status: 422, headers: noStore });
  }

  const { data: saved } = await db
    .from("model_jobs")
    .update({ status: "done", output_text: output, error: null, finished_at: now })
    .eq("id", id)
    .eq("status", "running")
    .select("id");
  if (!saved?.length) return NextResponse.json({ error: "This job is no longer open." }, { status: 409, headers: noStore });

  if (job.kind === "refinement_draft" && job.order_id) {
    // Counts only: the draft itself stays on the admin page.
    await audit("model_draft_ready", { orderId: job.order_id, detail: { chars: output.length } });
    notifyOwner("draft_ready", { order: shortId(job.order_id), characters: output.length });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
