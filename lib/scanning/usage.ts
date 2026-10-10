import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { freeScan } from "@/config/app";

/**
 * Daily free-scan allowance. Enforcement lives in Postgres (consume_scan),
 * which increments atomically and refuses past the limit, so parallel
 * requests cannot exceed it.
 */
export async function getRemainingScans(): Promise<number> {
  // Admin accounts (the owner's) have no daily limit; show a full allowance (see runScan).
  if ((await getSessionUser())?.profile.role === "admin") return freeScan.dailyLimit;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remaining_scans");
  if (error) throw new Error("Could not read scan usage");
  return Math.max(0, Math.min(freeScan.dailyLimit, Number(data)));
}

export async function canUserScan(): Promise<boolean> {
  return (await getRemainingScans()) > 0;
}

/** Consumes one scan. Returns remaining scans, or null if the limit was reached. */
export async function incrementScanUsage(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_scan");
  if (error) throw new Error("Could not record scan usage");
  const remaining = Number(data);
  return remaining < 0 ? null : remaining;
}

/** Server-only refund after a failed analysis. Not callable from the browser. */
export async function refundScanUsage(userId: string): Promise<void> {
  await createAdminClient().rpc("refund_scan", { p_user: userId });
}
