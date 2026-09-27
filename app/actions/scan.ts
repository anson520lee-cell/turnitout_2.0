"use server";

import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { notifyOwner } from "@/lib/notify";
import { getAnalyzer } from "@/lib/scanning";
import { consumeGuestScan, refundGuestScan } from "@/lib/scanning/guest";
import { forStorage, type AnalysisResult } from "@/lib/scanning/types";
import { incrementScanUsage, refundScanUsage } from "@/lib/scanning/usage";
import { createClient } from "@/lib/supabase/server";
import { scanInput } from "@/lib/validation/schemas";
import { freeScan, retention } from "@/config/app";

export type ScanResponse =
  | {
      ok: true;
      result: AnalysisResult;
      remaining: number;
      /** True when run without an account: counted per IP and not saved. */
      guest: boolean;
      /** Saved scan id (accounts only). */
      scanId: string | null;
    }
  | { ok: false; code: "invalid" | "limit" | "failed" | "unavailable"; message: string };

/**
 * Free preliminary scan, with or without an account. Signed-in users use
 * their account's daily allowance and the scores are saved to their history;
 * guests use the per-IP allowance and nothing is saved.
 */
export async function runScan(rawText: string): Promise<ScanResponse> {
  // Validate first, then consume: invalid input never costs a scan.
  const parsed = scanInput.safeParse(rawText);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid text." };
  }
  const text = parsed.data;

  if (!isSupabaseConfigured) {
    return { ok: false, code: "unavailable", message: "Scanning isn't available yet. Please try again later." };
  }

  const user = await getSessionUser();

  let remaining: number | null;
  try {
    remaining = user ? await incrementScanUsage() : await consumeGuestScan();
  } catch {
    return { ok: false, code: "failed", message: "We couldn't check your daily allowance. Please try again." };
  }
  if (remaining === null) {
    return {
      ok: false,
      code: "limit",
      message: user
        ? "You've used today's free scans. Your allowance resets at midnight Hong Kong time."
        : `You've used today's ${freeScan.dailyLimit} free scans. Sign in or come back tomorrow (it resets at midnight Hong Kong time).`,
    };
  }

  let result: AnalysisResult;
  let scanId: string | null = null;
  try {
    result = await getAnalyzer().analyze(text);
    if (user) {
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
      scanId = data.id;
    }
  } catch {
    try {
      await (user ? refundScanUsage(user.id) : refundGuestScan());
    } catch {
      // The analysis error is what the user needs to see; a lost refund costs one scan at most.
    }
    return {
      ok: false,
      code: "failed",
      message: "The analysis didn't complete, so this scan wasn't counted. Please try again.",
    };
  }

  // Counts and the estimate only: never the text.
  notifyOwner("scan_used", {
    who: user ? user.email : "guest",
    words: result.metadata.words,
    estimate: result.overallRisk,
    remaining,
  });

  return { ok: true, result, remaining, guest: !user, scanId };
}
