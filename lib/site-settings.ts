import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { SCAN_REPORT_PROMPT } from "@/lib/local-model/prompts";
import { REASONING_EFFORTS, defaultEffort, deepseekModel, type ReasoningEffort } from "@/lib/deepseek";

/**
 * Settings the owner edits on /admin/prompt, kept in public.site_settings
 * (migration 0009, service role only), with every saved prompt version in
 * site_setting_history (0010). Each server instance caches values briefly, so
 * a save shows up on the next scan within about 30 seconds.
 */

export const SETTING_KEYS = {
  reportPrompt: "scan_report_prompt",
  model: "deepseek_model",
  effort: "deepseek_effort",
} as const;
type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const CACHE_MS = 30_000;
const cache = new Map<SettingKey, { at: number; value: string | null }>();

/** The saved value, or null. Never throws: on any problem the caller's default is used. */
async function read(key: SettingKey): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: string | null = null;
  if (isSupabaseConfigured) {
    try {
      const { data } = await createAdminClient().from("site_settings").select("value").eq("key", key).maybeSingle<{ value: string }>();
      value = data?.value?.trim() || null;
    } catch {
      value = hit?.value ?? null;
    }
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function write(key: SettingKey, value: string, userId: string, keepHistory: boolean): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("site_settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error("save failed");
  if (keepHistory) await db.from("site_setting_history").insert({ key, value, saved_by: userId });
  cache.delete(key);
}

async function remove(key: SettingKey): Promise<void> {
  const { error } = await createAdminClient().from("site_settings").delete().eq("key", key);
  if (error) throw new Error("reset failed");
  cache.delete(key);
}

/* ---------- report prompt ---------- */

export interface PromptSetting {
  /** The prompt in use: the owner's saved text, or the built-in default. */
  value: string;
  custom: boolean;
  updatedAt: string | null;
}

export interface PromptVersion {
  id: number;
  value: string;
  savedAt: string;
}

/** The system prompt for the free-scan report. */
export async function getScanReportPrompt(): Promise<string> {
  return (await read(SETTING_KEYS.reportPrompt)) ?? SCAN_REPORT_PROMPT;
}

/** For the admin page: current prompt and whether it's the owner's own. */
export async function getScanReportSetting(): Promise<PromptSetting> {
  const { data } = await createAdminClient()
    .from("site_settings")
    .select("value,updated_at")
    .eq("key", SETTING_KEYS.reportPrompt)
    .maybeSingle<{ value: string; updated_at: string }>();
  const custom = data?.value?.trim();
  return custom
    ? { value: custom, custom: true, updatedAt: data!.updated_at }
    : { value: SCAN_REPORT_PROMPT, custom: false, updatedAt: null };
}

/** The last saved versions of the report prompt, newest first. */
export async function listPromptVersions(limit = 20): Promise<PromptVersion[]> {
  const { data } = await createAdminClient()
    .from("site_setting_history")
    .select("id,value,saved_at")
    .eq("key", SETTING_KEYS.reportPrompt)
    .order("saved_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: { id: number; value: string; saved_at: string }) => ({ id: r.id, value: r.value, savedAt: r.saved_at }));
}

export async function getPromptVersion(id: number): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("site_setting_history")
    .select("value")
    .eq("key", SETTING_KEYS.reportPrompt)
    .eq("id", id)
    .maybeSingle<{ value: string }>();
  return data?.value ?? null;
}

export async function saveScanReportPrompt(value: string, userId: string): Promise<void> {
  await write(SETTING_KEYS.reportPrompt, value, userId, true);
}

export async function resetScanReportPrompt(): Promise<void> {
  await remove(SETTING_KEYS.reportPrompt);
}

/* ---------- model and reasoning ---------- */

/** Models offered in the admin picker. Any other id can still be set with DEEPSEEK_MODEL. */
export const MODEL_CHOICES = [
  { id: "deepseek-flash", label: "DeepSeek V4.1 Flash", note: "Fast and cheap. Good for most reports." },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", note: "Stronger reasoning, slower and pricier." },
] as const;

export interface ModelSetting {
  model: string;
  effort: ReasoningEffort;
  /** Whether each value comes from the admin page (true) or Vercel / the default (false). */
  customModel: boolean;
  customEffort: boolean;
}

export async function getModelSetting(): Promise<ModelSetting> {
  const [model, effort] = await Promise.all([read(SETTING_KEYS.model), read(SETTING_KEYS.effort)]);
  const validEffort = (REASONING_EFFORTS as readonly string[]).includes(effort ?? "") ? (effort as ReasoningEffort) : null;
  return {
    model: model ?? deepseekModel(),
    effort: validEffort ?? defaultEffort(),
    customModel: model !== null,
    customEffort: validEffort !== null,
  };
}

export async function saveModelSetting(model: string, effort: ReasoningEffort, userId: string): Promise<void> {
  await write(SETTING_KEYS.model, model, userId, false);
  await write(SETTING_KEYS.effort, effort, userId, false);
}

export async function resetModelSetting(): Promise<void> {
  await remove(SETTING_KEYS.model);
  await remove(SETTING_KEYS.effort);
}
