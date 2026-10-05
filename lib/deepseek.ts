import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * DeepSeek, called from the server only. DEEPSEEK_API_KEY never reaches the
 * browser, and neither the text sent nor the provider's raw errors are logged
 * or shown to users: callers get a short generic message.
 *
 * DEEPSEEK_MODEL and DEEPSEEK_REASONING_EFFORT override the defaults below
 * without a code change (set them in Vercel).
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_EFFORT = "low";
const TIMEOUT_MS = 90_000;

export class DeepSeekError extends Error {
  constructor(message = "The writing model is unavailable right now.") {
    super(message);
    this.name = "DeepSeekError";
  }
}

export function deepseekEnabled(): boolean {
  return (process.env.DEEPSEEK_API_KEY ?? "").length > 0;
}

export function deepseekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

type ChatBody = Record<string, unknown>;

async function post(body: ChatBody): Promise<Response> {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

/** One chat completion → the reply text. Throws DeepSeekError (generic message) on any failure. */
export async function deepseekChat(opts: { system: string; user: string; maxTokens: number }): Promise<string> {
  if (!deepseekEnabled()) throw new DeepSeekError();
  const base: ChatBody = {
    model: deepseekModel(),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens,
    stream: false,
  };
  const effort = process.env.DEEPSEEK_REASONING_EFFORT?.trim() || DEFAULT_EFFORT;
  // Low reasoning first; if the API doesn't take that option, fall back to no thinking at all.
  const attempts: ChatBody[] = [
    { ...base, thinking: { type: "enabled" }, reasoning_effort: effort },
    { ...base, thinking: { type: "disabled" } },
  ];
  try {
    for (const [i, body] of attempts.entries()) {
      const res = await post(body);
      if (res.status === 400 && i < attempts.length - 1) continue;
      if (!res.ok) {
        // Status and error code only (never the text or the key), so a wrong model id shows up in the host's logs.
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("deepseek request failed", { status: res.status, model: deepseekModel(), type: err?.error?.type, code: err?.error?.code });
        throw new DeepSeekError();
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new DeepSeekError("The writing model returned nothing.");
      return text;
    }
  } catch (e) {
    if (e instanceof DeepSeekError) throw e;
    throw new DeepSeekError();
  }
  throw new DeepSeekError();
}

/* ---------- scan-feedback tickets ----------
 * A scan that was counted returns a short-lived signed ticket for that exact
 * text, so /api/scan-feedback can't be used as a free general-purpose model. */

const TICKET_MINUTES = 10;
const usedTickets = new Map<string, number>();

function ticketKey(): Buffer {
  return createHash("sha256").update(`scan-feedback:${process.env.DEEPSEEK_API_KEY ?? ""}`).digest();
}

function sign(textHash: string, exp: number): string {
  return createHmac("sha256", ticketKey()).update(`${exp}.${textHash}`).digest("base64url");
}

const hashText = (text: string) => createHash("sha256").update(text).digest("hex");

export function issueFeedbackTicket(text: string): string | null {
  if (!deepseekEnabled()) return null;
  const exp = Date.now() + TICKET_MINUTES * 60_000;
  return `${exp}.${sign(hashText(text), exp)}`;
}

/** Valid, unexpired and not used before (single use per server instance). */
export function redeemFeedbackTicket(ticket: string, text: string): boolean {
  const [expRaw, mac] = ticket.split(".");
  const exp = Number(expRaw);
  if (!mac || !Number.isFinite(exp) || exp < Date.now()) return false;
  const want = Buffer.from(sign(hashText(text), exp));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const now = Date.now();
  for (const [k, e] of usedTickets) if (e < now) usedTickets.delete(k);
  if (usedTickets.has(mac)) return false;
  usedTickets.set(mac, exp);
  return true;
}
