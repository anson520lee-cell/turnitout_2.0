import "server-only";
import { sseEvents } from "@/lib/sse";

/**
 * Server-side Chat Completions client. Keep keys, user text and raw API
 * errors out of browser responses and application logs.
 */

const DEFAULT_EFFORT = "low" as const;
const TIMEOUT_MS = 55_000; // two attempts must fit in the scan-feedback route's 120 s limit

export function writingModelProvider(): "openai" | "deepseek" {
  return "openai";
}

export function writingModelProviderLabel(): string {
  return writingModelProvider() === "openai" ? "OpenAI" : "DeepSeek";
}

export function writingModelKeyName(): "OPENAI_API_KEY" | "DEEPSEEK_API_KEY" {
  return writingModelProvider() === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY";
}

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
  return Boolean(process.env[writingModelKeyName()]?.trim());
}

export function defaultWritingModel(): string {
  return writingModelProvider() === "openai"
    ? process.env.OPENAI_MODEL?.trim() || "gpt-6-luna"
    : process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
}

type ChatBody = Record<string, unknown>;

async function post(body: ChatBody, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const base = writingModelProvider() === "openai"
    ? "https://api.openai.com/v1"
    : process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env[writingModelKeyName()]?.trim()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "error",
  });
}

export const REASONING_EFFORTS = ["off", "low", "high", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function defaultEffort(): ReasoningEffort {
  const configured = writingModelProvider() === "openai"
    ? process.env.OPENAI_REASONING_EFFORT
    : process.env.DEEPSEEK_REASONING_EFFORT;
  const env = configured?.trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(env ?? "") ? (env as ReasoningEffort) : DEFAULT_EFFORT;
}

function chatAttempts(base: ChatBody, maxTokens: number, effort: ReasoningEffort) {
  const efforts = effort === "off" ? [effort] : [effort, "off" as const];
  const openai = writingModelProvider() === "openai";
  return efforts.map((level) => ({
    effort: level,
    body: openai
      ? { ...base, max_completion_tokens: maxTokens, reasoning_effort: level === "off" ? "none" : level, store: false }
      : {
          ...base,
          max_tokens: maxTokens,
          ...(level === "off"
            ? { thinking: { type: "disabled" } }
            : { thinking: { type: "enabled" }, reasoning_effort: level }),
        },
  }));
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
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

function addUsage(total: ChatUsage, u: ApiUsage | undefined) {
  if (!u) return;
  total.promptTokens += u.prompt_tokens ?? 0;
  total.completionTokens += u.completion_tokens ?? 0;
  total.reasoningTokens += u.completion_tokens_details?.reasoning_tokens ?? 0;
  total.cacheHitTokens += u.prompt_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? 0;
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
    stream: false,
  };
  const attempts = chatAttempts(base, opts.maxTokens, effort);
  try {
    for (const [i, attempt] of attempts.entries()) {
      const last = i === attempts.length - 1;
      const res = await post(attempt.body, opts.timeoutMs);
      if (res.status === 400 && !last) continue;
      if (!res.ok) {
        // Status and error code only (never the text or the key), so a wrong model id shows up in the host's logs.
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("writing model request failed", { status: res.status, model, type: err?.error?.type, code: err?.error?.code });
        throw new WritingModelError(undefined, `http_${res.status}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string | null }[]; usage?: ApiUsage };
      addUsage(usage, data.usage);
      const text = data.choices?.[0]?.message?.content?.trim();
      const cut = data.choices?.[0]?.finish_reason === "length";
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
    stream: true,
    stream_options: { include_usage: true },
  };
  const attempts = chatAttempts(base, opts.maxTokens, effort);
  let yielded = false;
  try {
    for (const [i, attempt] of attempts.entries()) {
      const last = i === attempts.length - 1;
      const left = Math.max(10_000, STREAM_BUDGET_MS - (Date.now() - started));
      const res = await post(attempt.body, left);
      if (res.status === 400 && !last) continue;
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
        console.error("writing model stream failed", { status: res.status, model, type: err?.error?.type, code: err?.error?.code });
        throw new WritingModelError(undefined, `http_${res.status}`);
      }
      let text = "";
      let cut = false;
      for await (const event of sseEvents(res.body)) {
        const e = event as { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; usage?: ApiUsage };
        if (e.usage) addUsage(usage, e.usage);
        if (e.choices?.[0]?.finish_reason === "length") cut = true;
        const piece = e.choices?.[0]?.delta?.content;
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
      yield { type: "done", result: { text: text.trim(), model, effort: attempt.effort, usage, truncated: cut, ms: Date.now() - started } };
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
