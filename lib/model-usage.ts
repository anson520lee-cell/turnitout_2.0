import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import type { ChatResult, ChatUsage, DeepSeekRunError } from "@/lib/deepseek";

/**
 * A log of model calls (migration 0010): purpose, model, effort, tokens, time
 * and whether it worked. Never the text and never who asked. Writing is
 * best-effort: a logging problem never affects the user's request.
 */

export type UsagePurpose = "scan_report" | "prompt_test" | "refinement_draft";

/**
 * USD per million tokens, for the admin estimate only: DeepSeek's peak-hour
 * prices (api-docs.deepseek.com/quick_start/pricing, checked 2026-10-11), so
 * the estimate is an upper bound; off-peak is half. Edit here if they change.
 * Reasoning tokens are billed as output and are already in completion_tokens.
 */
const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "deepseek-flash": { input: 0.3, cachedInput: 0.006, output: 1.2 },
  "deepseek-v4-pro": { input: 1.32, cachedInput: 0.044, output: 3.96 },
};
const FALLBACK_PRICE = PRICES["deepseek-flash"];

export function estimateCostUsd(model: string, u: Pick<ChatUsage, "promptTokens" | "completionTokens" | "cacheHitTokens">): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  const fresh = Math.max(0, u.promptTokens - u.cacheHitTokens);
  return (fresh * p.input + u.cacheHitTokens * p.cachedInput + u.completionTokens * p.output) / 1_000_000;
}

export async function logModelCall(
  purpose: UsagePurpose,
  outcome: { ok: true; result: ChatResult } | { ok: false; error: DeepSeekRunError },
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const row = outcome.ok
    ? { model: outcome.result.model, effort: outcome.result.effort, ok: true, reason: null, usage: outcome.result.usage, ms: outcome.result.ms }
    : { model: outcome.error.model, effort: "n/a", ok: false, reason: outcome.error.reason, usage: outcome.error.usage, ms: outcome.error.ms };
  try {
    await createAdminClient().from("model_usage").insert({
      purpose,
      model: row.model,
      effort: row.effort,
      ok: row.ok,
      reason: row.reason,
      prompt_tokens: row.usage.promptTokens,
      completion_tokens: row.usage.completionTokens,
      reasoning_tokens: row.usage.reasoningTokens,
      cache_hit_tokens: row.usage.cacheHitTokens,
      ms: row.ms,
    });
  } catch {
    // Logging is best-effort.
  }
}

/** Reports a day may generate before the site pauses them (a cost brake). Set DAILY_REPORT_LIMIT in Vercel to change it; 0 turns the brake off. */
export function dailyReportLimit(): number {
  const n = Number(process.env.DAILY_REPORT_LIMIT);
  return Number.isFinite(n) && n >= 0 && process.env.DAILY_REPORT_LIMIT?.trim() ? Math.floor(n) : 600;
}

/** True when today's (Hong Kong day) report count has reached the limit. Never blocks on a logging problem. */
export async function reportLimitReached(): Promise<boolean> {
  const limit = dailyReportLimit();
  if (limit === 0 || !isSupabaseConfigured) return false;
  try {
    const hkNow = new Date(Date.now() + 8 * 3_600_000);
    const startUtc = new Date(Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate()) - 8 * 3_600_000);
    const { count } = await createAdminClient()
      .from("model_usage")
      .select("id", { count: "exact", head: true })
      .eq("purpose", "scan_report")
      .gte("created_at", startUtc.toISOString());
    return (count ?? 0) >= limit;
  } catch {
    return false;
  }
}

export interface UsageDay {
  day: string;
  calls: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costUsd: number;
  avgMs: number;
}

export interface UsageSummary {
  days: UsageDay[];
  total: Omit<UsageDay, "day">;
  reasons: { reason: string; count: number }[];
  efforts: { effort: string; count: number }[];
}

type UsageRow = {
  created_at: string;
  model: string;
  effort: string;
  ok: boolean;
  reason: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cache_hit_tokens: number;
  ms: number;
};

/** Per-day totals for the last `days` days (Hong Kong calendar days), newest first. */
export async function usageSummary(days = 14): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("model_usage")
    .select("created_at,model,effort,ok,reason,prompt_tokens,completion_tokens,reasoning_tokens,cache_hit_tokens,ms")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as UsageRow[];
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
  const empty = (): Omit<UsageDay, "day"> => ({ calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0, avgMs: 0 });
  const byDay = new Map<string, Omit<UsageDay, "day"> & { msSum: number }>();
  const total = { ...empty(), msSum: 0 };
  const reasons = new Map<string, number>();
  const efforts = new Map<string, number>();
  for (const r of rows) {
    const d = byDay.get(dayKey(r.created_at)) ?? { ...empty(), msSum: 0 };
    const cost = estimateCostUsd(r.model, { promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens, cacheHitTokens: r.cache_hit_tokens });
    for (const t of [d, total]) {
      t.calls += 1;
      t.failed += r.ok ? 0 : 1;
      t.promptTokens += r.prompt_tokens;
      t.completionTokens += r.completion_tokens;
      t.reasoningTokens += r.reasoning_tokens;
      t.costUsd += cost;
      t.msSum += r.ms;
    }
    byDay.set(dayKey(r.created_at), d);
    if (!r.ok && r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
    if (r.ok) efforts.set(r.effort, (efforts.get(r.effort) ?? 0) + 1);
  }
  const finish = ({ msSum, ...t }: Omit<UsageDay, "day"> & { msSum: number }) => ({ ...t, avgMs: t.calls ? Math.round(msSum / t.calls) : 0 });
  return {
    days: [...byDay.entries()].map(([day, t]) => ({ day, ...finish(t) })).sort((a, b) => b.day.localeCompare(a.day)),
    total: finish(total),
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    efforts: [...efforts.entries()].map(([effort, count]) => ({ effort, count })).sort((a, b) => b.count - a.count),
  };
}
