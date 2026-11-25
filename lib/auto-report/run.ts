import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { WritingModelError, WritingModelRunError, writingModelEnabled } from "@/lib/writing-model";
import { logModelCall, paidPieceLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import { refundFreeReport } from "@/lib/free-report";
import { DIRECT_PAY_METHODS } from "@/config/payments";
import { toCredits } from "@/config/pricing";
import { shortId } from "@/lib/utils";
import { creditsHeldFor } from "@/lib/orders/held-credits";
import { PIECE_SIZE, type AutoReportResult, type PieceRead } from "./stitch";
import { reportBasis, textHash } from "./reuse";
import { parseReviewPiece, prepareReview, reviewSystem } from "./review";
import { finishProductionReview, REVIEW_CONTEXT_CHARS, requestReviewPiece, REVIEW_CONCURRENCY } from "./review-model";
import { calibrateReview } from "./calibration";

/**
 * Works on an automatic report: reviews the pieces that have no answer yet (a few
 * at a time, inside a time budget), and when every piece is done stitches them
 * into the report and completes the order. Safe to call again and again: each
 * call carries on from what is saved, and only one call works on a report at a time.
 */

const MAX_ATTEMPTS = 3;
const LEASE_MS = 115_000;
/** No new piece starts after this long into a call, so a call ends inside the route's 120 s even when a piece is slow. */
const START_BEFORE_MS = 25_000;

export type ReportState =
  | { state: "running"; reviewed: number; total: number; paused?: "daily_limit" }
  | { state: "done"; reviewed: number; total: number }
  | { state: "failed"; reviewed: number; total: number };

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  price: number;
  source_text: string | null;
}

interface StoredPiece {
  idx: number;
  report: string;
  ok: boolean;
  truncated: boolean;
  attempts: number;
}

function pieceEnvelope(report: string): { basis: string; output: string } | null {
  try {
    const value = JSON.parse(report);
    return typeof value?.basis === "string" && typeof value?.output === "string" ? value : null;
  } catch {
    return null;
  }
}

async function failReport(orderId: string, reason: string): Promise<void> {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("id,user_id,price,status").eq("id", orderId).maybeSingle<OrderRow>();
  const now = new Date().toISOString();
  await db.from("auto_reports").update({ status: "failed", error: reason, lease_until: null, updated_at: now }).eq("order_id", orderId);
  if (!order || order.status === "cancelled") return;
  // Only the call that actually cancels the order refunds it: two calls failing at once must not refund twice.
  const { data: moved } = await db
    .from("orders")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", orderId)
    .neq("status", "cancelled")
    .select("id");
  if (!moved?.length) return;
  // Nothing was delivered: give back what the customer paid, as credits (an owner test order paid nothing). An order
  // paid directly by Alipay gets the same number of credits its price was worth.
  const { data: paid } = await db
    .from("payments")
    .select("id,provider,provider_payment_id")
    .eq("order_id", orderId)
    .in("provider", ["credits", ...DIRECT_PAY_METHODS])
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle<{ id: string; provider: string; provider_payment_id: string }>();
  let refund = paid ? toCredits(order.price) : 0;
  if (paid && paid.provider !== "credits") {
    // Started before the Alipay payment was checked: refund now only the credits used first. The Alipay part is
    // refunded when the admin finds the payment (confirmPaymentClaim), never for a number nobody paid.
    const { data: claim } = await db.from("payment_claims").select("status").eq("id", paid.provider_payment_id).maybeSingle<{ status: string }>();
    if (claim?.status === "pending") refund = await creditsHeldFor(orderId);
  }
  if (refund > 0) {
    await db.rpc("credit_add", {
      p_user: order.user_id,
      p_amount: refund,
      p_kind: "refund",
      p_order: orderId,
      p_topup: null,
      p_note: `Refund: report ${shortId(orderId)} could not be completed`,
    });
  }
  // A daily free report that could not be made gives the day's allowance back.
  const freeBack = await refundFreeReport(orderId);
  await db.from("auto_report_pieces").delete().eq("order_id", orderId);
  await audit("report_failed", { orderId, detail: { reason, refunded: refund > 0 || freeBack, credits: refund } });
}

/**
 * The first finished report of exactly this text made by this account with the same prompt, model and settings, if
 * there is one. Only a complete report counts. The re-check of a Writing Refinement counts too (rewrite-check.ts):
 * it reviewed exactly the revised text, so pasting that text into a new report shows the same result again.
 */
export async function earlierResult(userId: string, orderId: string, hash: string, basis: string): Promise<AutoReportResult | null> {
  const db = createAdminClient();
  const [{ data: same }, { data: checked }] = await Promise.all([
    db
      .from("auto_reports")
      .select("order_id,result")
      .eq("status", "done")
      .eq("result->reuse->>text", hash)
      .eq("result->reuse->>basis", basis)
      .neq("order_id", orderId)
      .not("result", "is", null)
      .order("created_at", { ascending: true })
      .limit(50)
      .returns<{ order_id: string; result: AutoReportResult }[]>(),
    db
      .from("auto_reports")
      .select("order_id,rewrite")
      .eq("rewrite->check->result->reuse->>text", hash)
      .eq("rewrite->check->result->reuse->>basis", basis)
      .order("created_at", { ascending: true })
      .limit(50)
      .returns<{ order_id: string; rewrite: { check: { result: AutoReportResult } } }[]>(),
  ]);
  const found = [...(same ?? []), ...(checked ?? []).map((r) => ({ order_id: r.order_id, result: r.rewrite.check.result }))];
  if (!found.length) return null;
  // Only this account's own earlier reports count: another account never gets a result made for someone else.
  const { data: mine } = await db.from("orders").select("id").eq("user_id", userId).in("id", found.map((r) => r.order_id)).returns<{ id: string }[]>();
  const own = new Set((mine ?? []).map((o) => o.id));
  const report = found.find((r) => own.has(r.order_id) && r.result.reviewFormat === 1
    && r.result.pieces.total > 0 && r.result.pieces.reviewed === r.result.pieces.total)?.result;
  // A scorer update can reuse the validated labels without another provider call.
  return report ? calibrateReview(report) : null;
}

export async function advanceAutoReport(orderId: string): Promise<ReportState> {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("id,user_id,status,price,source_text").eq("id", orderId).maybeSingle<OrderRow>();
  const empty = { reviewed: 0, total: 0 };
  if (!order) return { state: "failed", ...empty };
  const text = order.source_text ?? "";
  const review = prepareReview(text, PIECE_SIZE, REVIEW_CONTEXT_CHARS);
  const total = review.pieces.length;

  const { data: report } = await db.from("auto_reports").select("status").eq("order_id", orderId).maybeSingle<{ status: string }>();
  if (report?.status === "done") {
    if (order.status === "screening") {
      await db.from("orders").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", orderId).eq("status", "screening");
    }
    return { state: "done", reviewed: total, total };
  }
  if (order.status === "completed") return { state: "done", reviewed: total, total };
  if (report?.status === "failed" || order.status === "cancelled") return { state: "failed", reviewed: 0, total };
  if (!["paid", "queued", "screening"].includes(order.status)) return { state: "running", ...empty, total };
  if (!total) {
    await failReport(orderId, "no text");
    return { state: "failed", ...empty };
  }
  if (!report) {
    await db.from("auto_reports").upsert({ order_id: orderId, piece_size: PIECE_SIZE, total_pieces: total }, { onConflict: "order_id", ignoreDuplicates: true });
  }

  // One worker per report: take the lease or leave it to whoever has it.
  const now = new Date();
  const lease = new Date(now.getTime() + LEASE_MS).toISOString();
  const { data: leased } = await db
    .from("auto_reports")
    .update({ lease_until: lease, total_pieces: total, updated_at: now.toISOString() })
    .eq("order_id", orderId)
    .eq("status", "running")
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("order_id");
  const progress = async () => {
    const { data } = await db.from("auto_report_pieces").select("idx,report").eq("order_id", orderId).eq("ok", true).eq("truncated", false);
    return (data ?? []).filter(row => {
      const saved = pieceEnvelope(row.report);
      return saved && review.pieces[row.idx] && parseReviewPiece(review.pieces[row.idx], saved.output);
    }).length;
  };
  if (!leased?.length) return { state: "running", reviewed: await progress(), total };
  const release = () => db.from("auto_reports").update({ lease_until: null }).eq("order_id", orderId).eq("lease_until", lease);
  if (order.status !== "screening") {
    await db.from("orders").update({ status: "screening", updated_at: now.toISOString() }).eq("id", orderId).in("status", ["paid", "queued"]);
  }

  const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  const hash = textHash(text);
  const system = reviewSystem(prompt, true);
  const basis = reportBasis({ prompt: system, model: setting.model, effort: setting.effort, pieceSize: PIECE_SIZE });

  const { data: have, error: piecesError } = await db.from("auto_report_pieces").select("idx,report,ok,truncated,attempts").eq("order_id", orderId).returns<StoredPiece[]>();
  if (piecesError) {
    await release();
    return { state: "running", reviewed: 0, total };
  }
  const attemptsByPiece = new Map<number, number>();
  const reads = new Map<number, PieceRead>();
  for (const row of have ?? []) {
    const piece = review.pieces[row.idx];
    const saved = pieceEnvelope(row.report);
    if (!piece || saved?.basis !== basis) continue;
    attemptsByPiece.set(row.idx, row.attempts);
    const read = row.ok && !row.truncated ? parseReviewPiece(piece, saved.output) : null;
    if (read) reads.set(row.idx, read);
  }
  // The same text checked again by the same account shows the first result again, with no new review. The order page
  // still plays the whole scan; it only replays a finished result either way.
  let result = finishProductionReview(review, reads);
  let reused = false;
  if (!attemptsByPiece.size) {
    const first = await earlierResult(order.user_id, orderId, hash, basis);
    if (first) {
      result = first;
      reused = true;
    }
  }
  const todo = review.pieces.map((_, idx) => idx).filter(idx => !reads.has(idx) && (attemptsByPiece.get(idx) ?? 0) < MAX_ATTEMPTS);

  let paused = false;
  if (!result && todo.length) {
    if (!writingModelEnabled()) {
      await failReport(orderId, "reviewer not configured");
      return { state: "failed", reviewed: 0, total };
    }
    if (await paidPieceLimitReached()) {
      paused = true;
    } else {
      const started = Date.now();
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(REVIEW_CONCURRENCY, todo.length) }, async () => {
          while (next < todo.length && Date.now() - started < START_BEFORE_MS) {
            const idx = todo[next++];
            const attempts = (attemptsByPiece.get(idx) ?? 0) + 1;
            const row = { order_id: orderId, idx, attempts, updated_at: new Date().toISOString() };
            let read: PieceRead | null = null;
            let output = "";
            let truncated = false;
            let ms = 0;
            try {
              const check = await requestReviewPiece(review.pieces[idx], system, setting);
              await logModelCall("paid_report", { ok: true, result: check.result });
              read = check.read;
              if (read) output = check.result.text;
              truncated = check.result.truncated;
              ms = check.result.ms;
            } catch (e) {
              if (e instanceof WritingModelRunError) await logModelCall("paid_report", { ok: false, error: e });
              else if (!(e instanceof WritingModelError)) console.error("auto report piece failed", e);
            }
            const { error } = await db.from("auto_report_pieces").upsert({
              ...row, report: JSON.stringify({ basis, output }), ok: Boolean(read), truncated, ms,
            }, { onConflict: "order_id,idx" });
            if (!error) {
              attemptsByPiece.set(idx, attempts);
              if (read) reads.set(idx, read);
            }
          }
        }),
      );
    }
  }

  const reviewed = reads.size;
  result ??= finishProductionReview(review, reads);
  if (result) {
    const at = new Date().toISOString();
    const { data: saved } = await db.from("auto_reports")
      .update({ status: "done", result: { ...result, reuse: { text: hash, basis } }, lease_until: null, updated_at: at })
      .eq("order_id", orderId).eq("status", "running").eq("lease_until", lease).select("order_id");
    if (!saved?.length) {
      await release();
      return { state: "running", reviewed, total };
    }
    await db.from("orders").update({ status: "completed", completed_at: at, updated_at: at }).eq("id", orderId).eq("status", "screening");
    // The pieces were only there to resume an interrupted report.
    await db.from("auto_report_pieces").delete().eq("order_id", orderId);
    await audit("report_completed", { orderId, detail: { pieces: total, ...(reused ? { reused: true } : {}) } });
    return { state: "done", reviewed, total };
  }
  const stuck = [...attemptsByPiece].some(([idx, attempts]) => !reads.has(idx) && attempts >= MAX_ATTEMPTS);
  if (stuck && !paused) {
    await failReport(orderId, "a piece could not be reviewed");
    return { state: "failed", reviewed, total };
  }
  await release();
  return { state: "running", reviewed, total, ...(paused ? { paused: "daily_limit" as const } : {}) };
}
