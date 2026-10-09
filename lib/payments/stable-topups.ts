import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { manualPayments } from "@/config/payments";
import { formatUSD } from "@/config/pricing";
import { audit } from "@/lib/audit";
import { notifyOwner } from "@/lib/notify";
import { shortId } from "@/lib/utils";
import { expectedMicros, verifyUsdcBase, verifyUsdtTron, type ChainResult } from "./chain";

/**
 * Automatic confirmation of stablecoin top-ups (USDT on TRON, USDC on Base).
 * A pending top-up whose transaction verifies on chain (see ./chain) is
 * credited through the same SQL path an admin uses; anything else stays
 * pending for the admin. Safe to call repeatedly: a confirmed top-up or an
 * already-credited transaction is never credited twice.
 */

export const AUTO_METHODS = ["usdt", "usdc"] as const;
export const isAutoMethod = (m: string) => (AUTO_METHODS as readonly string[]).includes(m);

interface TopupRow {
  id: string;
  user_id: string;
  usd: number;
  amount: number;
  method: string;
  status: string;
  payer_reference: string | null;
  created_at: string;
}

function walletOf(method: "usdt" | "usdc"): string | null {
  const v = manualPayments[method].payee.find((p) => p.label === "Wallet address")?.value;
  return v && !v.toUpperCase().startsWith("REPLACE") ? v.trim() : null;
}

/** Tries to confirm one top-up from the chain. Returns what happened. */
export async function autoConfirmTopup(top: TopupRow): Promise<ChainResult | { status: "skip" }> {
  if (top.status !== "pending" || !isAutoMethod(top.method) || !top.payer_reference) return { status: "skip" };
  const method = top.method as "usdt" | "usdc";
  const wallet = walletOf(method);
  if (!wallet) return { status: "skip" };
  const expected = expectedMicros(top.usd, top.user_id);
  let res: ChainResult;
  try {
    res =
      method === "usdt"
        ? await verifyUsdtTron(top.payer_reference, wallet, expected, new Date(top.created_at))
        : await verifyUsdcBase(top.payer_reference, wallet, expected, new Date(top.created_at));
  } catch {
    return { status: "wait", reason: "chain lookup failed" };
  }
  if (res.status !== "ok") return res;

  const db = createAdminClient();
  const { data, error } = await db.rpc("credit_confirm_topup", { p_topup: top.id, p_reviewer: null, p_provider_ref: res.ref });
  if (error) {
    // most likely the transaction was already used for another top-up
    await db
      .from("credit_topups")
      .update({ admin_note: "Auto-check: this transaction was already credited to another top-up." })
      .eq("id", top.id);
    return { status: "manual", reason: "transaction already credited" };
  }
  if (typeof data === "number" && data < 0) return { status: "skip" };
  await audit("topup_auto_confirmed", { actorId: null, detail: { topup: top.id, usd: top.usd, credits: top.amount, ref: res.ref } });
  const { data: who } = await db.from("profiles").select("email").eq("id", top.user_id).maybeSingle<{ email: string | null }>();
  notifyOwner("payment_confirmed", {
    topup: shortId(top.id),
    method: `${manualPayments[method].label} (confirmed on chain)`,
    amount: formatUSD(top.usd),
    credits: top.amount,
    email: who?.email ?? "",
  });
  return res;
}

/** Re-checks pending stablecoin top-ups: one account's (billing page) or everyone's (admin), a few at a time. */
export async function recheckStableTopups(userId?: string, limit = 8): Promise<number> {
  const db = createAdminClient();
  let q = db
    .from("credit_topups")
    .select("id,user_id,usd,amount,method,status,payer_reference,created_at")
    .eq("status", "pending")
    .in("method", AUTO_METHODS as unknown as string[])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  let credited = 0;
  for (const top of (data ?? []) as TopupRow[]) {
    const r = await autoConfirmTopup(top);
    if (r.status === "ok") credited++;
  }
  return credited;
}
