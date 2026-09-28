import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { localModel } from "@/config/app";
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

export function localModelEnabled(): boolean {
  return isSupabaseConfigured && (process.env.MODEL_WORKER_SECRET ?? "").length >= MIN_SECRET_LENGTH;
}

/** Checks the worker's `Authorization: Bearer …` header in constant time. */
export function isWorkerRequest(authorization: string | null): boolean {
  const secret = process.env.MODEL_WORKER_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH || !authorization?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization.slice(7)), digest(secret));
}

export async function workerStatus(): Promise<WorkerStatus> {
  const offline: WorkerStatus = { online: false, lastSeenAt: null, model: null };
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
  if (!localModelEnabled()) return { ok: false, message: "The local model isn't set up (MODEL_WORKER_SECRET)." };
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
    const { error } = await db.from("model_jobs").insert({
      kind: "refinement_draft",
      order_id: orderId,
      expires_at: new Date(Date.now() + localModel.draftDays * 86_400_000).toISOString(),
    });
    // 23505: the one-open-draft index caught a request racing this one.
    if (error) return { ok: false, message: error.code === "23505" ? "A draft is already waiting or being written." : "Couldn't queue the draft." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't queue the draft." };
  }
}

/** The latest draft job for an order (admin pages only). */
export async function latestDraft(orderId: string): Promise<DraftJob | null> {
  if (!localModelEnabled()) return null;
  const { data } = await createAdminClient()
    .from("model_jobs")
    .select("id,status,output_text,error,model,attempts,created_at,finished_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DraftJob>();
  return data;
}
