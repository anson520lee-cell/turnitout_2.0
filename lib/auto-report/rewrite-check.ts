import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekError, DeepSeekRunError, deepseekEnabled, deepseekRun, type ReasoningEffort } from "@/lib/deepseek";
import { chunkText } from "@/lib/chunking";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall, paidPieceLimitReached } from "@/lib/model-usage";
import { getModelSetting, getScanReportPrompt } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import { PIECE_SIZE, reportScore, stitchReport, type AutoReportResult, type PieceAnswer } from "./stitch";
import { reportBasis, textHash } from "./reuse";
import { earlierResult } from "./run";
import { acceptAll, checkOutcome, reviseText, type ReportRewrite, type RewriteCheck } from "./rewrite";

/**
 * Re-checks a Writing Refinement for real: the text with every suggestion in place is reviewed by the same detector,
 * prompt and settings as a report, and the result is kept with the rewrite (ReportRewrite.check). The live rewrite
 * then lands on this score instead of the projection. Included in the add-on's price; made once per rewrite.
 */

const LEASE_MS = 120_000;
/** Every piece is reviewed at once; a slow one must still finish inside the route's 120 s. */
const PIECE_TIMEOUT_MS = 95_000;

export type CheckOutcome =
  | { ok: true; check: RewriteCheck }
  | { ok: false; reason: "no_rewrite" | "busy" | "daily_limit" | "unavailable" };

async function reviewPiece(text: string, prompt: string, model: string, effort: ReasoningEffort): Promise<string | null> {
  try {
    const result = await deepseekRun({
      system: [prompt, DRAFT_GUARD].join("\n\n"),
      user: ["<draft>", text, "</draft>"].join("\n"),
      maxTokens: 24_000,
      model,
      effort,
      timeoutMs: PIECE_TIMEOUT_MS,
    });
    await logModelCall("paid_report", { ok: true, result });
    return result.truncated ? null : result.text;
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
  if (rewrite.check) return { ok: true, check: rewrite.check };
  if (!deepseekEnabled()) return { ok: false, reason: "unavailable" };
  if (await paidPieceLimitReached()) return { ok: false, reason: "daily_limit" };

  const { data: order } = await db.from("orders").select("source_text").eq("id", orderId).maybeSingle<{ source_text: string | null }>();
  const text = reviseText(order?.source_text ?? null, report.result, rewrite, acceptAll(rewrite));
  const chunks = chunkText(text, PIECE_SIZE);
  if (!chunks.length) return { ok: false, reason: "no_rewrite" };

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
    const basis = reportBasis({ prompt: [prompt, DRAFT_GUARD].join("\n\n"), model: setting.model, effort: setting.effort, pieceSize: PIECE_SIZE });
    // The same revised text already checked by this account (a new report on it) gives the same answer again.
    let after = await earlierResult(userId, orderId, hash, basis);
    if (!after) {
      const reports = await Promise.all(chunks.map((c) => reviewPiece(c.text, prompt, setting.model, setting.effort)));
      const answers: PieceAnswer[] = reports.flatMap((report, idx) => (report === null ? [] : [{ idx, report, ok: true, truncated: false }]));
      if (answers.length < chunks.length) {
        await release();
        return { ok: false, reason: "unavailable" };
      }
      after = { ...stitchReport(text, answers, PIECE_SIZE), reuse: { text: hash, basis } };
    }
    const check: RewriteCheck = { checkedAt: new Date().toISOString(), score: reportScore(after.summary), ...checkOutcome(rewrite, after), result: after };
    await db.from("auto_reports").update({ rewrite: { ...rewrite, check }, rewrite_lease: null }).eq("order_id", orderId);
    await audit("report_rewrite_checked", { orderId, actorId: userId, detail: { score: Math.round(check.score * 100), stillCounted: check.stillCounted.length, cleared: check.cleared.length } });
    return { ok: true, check };
  } catch (e) {
    await release();
    console.error("rewrite check failed", e instanceof Error ? e.name : "error");
    return { ok: false, reason: "unavailable" };
  }
}
