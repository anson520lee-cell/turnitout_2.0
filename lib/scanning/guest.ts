import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeScan } from "@/config/app";

/**
 * Free scans for visitors without an account: `freeScan.dailyLimit` per IP
 * address per Hong Kong calendar day. Counting happens in Postgres
 * (consume_guest_scan, migration 0002), which increments atomically and
 * refuses past the limit, so parallel requests cannot exceed it. The
 * functions are service-role only, so the browser can't reset its own count.
 *
 * Privacy: the raw IP never leaves this module. It is hashed with a
 * server-side salt, only the hash is stored, and neither is logged.
 *
 * Which address:
 * - The first entry of `x-forwarded-for`, else `x-real-ip`, but only where a
 *   proxy we trust sets them: on Vercel (`VERCEL` is set), which overwrites
 *   any value the visitor sends, or where `TRUST_PROXY_IP_HEADERS=true` says
 *   the host does the same. Anywhere else the headers could come from the
 *   visitor (`next start` keeps a client-sent `x-forwarded-for`), so they are
 *   ignored.
 * - IPv6 addresses count per /64 network (one household or phone), since a
 *   single device can rotate through addresses inside its /64.
 * - Without a trusted header, all guests share one "unknown" bucket: the
 *   limit still holds, it just fails closed instead of open.
 *
 * Visitors behind one shared address (a school network, mobile carrier NAT)
 * share one allowance. Signing in gives each person their own.
 */

function salt(): string {
  if (process.env.GUEST_IP_SALT) return process.env.GUEST_IP_SALT;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  // Derived rather than the key itself, so the key never feeds a stored value directly.
  return createHash("sha256").update(`proofline-guest-ip:${key}`).digest("hex");
}

/** "2001:db8:a:b:1:2:3:4" → "2001:db8:a:b::/64". Input must already be valid IPv6. */
function ipv6Network(ip: string): string {
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/** Normalise a header value to the bucket key: an IPv4 address, an IPv6 /64, or "unknown". */
function bucketFor(raw: string | null | undefined): string {
  let ip = (raw ?? "").trim().toLowerCase();
  ip = /^\[([^\]]+)\]/.exec(ip)?.[1] ?? ip; // "[v6]:port"
  ip = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)?.[1] ?? ip; // "v4:port"
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7); // IPv4-mapped IPv6
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version === 6) return ipv6Network(ip);
  return "unknown";
}

/** Whether visitor addresses come from proxy headers (else one shared bucket). */
export function trustsProxyHeaders(): boolean {
  return Boolean(process.env.VERCEL) || process.env.TRUST_PROXY_IP_HEADERS === "true";
}

async function ipHash(): Promise<string> {
  let bucket = "unknown";
  if (trustsProxyHeaders()) {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0];
    bucket = bucketFor(forwarded || h.get("x-real-ip"));
  }
  // 64 hex characters, which the table's check constraint requires.
  return createHash("sha256").update(salt()).update(bucket).digest("hex");
}

/** Free scans this visitor has left today. Throws if usage can't be read. */
export async function guestRemainingScans(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("guest_remaining_scans", { p_ip_hash: await ipHash() });
  if (error) throw new Error(`Could not read guest scan usage (${error.code || "unknown"})`);
  return Math.max(0, Math.min(freeScan.dailyLimit, Number(data)));
}

/** Consumes one guest scan. Returns scans remaining, or null if today's limit was already reached. */
export async function consumeGuestScan(): Promise<number | null> {
  const { data, error } = await createAdminClient().rpc("consume_guest_scan", { p_ip_hash: await ipHash() });
  if (error) throw new Error(`Could not record guest scan usage (${error.code || "unknown"})`);
  const remaining = Number(data);
  return remaining < 0 ? null : remaining;
}

/** Gives the scan back after a failed analysis (same request, so the same address). */
export async function refundGuestScan(): Promise<void> {
  await createAdminClient().rpc("refund_guest_scan", { p_ip_hash: await ipHash() });
}
