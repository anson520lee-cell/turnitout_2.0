import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, type ReasoningEffort, deepseekRun } from "@/lib/deepseek";
import { chunkText } from "@/lib/chunking";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";

export type PieceResult = { ok: true; pieces: number; ms: number } | { ok: false; message: string };

/** Runs the reviewer on one piece of one sample and keeps the answer (shared by the admin page and the automatic run). */
export async function runChunkPiece(args: { sampleId: string; size: number; idx: number; batch: string; effort?: ReasoningEffort; prompt?: string }): Promise<PieceResult> {
  const { sampleId, size, idx, batch } = args;
  const db = createAdminClient();
  const { data: sample } = await db.from("chunk_samples").select("body").eq("id", sampleId).maybeSingle<{ body: string }>();
  if (!sample) return { ok: false, message: "That sample no longer exists." };
  const pieces = chunkText(sample.body, size);
  const piece = pieces[idx];
  if (!piece) return { ok: false, message: "No such piece." };

  const [saved, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  const prompt = args.prompt ?? saved;
  const effort = args.effort ?? setting.effort;
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
    if (error) return { ok: false, message: "The model answered but the result couldn't be saved." };
    return { ok: true, pieces: pieces.length, ms: result.ms };
  } catch (e) {
    let ms = 0;
    if (e instanceof DeepSeekRunError) {
      ms = e.ms;
      await logModelCall("chunk_test", { ok: false, error: e });
    }
    await db.from("chunk_trials").upsert({ ...row, ok: false, ms }, { onConflict: "sample_id,batch,size,idx" });
    const reason = e instanceof DeepSeekError ? ` (${e.reason})` : "";
    return { ok: false, message: `The model didn't answer${reason}.` };
  }
}
