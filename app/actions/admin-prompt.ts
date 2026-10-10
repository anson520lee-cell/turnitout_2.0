"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { resetScanReportPrompt, saveScanReportPrompt } from "@/lib/site-settings";

type Result = { ok: true } | { ok: false; message: string };

const promptInput = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(20, "The prompt is too short.").max(20_000, "The prompt is too long (max 20,000 characters)."));

/** Saves the owner's system prompt for the free-scan report. */
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
