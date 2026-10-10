import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sseEvents } from "@/lib/sse";

/**
 * DeepSeek, called from the server only. DEEPSEEK_API_KEY never reaches the
 * browser, and neither the text sent nor the provider's raw errors are logged
 * or shown to users: callers get a short generic message.
 *
 * Model and reasoning effort: the owner's choice on /admin/prompt wins, then
 * DEEPSEEK_MODEL / DEEPSEEK_REASONING_EFFORT in Vercel, then the defaults below.
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash"; // DeepSeek-V4.1-Flash
const DEFAULT_EFFORT = "low" as const;
const TIMEOUT_MS = 55_000; // two attempts must fit in the scan-feedback route's 120 s limit

export class DeepSeekError extends Error {
  /** Short machine-readable cause (e.g. "http_402", "timeout", "empty"); safe to show: no text, no key. */
  readonly reason: string;
  constructor(message = "The writing model is unavailable right now.", reason = "unavailable") {
    super(message);
    this.name = "DeepSeekError";
    this.reason = reason;
  }
}

export function deepseekEnabled(): boolean {
  return (process.env.DEEPSEEK_API_KEY ?? "").length > 0;
}

export function deepseekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

type ChatBody = Record<string, unknown>;

async function post(body: ChatBody, timeoutMs = TIMEOUT_MS): Promise<Response> {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

export const REASONING_EFFORTS = ["off", "low", "high", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function defaultEffort(): ReasoningEffort {
  const env = process.env.DEEPSEEK_REASONING_EFFORT?.trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(env ?? "") ? (env as ReasoningEffort) : DEFAULT_EFFORT;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
}

export interface ChatResult {
  text: string;
  model: string;
  /** The effort actually used: "off" when the thinking attempt fell back. */
  effort: ReasoningEffort;
  /** Summed over every attempt made (a fallback costs tokens too). */
  usage: ChatUsage;
  ms: number;
}

/** Failure details for the usage log: the reason plus whatever the attempts cost. */
export class DeepSeekRunError extends DeepSeekError {
  readonly usage: ChatUsage;
  readonly model: string;
  readonly ms: number;
  constructor(cause: DeepSeekError, usage: ChatUsage, model: string, ms: number) {
    super(cause.message, cause.reason);
    this.usage = usage;
    this.model = model;
    this.ms = ms;
  }
}

type ApiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

function addUsage(total: ChatUsage, u: ApiUsage | undefined) {
  if (!u) return;
  total.promptTokens += u.prompt_tokens ?? 0;
  total.completionTokens += u.completion_tokens ?? 0;
  total.reasoningTokens += u.completion_tokens_details?.reasoning_tokens ?? 0;
  total.cacheHitTokens += u.prompt_cache_hit_tokens ?? 0;
}

/**
 * One chat completion with details (model, effort used, token usage, time).
 * Thinking at `effort` first; if the API rejects that option or the reasoning
 * leaves no answer, one retry with thinking off. effort "off" skips straight
 * to that. Throws DeepSeekRunError (generic message + reason) on failure.
 */
export async function deepseekRun(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  effort?: ReasoningEffort;
}): Promise<ChatResult> {
  const model = opts.model?.trim() || deepseekModel();
  const effort = opts.effort ?? defaultEffort();
  const usage: ChatUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cacheHitTokens: 0 };
  const started = Date.now();
  const fail = (e: DeepSeekError) => new DeepSeekRunError(e, usage, model, Date.now() - started);
  if (!deepseekEnabled()) throw fail(new DeepSeekError());

  const base: ChatBody = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens,
    stream: false,
  };
  const attempts: { body: ChatBody; effort: ReasoningEffort }[] = [
    ...(effort === "off" ? [] : [{ body: { ...base, thinking: { type: "enabled" }, reasoning_effort: effort }, effort }]),
    { body: { ...base, thinking: { type: "disabled" } }, effort: "off" as const },
  ];
  try {
    for (const [i, attempt] of attempts.entries()) {
      const last = i === attempts.length - 1;
      const res = await post(attempt.body);
      if (res.status === 400 && !last) continue;
      if (!res.ok) {
        // Status and error code only (never the text or the key), so a wrong model id shows up in the host's logs.
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("deepseek request failed", { status: res.status, model, type: err?.error?.type, code: err?.error?.code });
        throw new DeepSeekError(undefined, `http_${res.status}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: ApiUsage };
      addUsage(usage, data.usage);
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        // Empty reply (reasoning used the budget): retry once without thinking.
        if (!last) continue;
        throw new DeepSeekError("The writing model returned nothing.", "empty");
      }
      return { text, model, effort: attempt.effort, usage, ms: Date.now() - started };
    }
  } catch (e) {
    if (e instanceof DeepSeekError) throw fail(e);
    const name = e instanceof Error ? e.name : "error";
    console.error("deepseek request threw", { name, model });
    throw fail(new DeepSeekError(undefined, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network"));
  }
  throw fail(new DeepSeekError());
}

export type StreamEvent = { type: "delta"; text: string } | { type: "done"; result: ChatResult };

/** Total time the streaming call may take, so two attempts still fit in the route's 120 s limit. */
const STREAM_BUDGET_MS = 110_000;

/**
 * Like deepseekRun, but yields the answer's text as it is written, then a
 * final "done" event with model, effort, usage and time. Reasoning text is
 * never yielded. If the first attempt returns no answer text, one retry
 * without thinking. Throws DeepSeekRunError; once some text has been yielded
 * a failure can't be retried, so it throws instead.
 */
export async function* deepseekStream(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  effort?: ReasoningEffort;
}): AsyncGenerator<StreamEvent> {
  const model = opts.model?.trim() || deepseekModel();
  const effort = opts.effort ?? defaultEffort();
  const usage: ChatUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cacheHitTokens: 0 };
  const started = Date.now();
  const fail = (e: DeepSeekError) => new DeepSeekRunError(e, usage, model, Date.now() - started);
  if (!deepseekEnabled()) throw fail(new DeepSeekError());

  const base: ChatBody = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
  const attempts: { body: ChatBody; effort: ReasoningEffort }[] = [
    ...(effort === "off" ? [] : [{ body: { ...base, thinking: { type: "enabled" }, reasoning_effort: effort }, effort }]),
    { body: { ...base, thinking: { type: "disabled" } }, effort: "off" as const },
  ];
  let yielded = false;
  try {
    for (const [i, attempt] of attempts.entries()) {
      const last = i === attempts.length - 1;
      const left = Math.max(10_000, STREAM_BUDGET_MS - (Date.now() - started));
      const res = await post(attempt.body, left);
      if (res.status === 400 && !last) continue;
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("deepseek stream failed", { status: res.status, model, type: err?.error?.type, code: err?.error?.code });
        throw new DeepSeekError(undefined, `http_${res.status}`);
      }
      let text = "";
      for await (const event of sseEvents(res.body)) {
        const e = event as { choices?: { delta?: { content?: string | null } }[]; usage?: ApiUsage };
        if (e.usage) addUsage(usage, e.usage);
        const piece = e.choices?.[0]?.delta?.content;
        if (piece) {
          text += piece;
          yielded = true;
          yield { type: "delta", text: piece };
        }
      }
      if (!text.trim()) {
        if (!last) continue;
        throw new DeepSeekError("The writing model returned nothing.", "empty");
      }
      yield { type: "done", result: { text: text.trim(), model, effort: attempt.effort, usage, ms: Date.now() - started } };
      return;
    }
  } catch (e) {
    if (e instanceof DeepSeekError) throw fail(e);
    const name = e instanceof Error ? e.name : "error";
    console.error("deepseek stream threw", { name, model, yielded });
    throw fail(new DeepSeekError(undefined, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network"));
  }
  throw fail(new DeepSeekError());
}

/** One chat completion → the reply text. Throws DeepSeekError (generic message) on any failure. */
export async function deepseekChat(opts: { system: string; user: string; maxTokens: number }): Promise<string> {
  return (await deepseekRun(opts)).text;
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
