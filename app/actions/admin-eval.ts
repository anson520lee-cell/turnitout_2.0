"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { WritingModelError, WritingModelRunError, REASONING_EFFORTS, writingModelEnabled } from "@/lib/writing-model";
import { prepareEvalTruth, scoreReviewedReport, type Metrics, type TruthSentence } from "@/lib/eval";
import { prepareReview, reviewSystem } from "@/lib/auto-report/review";
import { finishProductionReview, REVIEW_CONTEXT_CHARS, requestReviewPiece } from "@/lib/auto-report/review-model";
import { reportBasis } from "@/lib/auto-report/reuse";
import { PIECE_SIZE } from "@/lib/auto-report/stitch";
import { logModelCall } from "@/lib/model-usage";
import { getModelSetting, getScanReportSetting } from "@/lib/site-settings";
import { uuid } from "@/lib/validation/schemas";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const caseInput = z.object({
  name: z.string().trim().min(1, "Give the case a name.").max(120),
  body: z.string().trim().min(200, "The essay text is too short to test with.").max(8000, "The essay text is limited to 8,000 characters."),
  flagged: z.string().max(20_000),
  referenceScore: z.string().trim().max(4).transform(value => value.replace(/%$/, "")).pipe(
    z.string().regex(/^(?:|\*|0|[1-9][0-9]?|100)$/, "Enter a Turnitin result from 0 to 100, or * for a withheld score."),
  ).optional(),
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
  const reference = parsed.data.referenceScore || null;
  const prepared = prepareEvalTruth(parsed.data.body, parsed.data.flagged, reference);
  if (!prepared.ok) return { ok: false, message: prepared.message };
  const { truth, flagged, unmatched } = prepared;
  const { error } = await createAdminClient()
    .from("eval_cases")
    .insert({ name: parsed.data.name, body: parsed.data.body, sentences: truth, reference_score: reference, note: parsed.data.note || null });
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
  if (!writingModelEnabled()) return { ok: false, message: "OPENAI_API_KEY isn't set in Vercel." };
  const parsed = runInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown case." };
  const db = createAdminClient();
  const { data: row } = await db.from("eval_cases").select("body,sentences,reference_score").eq("id", parsed.data.caseId)
    .maybeSingle<{ body: string; sentences: TruthSentence[]; reference_score: string | null }>();
  if (!row) return { ok: false, message: "That case no longer exists." };

  const [promptSetting, model] = await Promise.all([getScanReportSetting(), getModelSetting()]);
  const prompt = promptSetting.value;
  const review = prepareReview(row.body, undefined, REVIEW_CONTEXT_CHARS);
  const system = reviewSystem(prompt, true);
  const settings = { model: model.model, effort: parsed.data.effort ?? model.effort };
  const started = Date.now();
  try {
    const responses = await Promise.allSettled(review.pieces.map(piece => requestReviewPiece(piece, system, settings)));
    const valid = responses.flatMap((response, index) => response.status === "fulfilled" ? [{ ...response.value, index }] : []);
    await Promise.all(responses.map(response => {
      if (response.status === "fulfilled") return logModelCall("eval", { ok: true, result: response.value.result });
      if (response.reason instanceof WritingModelRunError) return logModelCall("eval", { ok: false, error: response.reason });
    }));
    const report = finishProductionReview(review, new Map(valid.flatMap(({ read, index }) => read ? [[index, read]] : [])));
    if (!report) return { ok: false, message: "The report is incomplete or contains an invalid reply. No score was saved. Try again." };
    const metrics = {
      ...scoreReviewedReport(review, report, row.sentences, row.reference_score),
      basis: reportBasis({ prompt: system, ...settings, pieceSize: PIECE_SIZE }),
    };
    const tokens = valid.reduce((sum, { result }) => sum + result.usage.promptTokens + result.usage.completionTokens, 0);
    const effort = [...new Set(valid.map(({ result }) => result.effort))].sort().join(" + ");
    const ms = Date.now() - started;
    const label = promptSetting.custom ? "saved prompt" : "built-in prompt";
    const { data: saved, error } = await db
      .from("eval_runs")
      .insert({
        case_id: parsed.data.caseId,
        model: settings.model,
        effort,
        prompt_label: label,
        prompt_chars: prompt.length,
        metrics,
        report: JSON.stringify(report),
        ms,
        tokens,
      })
      .select("id,created_at")
      .single<{ id: number; created_at: string }>();
    if (error || !saved) return { ok: false, message: "The test ran but the result couldn't be saved." };
    await audit("eval_run", { actorId: admin.id, detail: { model: settings.model, effort } });
    revalidatePath("/admin/eval");
    return {
      ok: true,
      run: { id: saved.id, createdAt: saved.created_at, model: settings.model, effort, promptLabel: label, promptChars: prompt.length, metrics, ms, tokens },
    };
  } catch (e) {
    if (e instanceof WritingModelRunError) await logModelCall("eval", { ok: false, error: e });
    const reason = e instanceof WritingModelError ? ` (${e.reason})` : "";
    return { ok: false, message: `The model didn't answer${reason}. Try again.` };
  }
}
