import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWorkerRequest, localModelEnabled } from "@/lib/local-model/jobs";
import { SCAN_FEEDBACK_PROMPT, refinementPrompt } from "@/lib/local-model/prompts";

/**
 * The local-model worker asks for its next job here (tools/local-model-worker).
 * Each call also counts as a heartbeat, which is how the site knows the
 * owner's computer is on. `check: true` only checks in (the worker's --check).
 *
 * The reply carries everything the worker needs: the instructions, the text,
 * which tag to wrap it in, and whether it may be split into chunks. The
 * worker never sees the database, and the text never appears in logs.
 */

const body = z.object({
  model: z.string().trim().max(200).default("unknown"),
  kind: z.enum(["scan_feedback"]).optional(),
  check: z.boolean().optional(),
});

type Claimed = { job_id: string; job_kind: "scan_feedback" | "refinement_draft"; job_order_id: string | null; job_input: string | null };

const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  if (!localModelEnabled()) return NextResponse.json({ error: "The local model isn't enabled on this site." }, { status: 503, headers: noStore });
  if (!isWorkerRequest(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  const { model, kind, check } = parsed.data;

  const db = createAdminClient();
  if (check) {
    const { error } = await db.rpc("touch_model_worker", { p_model: model });
    if (error) return NextResponse.json({ error: "The job tables are missing. Apply migration 0003." }, { status: 500, headers: noStore });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  const { data, error } = await db.rpc("claim_model_job", { p_model: model, p_kind: kind ?? null });
  if (error) return NextResponse.json({ error: "Couldn't read the job queue." }, { status: 500, headers: noStore });
  const job = (data as Claimed[] | null)?.[0];
  if (!job) return NextResponse.json({ job: null }, { headers: noStore });

  const fail = async (reason: string) => {
    await db
      .from("model_jobs")
      .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
      .eq("id", job.job_id);
    return NextResponse.json({ job: null }, { headers: noStore });
  };

  if (job.job_kind === "scan_feedback") {
    if (!job.job_input) return fail("The text was gone before the worker picked it up.");
    return NextResponse.json(
      {
        job: {
          id: job.job_id,
          kind: job.job_kind,
          system: SCAN_FEEDBACK_PROMPT,
          input: job.job_input,
          tag: "draft",
          chunk: false,
          maxTokens: 800,
        },
      },
      { headers: noStore },
    );
  }

  const { data: order } = await db
    .from("orders")
    .select("source_text,instructions")
    .eq("id", job.job_order_id!)
    .maybeSingle<{ source_text: string | null; instructions: string | null }>();
  if (!order?.source_text) return fail("The order's text was deleted before the draft was written.");
  return NextResponse.json(
    {
      job: {
        id: job.job_id,
        kind: job.job_kind,
        system: refinementPrompt(order.instructions),
        input: order.source_text,
        tag: "text",
        chunk: true,
        maxTokens: 4096,
      },
    },
    { headers: noStore },
  );
}
