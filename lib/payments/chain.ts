import "server-only";

/**
 * Checks a stablecoin payment on chain, so USDT (TRON) and USDC (Base)
 * top-ups can be credited without waiting for an admin.
 *
 * A payment counts only if all of these hold:
 *   - the transaction succeeded and is final (TRON: solidified; Base: 3+ blocks deep);
 *   - it is a transfer of the right token contract to our receiving address;
 *   - the amount is exactly what the customer was asked to send. That amount
 *     carries a per-account offset in thousandths of a dollar
 *     (`stableOffset`), which ties the transfer to the account claiming it;
 *   - it was made in the 72 hours before the claim.
 * Each transaction can be credited once (unique `provider_payment_id`).
 * Anything that doesn't verify is left for an admin, never rejected here.
 *
 * Read-only public endpoints, no keys: TronGrid and the public Base RPC.
 */

export type ChainResult =
  | { status: "ok"; ref: string }
  | { status: "wait"; reason: string } // not final yet: check again later
  | { status: "manual"; reason: string }; // doesn't match: an admin decides

const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const WINDOW_MS = 72 * 3600 * 1000;

/** Thousandths of a US dollar added to every stablecoin top-up from this account (0.101 … 0.999). */
export function stableOffset(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 101 + ((h >>> 0) % 899);
}

/** The exact amount, in the token's 6-decimal units, the customer is asked to send. */
export function expectedMicros(usd: number, userId: string): bigint {
  return BigInt(usd) * BigInt(1_000_000) + BigInt(stableOffset(userId)) * BigInt(1_000);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Base58 TRON address -> 20-byte hex (lowercase, no 41 prefix, no checksum). */
function tronToHex(addr: string): string {
  let n = BigInt(0);
  for (const ch of addr) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error("bad base58");
    n = n * BigInt(58) + BigInt(v);
  }
  const hex = n.toString(16).padStart(50, "0"); // 25 bytes: 0x41 + 20 + 4 checksum
  return hex.slice(2, 42);
}

async function json(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function inWindow(tsMs: number, claimedAt: Date) {
  const t = claimedAt.getTime();
  return tsMs <= t + 10 * 60 * 1000 && tsMs >= t - WINDOW_MS;
}

export function normaliseTxid(raw: string): string {
  return raw.trim().replace(/^0x/i, "").toLowerCase();
}

export async function verifyUsdtTron(txid: string, to: string, expected: bigint, claimedAt: Date): Promise<ChainResult> {
  const id = normaliseTxid(txid);
  if (!/^[0-9a-f]{64}$/.test(id)) return { status: "manual", reason: "not a TRON transaction id" };
  const info = await json("https://api.trongrid.io/walletsolidity/gettransactioninfobyid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: id }),
  });
  if (!info || !info.id) return { status: "wait", reason: "not final on TRON yet" };
  if (info.receipt?.result !== "SUCCESS") return { status: "manual", reason: "transaction failed" };
  if (!inWindow(Number(info.blockTimeStamp), claimedAt)) return { status: "manual", reason: "transaction is too old" };
  const token = tronToHex(TRON_USDT);
  const me = tronToHex(to);
  for (const log of info.log ?? []) {
    if (String(log.address).toLowerCase() !== token) continue;
    if (String(log.topics?.[0]).toLowerCase() !== TRANSFER_TOPIC) continue;
    const dest = String(log.topics?.[2] ?? "").toLowerCase().slice(-40);
    if (dest !== me) continue;
    const value = BigInt("0x" + (log.data || "0"));
    if (value === expected) return { status: "ok", ref: `tron:${id}` };
    return { status: "manual", reason: `amount ${value} ≠ expected ${expected}` };
  }
  return { status: "manual", reason: "no USDT transfer to our address" };
}

const BASE_RPC = "https://mainnet.base.org";
async function rpc(method: string, params: unknown[]) {
  const r = await json(BASE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (r.error) throw new Error(r.error.message ?? "rpc error");
  return r.result;
}

export async function verifyUsdcBase(txid: string, to: string, expected: bigint, claimedAt: Date): Promise<ChainResult> {
  const id = normaliseTxid(txid);
  if (!/^[0-9a-f]{64}$/.test(id)) return { status: "manual", reason: "not a Base transaction hash" };
  const receipt = await rpc("eth_getTransactionReceipt", ["0x" + id]);
  if (!receipt) return { status: "wait", reason: "not mined yet" };
  if (receipt.status !== "0x1") return { status: "manual", reason: "transaction failed" };
  const head = BigInt(await rpc("eth_blockNumber", []));
  if (head - BigInt(receipt.blockNumber) < BigInt(3)) return { status: "wait", reason: "waiting for confirmations" };
  const block = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false]);
  if (!inWindow(Number(BigInt(block.timestamp)) * 1000, claimedAt)) return { status: "manual", reason: "transaction is too old" };
  const me = to.toLowerCase().replace(/^0x/, "");
  for (const log of receipt.logs ?? []) {
    if (String(log.address).toLowerCase() !== BASE_USDC) continue;
    if (String(log.topics?.[0]).toLowerCase().replace(/^0x/, "") !== TRANSFER_TOPIC) continue;
    const dest = String(log.topics?.[2] ?? "").toLowerCase().slice(-40);
    if (dest !== me) continue;
    const value = BigInt(log.data);
    if (value === expected) return { status: "ok", ref: `base:${id}` };
    return { status: "manual", reason: `amount ${value} ≠ expected ${expected}` };
  }
  return { status: "manual", reason: "no USDC transfer to our address" };
}
