import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, type ReasoningEffort } from "@/lib/deepseek";
import { logModelCall, paidPieceLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import { PIECE_SIZE, reportScore, type AutoReportResult } from "./stitch";
import { reportBasis, textHash } from "./reuse";
import { prepareReview, reviewSystem, type ReviewPiece } from "./review";
import { finishProductionReview, REVIEW_CONTEXT_CHARS, requestReviewPiece } from "./review-model";
import { calibrateReview } from "./calibration";
import { earlierResult } from "./run";
import { acceptAll, checkOutcome, reviseText, type ReportRewrite, type RewriteCheck } from "./rewrite";

/**
 * Re-checks a Writing Refinement for real: the text with every suggestion in place is reviewed by the same detector,
 * prompt and settings as a report, and the result is kept with the rewrite (ReportRewrite.check). The live rewrite
 * then lands on this score instead of the projection. Included in the add-on's price; made once per round.
 *
 * A later round (rewrite-run.ts makeRound) waits as `pending` until it is re-checked here: its suggestions replace the
 * earlier ones only when the re-check scores lower, so the rewrite always keeps the best round.
 */

const LEASE_MS = 120_000;
/** Every piece is reviewed at once; a slow one must still finish inside the route's 120 s. */
const PIECE_TIMEOUT_MS = 95_000;

export type CheckOutcome =
  | { ok: true; check: RewriteCheck; rewrite: ReportRewrite }
  | { ok: false; reason: "no_rewrite" | "busy" | "daily_limit" | "unavailable" };

async function reviewPiece(piece: ReviewPiece, system: string, model: string, effort: ReasoningEffort) {
  try {
    const { result, read } = await requestReviewPiece(piece, system, { model, effort }, PIECE_TIMEOUT_MS);
    await logModelCall("paid_report", { ok: true, result });
    return read;
  } catch (e) {
    if (e instanceof DeepSeekRunError) await logModelCall("paid_report", { ok: false, error: e });
    else if (!(e instanceof DeepSeekError)) console.error("rewrite check piece failed", e);
    return null;
  }
}

export async function checkReportRewrite(orderId: string, userId: string): Promise<CheckOutcome> {
  const db = createAdminClient();
  const { data: report } = await db.from("auto_reports").select("status,result,rewrite").eq("order_id", orderId).maybeSingle<{ status: string; result: AutoReportResult | null; rewrite: ReportRewrite | null }>();
  const rewrite = report?.rewrite;
  if (!report?.result || !rewrite || !rewrite.items.some((i) => i.rewrite)) return { ok: false, reason: "no_rewrite" };
  if (rewrite.check && !rewrite.pending) return { ok: true, check: rewrite.check, rewrite };
  if (!deepseekEnabled()) return { ok: false, reason: "unavailable" };
  if (await paidPieceLimitReached()) return { ok: false, reason: "daily_limit" };

  const { data: order } = await db.from("orders").select("source_text").eq("id", orderId).maybeSingle<{ source_text: string | null }>();
  // The round being checked: the waiting one, or the first.
  const trial: ReportRewrite = rewrite.pending ? { ...rewrite, items: rewrite.pending.items } : rewrite;
  const text = reviseText(order?.source_text ?? null, report.result, trial, acceptAll(trial));
  const review = prepareReview(text, PIECE_SIZE, REVIEW_CONTEXT_CHARS);
  if (!review.pieces.length) return { ok: false, reason: "no_rewrite" };

  // One worker per rewrite (the rewrite's own lease is free again once the suggestions are saved).
  const now = new Date();
  const { data: leased } = await db
    .from("auto_reports")
    .update({ rewrite_lease: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("order_id", orderId)
    .or(`rewrite_lease.is.null,rewrite_lease.lt.${now.toISOString()}`)
    .select("order_id");
  if (!leased?.length) return { ok: false, reason: "busy" };
  const release = () => db.from("auto_reports").update({ rewrite_lease: null }).eq("order_id", orderId);

  try {
    const [prompt, setting] = await Promise.all([getScanReportPrompt(), getModelSetting()]);
    const hash = textHash(text);
    const system = reviewSystem(prompt, true);
    const basis = reportBasis({ prompt: system, model: setting.model, effort: setting.effort, pieceSize: PIECE_SIZE });
    // The same revised text already checked by this account (a new report on it) gives the same answer again.
    let after = await earlierResult(userId, orderId, hash, basis);
    if (!after) {
      const reports = await Promise.all(review.pieces.map(piece => reviewPiece(piece, system, setting.model, setting.effort)));
      const checked = finishProductionReview(review, new Map(reports.flatMap((read, idx) => read ? [[idx, read]] : [])));
      if (!checked) {
        await release();
        return { ok: false, reason: "unavailable" };
      }
      after = { ...checked, reuse: { text: hash, basis } };
    }
    const check: RewriteCheck = { checkedAt: new Date().toISOString(), score: reportScore(after.summary), ...checkOutcome(trial, after), result: after };
    const round = rewrite.pending?.round ?? 1;
    const scores = [...(rewrite.scores ?? (rewrite.check ? [rewrite.check.score] : [])), check.score];
    // Compare on the same scale when a draft was checked before a scorer update.
    const earlier = rewrite.check?.result && calibrateReview(rewrite.check.result);
    const priorScore = earlier ? reportScore(earlier.summary) : rewrite.check?.score;
    const better = priorScore === undefined || check.score < priorScore;
    const rest: ReportRewrite = { ...rewrite };
    delete rest.pending;
    const saved: ReportRewrite = better ? { ...rest, items: trial.items, check, round, scores } : { ...rest, round, scores };
    await db.from("auto_reports").update({ rewrite: saved, rewrite_lease: null }).eq("order_id", orderId);
    await audit("report_rewrite_checked", { orderId, actorId: userId, detail: { round, kept: better, score: Math.round(check.score * 100), stillCounted: check.stillCounted.length, cleared: check.cleared.length } });
    return { ok: true, check: saved.check as RewriteCheck, rewrite: saved };
  } catch (e) {
    await release();
    console.error("rewrite check failed", e instanceof Error ? e.name : "error");
    return { ok: false, reason: "unavailable" };
  }
}
