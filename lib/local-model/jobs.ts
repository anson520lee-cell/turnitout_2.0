import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { deepseekChat, deepseekEnabled, deepseekModel } from "@/lib/deepseek";
import { localModel } from "@/config/app";
import { audit } from "@/lib/audit";
import { notifyOwner } from "@/lib/notify";
import { shortId } from "@/lib/utils";
import { REFINEMENT_DRAFT_PROMPT, refinementPrompt } from "./prompts";
import type { DraftJob, WorkerStatus } from "./types";

/**
 * The job queue between this site and the owner's local model (migration
 * 0003, worker in tools/local-model-worker). The worker polls
 * /api/model-worker/*, runs Open WebUI and posts results back.
 *
 * Off unless MODEL_WORKER_SECRET is set. Nothing here throws into a caller:
 * a scan or a payment never fails because the model side is unavailable.
 */

const MIN_SECRET_LENGTH = 24;

/** True when refinement drafts can be written: DeepSeek is configured, or the local worker is. */
export function localModelEnabled(): boolean {
  return isSupabaseConfigured && (deepseekEnabled() || workerSecretSet());
}

function workerSecretSet(): boolean {
  return (process.env.MODEL_WORKER_SECRET ?? "").length >= MIN_SECRET_LENGTH;
}

/** Checks the worker's `Authorization: Bearer …` header in constant time. */
export function isWorkerRequest(authorization: string | null): boolean {
  const secret = process.env.MODEL_WORKER_SECRET ?? "";
  if (!workerSecretSet() || secret.length < MIN_SECRET_LENGTH || !authorization?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization.slice(7)), digest(secret));
}

export async function workerStatus(): Promise<WorkerStatus> {
  const offline: WorkerStatus = { online: false, lastSeenAt: null, model: null };
  if (deepseekEnabled()) return { online: true, lastSeenAt: new Date().toISOString(), model: deepseekModel() };
  if (!localModelEnabled()) return offline;
  try {
    const { data } = await createAdminClient()
      .from("model_worker")
      .select("last_seen_at,model")
      .maybeSingle<{ last_seen_at: string; model: string | null }>();
    if (!data) return offline;
    const age = Date.now() - new Date(data.last_seen_at).getTime();
    return { online: age < localModel.onlineWindowSeconds * 1000, lastSeenAt: data.last_seen_at, model: data.model };
  } catch {
    return offline;
  }
}

/**
 * Queues written feedback for a free scan, only while the worker is online
 * and not already behind. Returns the job id the browser polls with, or null
 * when there will be no feedback (the scan result stands on its own).
 */
export async function enqueueScanFeedback(text: string): Promise<string | null> {
  if (!localModelEnabled() || !localModel.scanFeedback) return null;
  try {
    if (!(await workerStatus()).online) return null;
    const db = createAdminClient();
    await db.rpc("purge_model_jobs");
    const { count } = await db
      .from("model_jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "scan_feedback")
      .eq("status", "queued");
    if ((count ?? 0) >= localModel.maxQueuedFeedback) return null;
    const { data, error } = await db
      .from("model_jobs")
      .insert({
        kind: "scan_feedback",
        input_text: text,
        expires_at: new Date(Date.now() + localModel.scanFeedbackMinutes * 60_000).toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

/**
 * Queues a first draft for a paid refinement order. The text stays on the
 * order and is read when the worker claims the job. Replaces earlier
 * finished drafts for the order. Returns a message when it can't queue.
 */
export async function enqueueRefinementDraft(orderId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!localModelEnabled()) return { ok: false, message: "The writing model isn't set up (DEEPSEEK_API_KEY)." };
  try {
    const db = createAdminClient();
    const { data: open } = await db
      .from("model_jobs")
      .select("id")
      .eq("order_id", orderId)
      .in("status", ["queued", "running"])
      .limit(1);
    if (open?.length) return { ok: false, message: "A draft is already waiting or being written." };
    await db.from("model_jobs").delete().eq("order_id", orderId).in("status", ["done", "failed"]);
    const viaDeepseek = deepseekEnabled();
    const { data: job, error } = await db
      .from("model_jobs")
      .insert({
        kind: "refinement_draft",
        order_id: orderId,
        expires_at: new Date(Date.now() + localModel.draftDays * 86_400_000).toISOString(),
        ...(viaDeepseek ? { status: "running", claimed_at: new Date().toISOString(), attempts: 1, model: deepseekModel() } : {}),
      })
      .select("id")
      .single<{ id: string }>();
    // 23505: the one-open-draft index caught a request racing this one.
    if (error || !job) return { ok: false, message: error?.code === "23505" ? "A draft is already waiting or being written." : "Couldn't queue the draft." };
    if (viaDeepseek) after(() => writeDraftWithDeepseek(job.id, orderId));
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't queue the draft." };
  }
}

const CHUNK_CHARS = 6000;

/** Splits on blank lines so a chunk never cuts a paragraph; one huge paragraph is cut at the limit. */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split(/(\n\s*\n)/)) {
    if (current.length + para.length > CHUNK_CHARS && current) {
      chunks.push(current);
      current = "";
    }
    let rest = para;
    while (rest.length > CHUNK_CHARS) {
      chunks.push(rest.slice(0, CHUNK_CHARS));
      rest = rest.slice(CHUNK_CHARS);
    }
    current += rest;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

/** Writes the draft for a running job. Never throws; a failure is recorded on the job with a generic message. */
async function writeDraftWithDeepseek(jobId: string, orderId: string): Promise<void> {
  const db = createAdminClient();
  const fail = async (reason: string) => {
    await db
      .from("model_jobs")
      .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "running");
  };
  try {
    const { data: order } = await db
      .from("orders")
      .select("source_text,instructions")
      .eq("id", orderId)
      .maybeSingle<{ source_text: string | null; instructions: string | null }>();
    if (!order?.source_text) return await fail("The order's text was deleted before the draft was written.");
    const system = order.instructions ? refinementPrompt(order.instructions) : REFINEMENT_DRAFT_PROMPT;
    const chunks = chunkText(order.source_text);
    const out: string[] = [];
    // Sections are written one after another to keep within the provider's rate limits and keep order.
    for (const chunk of chunks) {
      out.push(await deepseekChat({ system, user: `<text>\n${chunk}\n</text>`, maxTokens: 8000 }));
    }
    const output = out.join("\n\n").trim();
    if (!output || output.length > localModel.maxDraftChars) return await fail("The model returned nothing usable.");
    const { data: saved } = await db
      .from("model_jobs")
      .update({ status: "done", output_text: output, error: null, finished_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "running")
      .select("id");
    if (saved?.length) {
      await audit("model_draft_ready", { orderId, detail: { chars: output.length } });
      notifyOwner("draft_ready", { order: shortId(orderId), characters: output.length });
    }
  } catch {
    await fail("The writing model couldn't write this draft. Try again.").catch(() => {});
  }
}

/** The latest draft job for an order (admin pages only). */
export async function latestDraft(orderId: string): Promise<DraftJob | null> {
  if (!localModelEnabled()) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("model_jobs")
    .select("id,status,output_text,error,model,attempts,created_at,finished_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DraftJob>();
  // A direct DeepSeek draft that never reported back (the function was cut off) isn't "being written" forever.
  if (data?.status === "running" && deepseekEnabled() && Date.now() - new Date(data.created_at).getTime() > 15 * 60_000) {
    const error = "The draft didn't finish. Ask for a new one.";
    await db.from("model_jobs").update({ status: "failed", error, finished_at: new Date().toISOString() }).eq("id", data.id).eq("status", "running");
    return { ...data, status: "failed", error };
  }
  return data;
}
