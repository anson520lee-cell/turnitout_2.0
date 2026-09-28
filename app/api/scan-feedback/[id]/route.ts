import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localModelEnabled } from "@/lib/local-model/jobs";
import type { ScanFeedbackStatus } from "@/lib/local-model/types";
import { uuid } from "@/lib/validation/schemas";

/**
 * The scan page polls here for the model's written feedback on a free scan.
 * The job id (random, returned only to the browser that ran the scan) is the
 * key. Feedback is handed over once and then deleted, as is a failure.
 */

const noStore = { "cache-control": "no-store" };
const reply = (v: ScanFeedbackStatus) => NextResponse.json(v, { headers: noStore });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/scan-feedback/[id]">) {
  const { id } = await ctx.params;
  if (!localModelEnabled() || !uuid.safeParse(id).success) return reply({ status: "unavailable" });
  const db = createAdminClient();
  const { data: job } = await db
    .from("model_jobs")
    .select("status,expires_at")
    .eq("id", id)
    .eq("kind", "scan_feedback")
    .maybeSingle<{ status: "queued" | "running" | "done" | "failed"; expires_at: string }>();
  if (!job) return reply({ status: "unavailable" });

  if (job.status === "queued" || job.status === "running") {
    if (new Date(job.expires_at).getTime() > Date.now()) return reply({ status: job.status });
    await db.from("model_jobs").delete().eq("id", id).eq("kind", "scan_feedback");
    return reply({ status: "unavailable" });
  }

  // Deleting and reading in one statement: a second poll finds nothing.
  const { data: taken } = await db
    .from("model_jobs")
    .delete()
    .eq("id", id)
    .eq("kind", "scan_feedback")
    .select("status,output_text");
  const row = (taken as { status: string; output_text: string | null }[] | null)?.[0];
  if (row?.status === "done" && row.output_text) return reply({ status: "done", feedback: row.output_text });
  return reply({ status: "unavailable" });
}
