"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, REASONING_EFFORTS, deepseekEnabled, deepseekRun } from "@/lib/deepseek";
import { scoreReport, truthFromFlaggedLines, type Metrics, type TruthSentence } from "@/lib/eval";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt, getScanReportSetting } from "@/lib/site-settings";
import { uuid } from "@/lib/validation/schemas";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const caseInput = z.object({
  name: z.string().trim().min(1, "Give the case a name.").max(120),
  body: z.string().trim().min(200, "The essay text is too short to test with.").max(8000, "The essay text is limited to 8,000 characters."),
  flagged: z.string().max(20_000),
  note: z.string().trim().max(500).optional(),
});

/**
 * Adds a test case: an essay and the sentences Turnitin flagged in it (pasted
 * one per line). Returns how many sentences matched, and any pasted lines that
 * matched nothing, so a wrong paste is noticed.
 */
export async function addEvalCase(input: unknown): Promise<Result<{ sentences: number; flagged: number; unmatched: string[] }>> {
  const admin = await assertAdmin();
  const parsed = caseInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid case." };
  const { truth, unmatched } = truthFromFlaggedLines(parsed.data.body, parsed.data.flagged);
  const flagged = truth.filter((t) => t.flagged).length;
  if (flagged === 0) return { ok: false, message: "None of the pasted lines matched a sentence in the essay. Paste the flagged sentences exactly as they appear in the essay." };
  const { error } = await createAdminClient()
    .from("eval_cases")
    .insert({ name: parsed.data.name, body: parsed.data.body, sentences: truth, note: parsed.data.note || null });
  if (error) return { ok: false, message: "Couldn't save the case." };
  await audit("eval_case_added", { actorId: admin.id, detail: { sentences: truth.length, flagged } });
  revalidatePath("/admin/eval");
  return { ok: true, sentences: truth.length, flagged, unmatched };
}

export async function deleteEvalCase(id: unknown): Promise<Result> {
  const admin = await assertAdmin();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown case." };
  const { error } = await createAdminClient().from("eval_cases").delete().eq("id", id as string);
  if (error) return { ok: false, message: "Couldn't delete the case." };
  await audit("eval_case_deleted", { actorId: admin.id });
  revalidatePath("/admin/eval");
  return { ok: true };
}

const runInput = z.object({ caseId: uuid, effort: z.enum(REASONING_EFFORTS).optional() });

export interface EvalRunSummary {
  id: number;
  createdAt: string;
  model: string;
  effort: string;
  promptLabel: string;
  promptChars: number;
  metrics: Metrics;
  ms: number;
  tokens: number;
}

/**
 * Runs the reviewer (the prompt in use on the site, with the chosen model and
 * reasoning) on one test case and stores how it scored against Turnitin.
 */
export async function runEvalCase(input: unknown): Promise<Result<{ run: EvalRunSummary }>> {
  const admin = await assertAdmin();
  if (!deepseekEnabled()) return { ok: false, message: "DEEPSEEK_API_KEY isn't set in Vercel." };
  const parsed = runInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown case." };
  const db = createAdminClient();
  const { data: row } = await db.from("eval_cases").select("body,sentences").eq("id", parsed.data.caseId).maybeSingle<{ body: string; sentences: TruthSentence[] }>();
  if (!row) return { ok: false, message: "That case no longer exists." };

  const [prompt, promptSetting, model] = await Promise.all([getScanReportPrompt(), getScanReportSetting(), getModelSetting()]);
  try {
    const result = await deepseekRun({
      system: [prompt, DRAFT_GUARD].join("\n\n"),
      user: ["<draft>", row.body, "</draft>"].join("\n"),
      maxTokens: 24_000,
      model: model.model,
      effort: parsed.data.effort ?? model.effort,
    });
    await logModelCall("eval", { ok: true, result });
    const metrics = { ...scoreReport(result.text, row.sentences), truncated: result.truncated };
    const tokens = result.usage.promptTokens + result.usage.completionTokens;
    const label = promptSetting.custom ? "your saved prompt" : "built-in prompt";
    const { data: saved, error } = await db
      .from("eval_runs")
      .insert({
        case_id: parsed.data.caseId,
        model: result.model,
        effort: result.effort,
        prompt_label: label,
        prompt_chars: prompt.length,
        metrics,
        report: result.text,
        ms: result.ms,
        tokens,
      })
      .select("id,created_at")
      .single<{ id: number; created_at: string }>();
    if (error || !saved) return { ok: false, message: "The test ran but the result couldn't be saved." };
    await audit("eval_run", { actorId: admin.id, detail: { model: result.model, effort: result.effort } });
    revalidatePath("/admin/eval");
    return {
      ok: true,
      run: { id: saved.id, createdAt: saved.created_at, model: result.model, effort: result.effort, promptLabel: label, promptChars: prompt.length, metrics, ms: result.ms, tokens },
    };
  } catch (e) {
    if (e instanceof DeepSeekRunError) await logModelCall("eval", { ok: false, error: e });
    const reason = e instanceof DeepSeekError ? ` (${e.reason})` : "";
    return { ok: false, message: `The model didn't answer${reason}. Try again.` };
  }
}
