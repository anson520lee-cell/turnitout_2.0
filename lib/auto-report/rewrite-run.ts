import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekRunError, deepseekEnabled, deepseekRun } from "@/lib/deepseek";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall, rewriteLimitReached } from "@/lib/model-usage";
import { getModelSetting } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import type { AutoReportResult, ReportSentence } from "./stitch";
import { REWRITE_BATCH, REWRITE_PROMPT, buildItems, knownNames, parseRewrites, pickFlagged, rewriteInput, type ReportRewrite, type RewriteItem } from "./rewrite";

/**
 * Makes the suggested rewrites for a finished report, once. Free: it costs a cent or so, and the report it follows is
 * already paid for (or the day's free one). The report itself, its score and its band are never touched, and the new
 * text is not scored here: a fresh report is the only way to see how an edited text reads.
 */

const LEASE_MS = 150_000;
/** Two attempts (thinking, then not) must fit inside the route's 120 s. */
const CALL_TIMEOUT_MS = 50_000;

export type RewriteOutcome =
  | { ok: true; rewrite: ReportRewrite }
  | { ok: false; reason: "no_report" | "nothing_flagged" | "busy" | "daily_limit" | "unavailable" };

async function askBatch(batch: ReportSentence[], result: AutoReportResult, model: string, redo?: Map<number, string>): Promise<Map<number, string> | null> {
  try {
    const res = await deepseekRun({
      system: [REWRITE_PROMPT, DRAFT_GUARD].join("\n\n"),
      user: rewriteInput(batch, result, redo),
      maxTokens: 12_000,
      model,
      effort: "low",
      timeoutMs: CALL_TIMEOUT_MS,
    });
    await logModelCall("report_rewrite", { ok: true, result: res });
    if (res.truncated) return null;
    return parseRewrites(res.text);
  } catch (e) {
    if (e instanceof DeepSeekRunError) await logModelCall("report_rewrite", { ok: false, error: e });
    return null;
  }
}

/** The saved rewrite of a report, if there is one. */
export async function savedRewrite(orderId: string): Promise<ReportRewrite | null> {
  const { data } = await createAdminClient().from("auto_reports").select("rewrite").eq("order_id", orderId).maybeSingle<{ rewrite: ReportRewrite | null }>();
  return data?.rewrite ?? null;
}

export async function makeRewrite(orderId: string): Promise<RewriteOutcome> {
  const db = createAdminClient();
  const { data: report } = await db.from("auto_reports").select("status,result,rewrite").eq("order_id", orderId).maybeSingle<{ status: string; result: AutoReportResult | null; rewrite: ReportRewrite | null }>();
  if (!report || report.status !== "done" || !report.result) return { ok: false, reason: "no_report" };
  if (report.rewrite) return { ok: true, rewrite: report.rewrite };
  const flagged = pickFlagged(report.result);
  if (!flagged.length) return { ok: false, reason: "nothing_flagged" };
  if (!deepseekEnabled()) return { ok: false, reason: "unavailable" };
  if (await rewriteLimitReached()) return { ok: false, reason: "daily_limit" };

  // One worker per report: take the lease or leave it to whoever has it.
  const now = new Date();
  const { data: leased } = await db
    .from("auto_reports")
    .update({ rewrite_lease: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("order_id", orderId)
    .is("rewrite", null)
    .or(`rewrite_lease.is.null,rewrite_lease.lt.${now.toISOString()}`)
    .select("order_id");
  if (!leased?.length) return { ok: false, reason: "busy" };

  try {
    const { model } = await getModelSetting();
    const batches: ReportSentence[][] = [];
    for (let i = 0; i < flagged.length; i += REWRITE_BATCH) batches.push(flagged.slice(i, i + REWRITE_BATCH));
    const first = await Promise.all(batches.map((b) => askBatch(b, report.result as AutoReportResult, model)));
    if (first.every((a) => a === null)) {
      await db.from("auto_reports").update({ rewrite_lease: null }).eq("order_id", orderId);
      return { ok: false, reason: "unavailable" };
    }
    const answers = new Map<number, string>();
    for (const a of first) for (const [n, t] of a ?? []) answers.set(n, t);

    const known = knownNames(report.result);
    let items: RewriteItem[] = buildItems(flagged, answers, known);
    // One more try for the sentences whose suggestion was refused, telling the model why.
    const redo = new Map(items.filter((i) => i.rewrite === null && i.kept).map((i) => [i.n, i.kept as string]));
    if (redo.size) {
      const again = await askBatch(flagged.filter((s) => redo.has(s.n)), report.result, model, redo);
      if (again) {
        for (const [n, t] of again) answers.set(n, t);
        items = buildItems(flagged, answers, known);
      }
    }

    const rewrite: ReportRewrite = { version: 1, model, createdAt: new Date().toISOString(), items };
    await db.from("auto_reports").update({ rewrite, rewrite_lease: null }).eq("order_id", orderId);
    await audit("report_rewrite_made", { orderId, detail: { flagged: flagged.length, suggested: items.filter((i) => i.rewrite).length } });
    return { ok: true, rewrite };
  } catch (e) {
    await db.from("auto_reports").update({ rewrite_lease: null }).eq("order_id", orderId);
    console.error("report rewrite failed", e instanceof Error ? e.name : "error");
    return { ok: false, reason: "unavailable" };
  }
}
