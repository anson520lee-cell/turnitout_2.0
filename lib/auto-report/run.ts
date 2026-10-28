import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, deepseekRun } from "@/lib/deepseek";
import { chunkText } from "@/lib/chunking";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall, paidPieceLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import { refundFreeReport } from "@/lib/free-report";
import { DIRECT_PAY_METHODS } from "@/config/payments";
import { toCredits } from "@/config/pricing";
import { shortId } from "@/lib/utils";
import { creditsHeldFor } from "@/lib/orders/held-credits";
import { PIECE_SIZE, stitchReport, type AutoReportResult, type PieceAnswer } from "./stitch";
import { reportBasis, textHash } from "./reuse";

/**
 * Works on an automatic report: reviews the pieces that have no answer yet (a few
 * at a time, inside a time budget), and when every piece is done stitches them
 * into the report and completes the order. Safe to call again and again: each
 * call carries on from what is saved, and only one call works on a report at a time.
 */

const CONCURRENCY = 6;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 100_000;
/** No new piece starts after this long into a call, so a call ends inside the route's 120 s even when a piece is slow. */
const START_BEFORE_MS = 30_000;

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
  return found.find((r) => own.has(r.order_id) && r.result.pieces.reviewed >= r.result.pieces.total)?.result ?? null;
}

export async function advanceAutoReport(orderId: string): Promise<ReportState> {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("id,user_id,status,price,source_text").eq("id", orderId).maybeSingle<OrderRow>();
  const empty = { reviewed: 0, total: 0 };
  if (!order) return { state: "failed", ...empty };
  const text = order.source_text ?? "";
  const chunks = text ? chunkText(text, PIECE_SIZE) : [];
  const total = chunks.length;

  const { data: report } = await db.from("auto_reports").select("status").eq("order_id", orderId).maybeSingle<{ status: string }>();
  if (report?.status === "done" || order.status === "completed") return { state: "done", reviewed: total, total };
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
  const { data: leased } = await db
    .from("auto_reports")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: now.toISOString() })
    .eq("order_id", orderId)
    .eq("status", "running")
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("order_id");
  const progress = async () => {
    const { data } = await db.from("auto_report_pieces").select("idx").eq("order_id", orderId).eq("ok", true);
    return data?.length ?? 0;
  };
  if (!leased?.length) return { state: "running", reviewed: await progress(), total };
  if (order.status !== "screening") {
    await db.from("orders").update({ status: "screening", updated_at: now.toISOString() }).eq("id", orderId).in("status", ["paid", "queued"]);
  }

  const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
  const hash = textHash(text);
  const basis = reportBasis({ prompt: [prompt, DRAFT_GUARD].join("\n\n"), model: setting.model, effort: setting.effort, pieceSize: PIECE_SIZE });

  const { data: have } = await db.from("auto_report_pieces").select("idx,ok,attempts").eq("order_id", orderId);
  // The same text checked again by the same account shows the first result again, with no new review. The order page
  // still plays the whole scan; it only replays a finished result either way.
  if (!have?.length) {
    const first = await earlierResult(order.user_id, orderId, hash, basis);
    if (first) {
      const at = new Date().toISOString();
      await db.from("auto_reports").update({ status: "done", result: first, lease_until: null, updated_at: at }).eq("order_id", orderId);
      await db.from("orders").update({ status: "completed", completed_at: at, updated_at: at }).eq("id", orderId).eq("status", "screening");
      await audit("report_completed", { orderId, detail: { pieces: total, reused: true } });
      return { state: "done", reviewed: total, total };
    }
  }
  const rows = new Map((have ?? []).map((r: { idx: number; ok: boolean; attempts: number }) => [r.idx, r]));
  const todo = chunks.map((_, idx) => idx).filter((idx) => !rows.get(idx)?.ok && (rows.get(idx)?.attempts ?? 0) < MAX_ATTEMPTS);

  let paused = false;
  if (todo.length) {
    if (!deepseekEnabled()) {
      await db.from("auto_reports").update({ lease_until: null }).eq("order_id", orderId);
      await failReport(orderId, "reviewer not configured");
      return { state: "failed", reviewed: 0, total };
    }
    if (await paidPieceLimitReached()) {
      paused = true;
    } else {
      const started = Date.now();
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
          while (next < todo.length && Date.now() - started < START_BEFORE_MS) {
            const idx = todo[next++];
            const attempts = (rows.get(idx)?.attempts ?? 0) + 1;
            const row = { order_id: orderId, idx, attempts, updated_at: new Date().toISOString() };
            try {
              const result = await deepseekRun({
                system: [prompt, DRAFT_GUARD].join("\n\n"),
                user: ["<draft>", chunks[idx].text, "</draft>"].join("\n"),
                maxTokens: 24_000,
                model: setting.model,
                effort: setting.effort,
                timeoutMs: 80_000,
              });
              await logModelCall("paid_report", { ok: true, result });
              await db.from("auto_report_pieces").upsert({ ...row, report: result.text, ok: !result.truncated, truncated: result.truncated, ms: result.ms }, { onConflict: "order_id,idx" });
            } catch (e) {
              if (e instanceof DeepSeekRunError) await logModelCall("paid_report", { ok: false, error: e });
              else if (!(e instanceof DeepSeekError)) console.error("auto report piece failed", e);
              await db.from("auto_report_pieces").upsert({ ...row, ok: false }, { onConflict: "order_id,idx" });
            }
          }
        }),
      );
    }
  }

  const { data: done } = await db.from("auto_report_pieces").select("idx,report,ok,truncated,attempts").eq("order_id", orderId);
  const answers: PieceAnswer[] = (done ?? []).filter((r: { ok: boolean }) => r.ok);
  const reviewed = answers.length;
  if (reviewed >= total) {
    const result = { ...stitchReport(text, answers, PIECE_SIZE), reuse: { text: hash, basis } };
    const at = new Date().toISOString();
    await db.from("auto_reports").update({ status: "done", result, lease_until: null, updated_at: at }).eq("order_id", orderId);
    await db.from("orders").update({ status: "completed", completed_at: at, updated_at: at }).eq("id", orderId).eq("status", "screening");
    // The pieces were only there to resume an interrupted report.
    await db.from("auto_report_pieces").delete().eq("order_id", orderId);
    await audit("report_completed", { orderId, detail: { pieces: total } });
    return { state: "done", reviewed, total };
  }
  const stuck = (done ?? []).some((r: { ok: boolean; attempts: number }) => !r.ok && r.attempts >= MAX_ATTEMPTS);
  if (stuck && !paused) {
    await failReport(orderId, "a piece could not be reviewed");
    return { state: "failed", reviewed, total };
  }
  await db.from("auto_reports").update({ lease_until: null }).eq("order_id", orderId);
  return { state: "running", reviewed, total, ...(paused ? { paused: "daily_limit" as const } : {}) };
}
