import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { ipHash } from "@/lib/scanning/guest";
import { freeReport } from "@/config/app";

/**
 * The daily free report allowance (see config/app.ts freeReport and migration
 * 0015). Counted per account and, as a second guard against throw-away
 * accounts, per network address, in Postgres, so parallel requests can't
 * exceed it. Admin accounts have no limit.
 */

export type FreeReportStatus =
  | { mode: "guest" }
  | { mode: "account"; remaining: number; unlimited: boolean };

/** What the card shows for the current visitor. A guest can try; the sign-in is asked on submit. */
export async function getFreeReportStatus(): Promise<FreeReportStatus> {
  const user = await getSessionUser();
  if (!user) return { mode: "guest" };
  if (user.profile.role === "admin") return { mode: "account", remaining: freeReport.dailyLimit, unlimited: true };
  try {
    const { data, error } = await createAdminClient().rpc("free_report_remaining", {
      p_user: user.id,
      p_ip_hash: await ipHash(),
      p_ip_limit: freeReport.perNetworkLimit,
    });
    if (error) throw error;
    return { mode: "account", remaining: Math.max(0, Math.min(freeReport.dailyLimit, Number(data))), unlimited: false };
  } catch {
    // Can't read the count: show the card as available; the real check happens on submit.
    return { mode: "account", remaining: freeReport.dailyLimit, unlimited: false };
  }
}

/** Takes today's free report for an order: "ok", "used" (the account has used today's) or "network" (this address is used up). */
export async function consumeFreeReport(orderId: string, userId: string): Promise<"ok" | "used" | "network" | "error"> {
  const { data, error } = await createAdminClient().rpc("consume_free_report", {
    p_order: orderId,
    p_user: userId,
    p_ip_hash: await ipHash(),
    p_ip_limit: freeReport.perNetworkLimit,
  });
  if (error) return "error";
  const n = Number(data);
  return n === 0 ? "ok" : n === -1 ? "used" : "network";
}

/** Gives the allowance back when no report was made. Safe to call for any order. */
export async function refundFreeReport(orderId: string): Promise<boolean> {
  const { data } = await createAdminClient().rpc("refund_free_report", { p_order: orderId });
  return Boolean(data);
}
