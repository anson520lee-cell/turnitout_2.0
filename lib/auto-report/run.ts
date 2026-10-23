import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, deepseekRun } from "@/lib/deepseek";
import { chunkText } from "@/lib/chunking";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall, paidPieceLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import { refundFreeReport } from "@/lib/free-report";
import { toCredits } from "@/config/pricing";
import { shortId } from "@/lib/utils";
import { classifierPrimary, detectAi, detectSentences, warmDetector } from "@/lib/detector";
import { splitSentences } from "@/lib/recheck";
import { classifierReport, withReasons } from "./classifier-report";
import { PIECE_SIZE, headlineScore, overallForScore, stitchReport, type PieceAnswer } from "./stitch";

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
  await db.from("orders").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", orderId);
  // Nothing was delivered: give back credits the customer paid (an owner test order paid nothing).
  const { data: paid } = await db.from("payments").select("id").eq("order_id", orderId).eq("provider", "credits").eq("status", "succeeded").maybeSingle();
  if (paid) {
    await db.rpc("credit_add", {
      p_user: order.user_id,
      p_amount: toCredits(order.price),
      p_kind: "refund",
      p_order: orderId,
      p_topup: null,
      p_note: `Refund: report ${shortId(orderId)} could not be completed`,
    });
  }
  // A daily free report that could not be made gives the day's allowance back.
  const freeBack = await refundFreeReport(orderId);
  await db.from("auto_report_pieces").delete().eq("order_id", orderId);
  await audit("report_failed", { orderId, detail: { reason, refunded: Boolean(paid) || freeBack } });
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
    if (!(order.price === 0 && classifierPrimary())) warmDetector();
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

  const { data: have } = await db.from("auto_report_pieces").select("idx,ok,attempts").eq("order_id", orderId);
  const rows = new Map((have ?? []).map((r: { idx: number; ok: boolean; attempts: number }) => [r.idx, r]));
  const todo = chunks.map((_, idx) => idx).filter((idx) => !rows.get(idx)?.ok && (rows.get(idx)?.attempts ?? 0) < MAX_ATTEMPTS);

  // Free reports can be scored by the classifier alone (DETECTOR_MODE=primary): no DeepSeek call. If the service
  // does not answer, they fall back to the reviewer below as before. Paid reports always use the reviewer.
  let viaClassifier = false;
  if (todo.length && order.price === 0 && classifierPrimary()) {
    const scores = await detectSentences(splitSentences(text).map((s) => s.text));
    if (scores) {
      for (const idx of todo) {
        const c = chunks[idx];
        const row = { order_id: orderId, idx, attempts: (rows.get(idx)?.attempts ?? 0) + 1, updated_at: new Date().toISOString() };
        await db.from("auto_report_pieces").upsert({ ...row, report: classifierReport(c.text, scores.slice(c.first, c.first + c.count)), ok: true, truncated: false, ms: 0 }, { onConflict: "order_id,idx" });
      }
      todo.length = 0;
      viaClassifier = true;
    }
  }

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
      const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
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
  let answers: PieceAnswer[] = (done ?? []).filter((r: { ok: boolean }) => r.ok);
  const reviewed = answers.length;
  if (reviewed >= total) {
    // Paid reports in classifier mode: the same marks and score as a free report; the reviewer's text only adds reasons.
    if (!viaClassifier && classifierPrimary()) {
      const scores = await detectSentences(splitSentences(text).map((s) => s.text));
      if (scores) {
        const said = new Map(answers.map((a) => [a.idx, a.report]));
        answers = chunks.map((c, idx) => ({ idx, ok: true, truncated: false, report: withReasons(classifierReport(c.text, scores.slice(c.first, c.first + c.count)), said.get(idx)) }));
        viaClassifier = true;
      }
    }
    const result = stitchReport(text, answers, PIECE_SIZE);
    // Optional second opinion from the classifier service; without it the report scores on the sentence share alone.
    const detector = viaClassifier ? null : await detectAi(text);
    if (detector !== null) {
      result.summary.detector = detector;
      result.summary.overall = overallForScore(headlineScore(result.summary));
    }
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
