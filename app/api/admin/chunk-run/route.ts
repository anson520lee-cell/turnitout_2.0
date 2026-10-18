import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, REASONING_EFFORTS, deepseekEnabled, deepseekRun } from "@/lib/deepseek";
import { chunkText } from "@/lib/chunking";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { uuid } from "@/lib/validation/schemas";

/**
 * Chunk-size experiment (admin only): runs the reviewer on one piece of one
 * sample and keeps the answer. A route, not a server action, because server
 * actions run one at a time and the page runs several pieces at once.
 */

export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };
const body = z.object({
  sampleId: uuid,
  size: z.number().int().min(300).max(20_000),
  idx: z.number().int().min(0).max(200),
  batch: z.string().min(1).max(60),
  effort: z.enum(REASONING_EFFORTS).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return NextResponse.json({ ok: false, message: "Not authorised." }, { status: 403, headers: noStore });
  if (!deepseekEnabled()) return NextResponse.json({ ok: false, message: "DEEPSEEK_API_KEY isn't set in Vercel." }, { headers: noStore });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400, headers: noStore });
  const { sampleId, size, idx, batch } = parsed.data;

  const db = createAdminClient();
  const { data: sample } = await db.from("chunk_samples").select("body").eq("id", sampleId).maybeSingle<{ body: string }>();
  if (!sample) return NextResponse.json({ ok: false, message: "That sample no longer exists." }, { headers: noStore });
  const pieces = chunkText(sample.body, size);
  const piece = pieces[idx];
  if (!piece) return NextResponse.json({ ok: false, message: "No such piece." }, { headers: noStore });

  const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  const effort = parsed.data.effort ?? setting.effort;
  const row = { sample_id: sampleId, batch, size, idx, first_sentence: piece.first, chunk: piece.text, model: setting.model, effort };
  try {
    const result = await deepseekRun({
      system: [prompt, DRAFT_GUARD].join("\n\n"),
      user: ["<draft>", piece.text, "</draft>"].join("\n"),
      maxTokens: 24_000,
      model: setting.model,
      effort,
      timeoutMs: 100_000,
    });
    await logModelCall("chunk_test", { ok: true, result });
    const { error } = await db.from("chunk_trials").upsert(
      { ...row, model: result.model, effort: result.effort, report: result.text, ok: true, truncated: result.truncated, ms: result.ms, tokens: result.usage.promptTokens + result.usage.completionTokens },
      { onConflict: "sample_id,batch,size,idx" },
    );
    if (error) return NextResponse.json({ ok: false, message: "The model answered but the result couldn't be saved." }, { headers: noStore });
    return NextResponse.json({ ok: true, pieces: pieces.length, ms: result.ms }, { headers: noStore });
  } catch (e) {
    let ms = 0;
    if (e instanceof DeepSeekRunError) {
      ms = e.ms;
      await logModelCall("chunk_test", { ok: false, error: e });
    }
    await db.from("chunk_trials").upsert({ ...row, ok: false, ms }, { onConflict: "sample_id,batch,size,idx" });
    const reason = e instanceof DeepSeekError ? ` (${e.reason})` : "";
    return NextResponse.json({ ok: false, message: `The model didn't answer${reason}.` }, { headers: noStore });
  }
}
