import "server-only";
import { sseEvents } from "@/lib/sse";

/**
 * OpenAI, called from the server only. OPENAI_API_KEY never reaches the
 * browser, and neither the text sent nor the provider's raw errors are logged
 * or shown to users: callers get a short generic message.
 *
 * Model and reasoning effort: the owner's choice on /admin/prompt wins, then
 * OPENAI_MODEL / OPENAI_REASONING_EFFORT in Vercel, then the defaults below.
 */

const COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_EFFORT = "low" as const;
const TIMEOUT_MS = 55_000; // two attempts must fit in the scan-feedback route's 120 s limit

export class WritingModelError extends Error {
  /** Short machine-readable cause (e.g. "http_402", "timeout", "empty"); safe to show: no text, no key. */
  readonly reason: string;
  constructor(message = "The writing model is unavailable right now.", reason = "unavailable") {
    super(message);
    this.name = "WritingModelError";
    this.reason = reason;
  }
}

export function writingModelEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function defaultWritingModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

type ChatBody = Record<string, unknown>;

async function post(body: ChatBody, timeoutMs = TIMEOUT_MS): Promise<Response> {
  return fetch(COMPLETIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "error",
  });
}

export const REASONING_EFFORTS = ["off", "low", "high", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function defaultEffort(): ReasoningEffort {
  const env = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(env ?? "") ? (env as ReasoningEffort) : DEFAULT_EFFORT;
}

function completionAttempts(base: ChatBody, effort: ReasoningEffort) {
  const efforts = effort === "off" ? [effort] : [effort, "off" as const];
  return efforts.map(level => ({ body: { ...base, reasoning_effort: level === "off" ? "none" : level }, effort: level }));
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
  /** The model hit the output limit before it finished: the text ends mid-way. */
  truncated: boolean;
  ms: number;
}

/** Failure details for the usage log: the reason plus whatever the attempts cost. */
export class WritingModelRunError extends WritingModelError {
  readonly usage: ChatUsage;
  readonly model: string;
  readonly ms: number;
  constructor(cause: WritingModelError, usage: ChatUsage, model: string, ms: number) {
    super(cause.message, cause.reason);
    this.usage = usage;
    this.model = model;
    this.ms = ms;
  }
}

type ApiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

function addUsage(total: ChatUsage, u: ApiUsage | undefined) {
  if (!u) return;
  total.promptTokens += u.prompt_tokens ?? 0;
  total.completionTokens += u.completion_tokens ?? 0;
  total.reasoningTokens += u.completion_tokens_details?.reasoning_tokens ?? 0;
  total.cacheHitTokens += u.prompt_tokens_details?.cached_tokens ?? 0;
}

/**
 * One chat completion with details (model, effort used, token usage, time).
 * Thinking at `effort` first; if the API rejects that option or the reasoning
 * leaves no answer, one retry with thinking off. effort "off" skips straight
 * to that. Throws WritingModelRunError (generic message + reason) on failure.
 */
export async function runWritingModel(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  effort?: ReasoningEffort;
  /** Per-attempt time limit; the default suits a route that may run two attempts inside 120 s. */
  timeoutMs?: number;
  /** Wall-clock budget shared by the thinking request and its fallback. */
  totalTimeoutMs?: number;
}): Promise<ChatResult> {
  const model = opts.model?.trim() || defaultWritingModel();
  const effort = opts.effort ?? defaultEffort();
  const usage: ChatUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cacheHitTokens: 0 };
  const started = Date.now();
  const fail = (e: WritingModelError) => new WritingModelRunError(e, usage, model, Date.now() - started);
  if (!writingModelEnabled()) throw fail(new WritingModelError());

  const base: ChatBody = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens,
    store: false,
    stream: false,
  };
  const attempts = completionAttempts(base, effort);
  try {
    for (const [i, attempt] of attempts.entries()) {
      const last = i === attempts.length - 1;
      const remaining = opts.totalTimeoutMs === undefined ? undefined : opts.totalTimeoutMs - (Date.now() - started);
      if (remaining !== undefined && remaining <= 0) throw new WritingModelError(undefined, "timeout");
      const res = await post(attempt.body, remaining === undefined ? opts.timeoutMs : Math.min(opts.timeoutMs ?? TIMEOUT_MS, remaining));
      if (res.status === 400 && !last) continue;
      if (!res.ok) {
        // Status and error code only (never the text or the key), so a wrong model id shows up in the host's logs.
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("writing model request failed", { status: res.status, model, type: err?.error?.type, code: err?.error?.code });
        throw new WritingModelError(undefined, `http_${res.status}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[]; usage?: ApiUsage };
      addUsage(usage, data.usage);
      const choice = data.choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new WritingModelError(undefined, "refused");
      const text = choice?.message?.content?.trim();
      const cut = choice?.finish_reason === "length";
      // Empty reply, or cut off mid-way (reasoning used up the budget): retry once without thinking.
      if ((!text || cut) && !last) continue;
      if (!text) throw new WritingModelError("The writing model returned nothing.", "empty");
      return { text, model, effort: attempt.effort, usage, truncated: cut, ms: Date.now() - started };
    }
  } catch (e) {
    if (e instanceof WritingModelError) throw fail(e);
    const name = e instanceof Error ? e.name : "error";
    console.error("writing model request threw", { name, model });
    throw fail(new WritingModelError(undefined, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network"));
  }
  throw fail(new WritingModelError());
}

export type StreamEvent = { type: "delta"; text: string } | { type: "done"; result: ChatResult };

/** Total time the streaming call may take, so two attempts still fit in the route's 120 s limit. */
const STREAM_BUDGET_MS = 110_000;

/**
 * Like runWritingModel, but yields the answer's text as it is written, then a
 * final "done" event with model, effort, usage and time. Reasoning text is
 * never yielded. If the first attempt returns no answer text, one retry
 * without thinking. Throws WritingModelRunError; once some text has been yielded
 * a failure can't be retried, so it throws instead.
 */
export async function* streamWritingModel(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  effort?: ReasoningEffort;
}): AsyncGenerator<StreamEvent> {
  const model = opts.model?.trim() || defaultWritingModel();
  const effort = opts.effort ?? defaultEffort();
  const usage: ChatUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cacheHitTokens: 0 };
  const started = Date.now();
  const fail = (e: WritingModelError) => new WritingModelRunError(e, usage, model, Date.now() - started);
  if (!writingModelEnabled()) throw fail(new WritingModelError());

  const base: ChatBody = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens,
    store: false,
    stream: true,
    stream_options: { include_usage: true },
  };
  const attempts = completionAttempts(base, effort);
  let yielded = false;
  try {
    for (const [i, attempt] of attempts.entries()) {
      const last = i === attempts.length - 1;
      const left = STREAM_BUDGET_MS - (Date.now() - started);
      if (left <= 0) throw new WritingModelError(undefined, "timeout");
      const res = await post(attempt.body, left);
      if (res.status === 400 && !last) continue;
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("writing model stream failed", { status: res.status, model, type: err?.error?.type, code: err?.error?.code });
        throw new WritingModelError(undefined, `http_${res.status}`);
      }
      let text = "";
      let finish: string | null | undefined;
      for await (const event of sseEvents(res.body)) {
        const e = event as { choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[]; usage?: ApiUsage };
        if (e.usage) addUsage(usage, e.usage);
        const choice = e.choices?.[0];
        finish = choice?.finish_reason || finish;
        if (choice?.delta?.refusal || finish === "content_filter") throw new WritingModelError(undefined, "refused");
        const piece = choice?.delta?.content;
        if (piece) {
          text += piece;
          yielded = true;
          yield { type: "delta", text: piece };
        }
      }
      if (!text.trim()) {
        if (!last) continue;
        throw new WritingModelError("The writing model returned nothing.", "empty");
      }
      yield { type: "done", result: { text: text.trim(), model, effort: attempt.effort, usage, truncated: finish !== "stop", ms: Date.now() - started } };
      return;
    }
  } catch (e) {
    if (e instanceof WritingModelError) throw fail(e);
    const name = e instanceof Error ? e.name : "error";
    console.error("writing model stream threw", { name, model, yielded });
    throw fail(new WritingModelError(undefined, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network"));
  }
  throw fail(new WritingModelError());
}
