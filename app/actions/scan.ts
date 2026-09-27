"use server";

import { getSessionUser } from "@/lib/auth/session";
import { getAnalyzer } from "@/lib/scanning";
import { forStorage, type AnalysisResult } from "@/lib/scanning/types";
import { incrementScanUsage, refundScanUsage } from "@/lib/scanning/usage";
import { createClient } from "@/lib/supabase/server";
import { scanInput } from "@/lib/validation/schemas";
import { retention } from "@/config/app";

export type ScanResponse =
  | { ok: true; result: AnalysisResult; remaining: number; scanId: string }
  | { ok: false; code: "unauthenticated" | "invalid" | "limit" | "failed"; message: string };

export async function runScan(rawText: string): Promise<ScanResponse> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "unauthenticated", message: "Your session has expired. Sign in again to scan." };
  }

  const parsed = scanInput.safeParse(rawText);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid text." };
  }
  const text = parsed.data;

  // Validate first, then consume: invalid input never costs a scan.
  let remaining: number | null;
  try {
    remaining = await incrementScanUsage();
  } catch {
    return { ok: false, code: "failed", message: "We couldn't check your daily allowance. Please try again." };
  }
  if (remaining === null) {
    return {
      ok: false,
      code: "limit",
      message: "You've used today's free scans. Your allowance resets at midnight Hong Kong time.",
    };
  }

  try {
    const result = await getAnalyzer().analyze(text);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scan_results")
      .insert({
        user_id: user.id,
        input_text: retention.storeScanText ? text : null,
        word_count: result.metadata.words,
        overall_risk: result.overallRisk,
        // Highlights and excerpts contain the user's words; only scores are saved.
        result_json: forStorage(result),
        analyzer: result.metadata.analyzer,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("save failed");
    return { ok: true, result, remaining, scanId: data.id };
  } catch {
    await refundScanUsage(user.id);
    return {
      ok: false,
      code: "failed",
      message: "The analysis didn't complete, so this scan wasn't counted. Please try again.",
    };
  }
}
