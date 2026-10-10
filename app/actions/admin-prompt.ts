"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { DeepSeekError, DeepSeekRunError, REASONING_EFFORTS, deepseekEnabled, deepseekRun } from "@/lib/deepseek";
import { logModelCall } from "@/lib/model-usage";
import {
  getModelSetting,
  getPromptVersion,
  resetModelSetting,
  resetScanReportPrompt,
  saveModelSetting,
  saveScanReportPrompt,
} from "@/lib/site-settings";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";

type Result = { ok: true } | { ok: false; message: string };

const promptInput = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(20, "The prompt is too short.").max(20_000, "The prompt is too long (max 20,000 characters)."));

/** Saves the owner's system prompt for the free-scan report (and keeps a copy in the history). */
export async function saveReportPrompt(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = promptInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid prompt." };
  try {
    await saveScanReportPrompt(parsed.data, admin.id);
    await audit("report_prompt_saved", { actorId: admin.id, detail: { chars: parsed.data.length } });
  } catch {
    return { ok: false, message: "Couldn't save the prompt. Please try again." };
  }
  revalidatePath("/admin/prompt");
  return { ok: true };
}

/** Goes back to the built-in prompt. */
export async function resetReportPrompt(): Promise<Result> {
  const admin = await assertAdmin();
  try {
    await resetScanReportPrompt();
    await audit("report_prompt_reset", { actorId: admin.id });
  } catch {
    return { ok: false, message: "Couldn't reset the prompt. Please try again." };
  }
  revalidatePath("/admin/prompt");
  return { ok: true };
}

/** Text of an older saved version, to load into the editor (not saved until the owner presses Save). */
export async function loadPromptVersion(id: unknown): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  await assertAdmin();
  const parsed = z.number().int().positive().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Unknown version." };
  const value = await getPromptVersion(parsed.data);
  return value ? { ok: true, value } : { ok: false, message: "That version no longer exists." };
}

const modelInput = z.object({
  model: z
    .string()
    .trim()
    .min(1, "Choose a model.")
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i, "A model id has only letters, numbers, dots, dashes and underscores."),
  effort: z.enum(REASONING_EFFORTS),
});

export async function saveModelChoice(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = modelInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid choice." };
  try {
    await saveModelSetting(parsed.data.model, parsed.data.effort, admin.id);
    await audit("model_setting_saved", { actorId: admin.id, detail: parsed.data });
  } catch {
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/prompt");
  return { ok: true };
}

export async function resetModelChoice(): Promise<Result> {
  const admin = await assertAdmin();
  try {
    await resetModelSetting();
    await audit("model_setting_reset", { actorId: admin.id });
  } catch {
    return { ok: false, message: "Couldn't reset. Please try again." };
  }
  revalidatePath("/admin/prompt");
  return { ok: true };
}

const testInput = z.object({
  prompt: promptInput,
  text: z.string().trim().min(50, "Paste at least a few sentences to test with.").max(6000, "Test text is limited to 6,000 characters."),
});

export type PromptTestResult =
  | { ok: true; report: string; model: string; effort: string; seconds: number; tokens: number }
  | { ok: false; message: string };

/**
 * Runs a prompt (saved or not) on sample text with the current model choice,
 * so the owner can see the report before saving. Admin only; nothing is stored
 * except the usage row.
 */
export async function testReportPrompt(input: unknown): Promise<PromptTestResult> {
  await assertAdmin();
  if (!deepseekEnabled()) return { ok: false, message: "DEEPSEEK_API_KEY isn't set in Vercel." };
  const parsed = testInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid test." };
  const setting = await getModelSetting();
  try {
    const result = await deepseekRun({
      system: `${parsed.data.prompt}\n\n${DRAFT_GUARD}`,
      user: `<draft>\n${parsed.data.text}\n</draft>`,
      maxTokens: 12_000,
      model: setting.model,
      effort: setting.effort,
    });
    await logModelCall("prompt_test", { ok: true, result });
    return {
      ok: true,
      report: result.text,
      model: result.model,
      effort: result.effort,
      seconds: Math.round(result.ms / 100) / 10,
      tokens: result.usage.promptTokens + result.usage.completionTokens,
    };
  } catch (e) {
    if (e instanceof DeepSeekRunError) await logModelCall("prompt_test", { ok: false, error: e });
    const reason = e instanceof DeepSeekError ? ` (${e.reason})` : "";
    return { ok: false, message: `The model didn't answer${reason}. Check the model id, then try again.` };
  }
}
