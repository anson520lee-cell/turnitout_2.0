import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { SCAN_REPORT_PROMPT } from "@/lib/local-model/prompts";

/**
 * Settings the owner edits on /admin/prompt, kept in public.site_settings
 * (migration 0009, service role only). Each server instance caches a value for
 * a short time, so a save shows up on the next scan within about 30 seconds.
 */

const SCAN_REPORT_KEY = "scan_report_prompt";
const CACHE_MS = 30_000;

let cached: { at: number; value: string | null } | null = null;

export interface PromptSetting {
  /** The prompt in use: the owner's saved text, or the built-in default. */
  value: string;
  custom: boolean;
  updatedAt: string | null;
}

/** The owner's saved report prompt, or null. Never throws: on any problem the default is used. */
async function readCustomPrompt(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value: string | null = null;
  if (isSupabaseConfigured) {
    try {
      const { data } = await createAdminClient()
        .from("site_settings")
        .select("value")
        .eq("key", SCAN_REPORT_KEY)
        .maybeSingle<{ value: string }>();
      value = data?.value?.trim() || null;
    } catch {
      value = cached?.value ?? null;
    }
  }
  cached = { at: Date.now(), value };
  return value;
}

/** The system prompt for the free-scan report. */
export async function getScanReportPrompt(): Promise<string> {
  return (await readCustomPrompt()) ?? SCAN_REPORT_PROMPT;
}

/** For the admin page: current prompt and whether it's the owner's own. */
export async function getScanReportSetting(): Promise<PromptSetting> {
  const { data } = await createAdminClient()
    .from("site_settings")
    .select("value,updated_at")
    .eq("key", SCAN_REPORT_KEY)
    .maybeSingle<{ value: string; updated_at: string }>();
  const custom = data?.value?.trim();
  return custom
    ? { value: custom, custom: true, updatedAt: data!.updated_at }
    : { value: SCAN_REPORT_PROMPT, custom: false, updatedAt: null };
}

export async function saveScanReportPrompt(value: string, userId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("site_settings")
    .upsert({ key: SCAN_REPORT_KEY, value, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error("save failed");
  cached = null;
}

export async function resetScanReportPrompt(): Promise<void> {
  const { error } = await createAdminClient().from("site_settings").delete().eq("key", SCAN_REPORT_KEY);
  if (error) throw new Error("reset failed");
  cached = null;
}
