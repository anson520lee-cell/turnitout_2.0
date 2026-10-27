import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeepSeekRunError, deepseekEnabled, deepseekRun, deepseekStream } from "@/lib/deepseek";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { logModelCall, rewriteLimitReached } from "@/lib/model-usage";
import { getModelSetting } from "@/lib/site-settings";
import { audit } from "@/lib/audit";
import { shortId } from "@/lib/utils";
import type { AutoReportResult, ReportSentence } from "./stitch";
import { REWRITE_BATCH, REWRITE_PROMPT, buildItems, knownNames, parseRewrites, pickFlagged, rewriteCredits, rewriteInput, streamedRewrites, type ReportRewrite, type RewriteItem } from "./rewrite";

/**
 * Makes the suggested rewrites for a finished report, once: the Writing Refinement add-on, paid in credits (price in
 * config/pricing.ts rewritePricing) only when suggestions were made. The report itself, its score and its band are
 * never touched, and the new text is not scored here: a fresh report is the only way to see how an edited text reads.
 */

const LEASE_MS = 150_000;
/** Two attempts (thinking, then not) must fit inside the route's 120 s. */
const CALL_TIMEOUT_MS = 50_000;
/**
 * When the suggestions are streamed to the live rewrite, smaller batches (all asked at once) so the first ones come
 * back sooner and the rest follow one by one.
 */
const STREAM_BATCH = 6;
/** The retry of refused suggestions only starts while there is still time for it inside the route's 120 s. */
const RETRY_BEFORE_MS = 60_000;

export type RewriteOutcome =
  | { ok: true; rewrite: ReportRewrite }
  | { ok: false; reason: "no_report" | "nothing_flagged" | "busy" | "daily_limit" | "unavailable" | "no_suggestions" }
  | { ok: false; reason: "insufficient"; credits: number; balance: number };

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

/**
 * Like askBatch, but reads the reply as it is written and hands over each answer (`onAnswer`) as soon as its JSON
 * object is complete. Returns every answer at the end, or what had come in if the reply broke off.
 */
async function streamBatch(batch: ReportSentence[], result: AutoReportResult, model: string, onAnswer: (n: number, text: string) => void): Promise<Map<number, string> | null> {
  let text = "";
  const seen = new Set<number>();
  const take = () => {
    const got = streamedRewrites(text);
    for (const [n, t] of got) {
      if (seen.has(n)) continue;
      seen.add(n);
      onAnswer(n, t);
    }
    return got;
  };
  try {
    for await (const e of deepseekStream({ system: [REWRITE_PROMPT, DRAFT_GUARD].join("\n\n"), user: rewriteInput(batch, result), maxTokens: 12_000, model, effort: "low" })) {
      if (e.type === "delta") {
        text += e.text;
        if (e.text.includes("}")) take();
        continue;
      }
      await logModelCall("report_rewrite", { ok: true, result: e.result });
      if (e.result.truncated) return take();
      const all = parseRewrites(e.result.text);
      for (const [n, t] of all) if (!seen.has(n)) onAnswer(n, t);
      return all;
    }
    return seen.size ? take() : null;
  } catch (e) {
    if (e instanceof DeepSeekRunError) await logModelCall("report_rewrite", { ok: false, error: e });
    return seen.size ? take() : null;
  }
}

/** The saved rewrite of a report, if there is one. */
export async function savedRewrite(orderId: string): Promise<ReportRewrite | null> {
  const { data } = await createAdminClient().from("auto_reports").select("rewrite").eq("order_id", orderId).maybeSingle<{ rewrite: ReportRewrite | null }>();
  return data?.rewrite ?? null;
}

/**
 * Asks the model for a rewrite of each flagged sentence, checks every answer, and gives refused ones one more try.
 * Null when the model could not be reached at all. No database writes: used by makeRewrite and by the backtest sample maker.
 * With `onItem`, each suggestion that passes the checks is handed over as soon as the model has written it (the
 * live rewrite shows it right away); refused and retried ones only come with the whole rewrite.
 */
export async function generateRewrite(result: AutoReportResult, flagged: ReportSentence[], onItem?: (item: RewriteItem) => void): Promise<ReportRewrite | null> {
  const started = Date.now();
  const { model } = await getModelSetting();
  const known = knownNames(result);
  const size = onItem ? STREAM_BATCH : REWRITE_BATCH;
  const batches: ReportSentence[][] = [];
  for (let i = 0; i < flagged.length; i += size) batches.push(flagged.slice(i, i + size));
  const first = await Promise.all(
    batches.map((b) =>
      onItem
        ? streamBatch(b, result, model, (n, text) => {
            const s = b.find((x) => x.n === n);
            if (!s) return;
            const [item] = buildItems([s], new Map([[n, text]]), known);
            if (item.rewrite) onItem(item);
          })
        : askBatch(b, result, model),
    ),
  );
  if (first.every((a) => a === null)) return null;
  const answers = new Map<number, string>();
  for (const a of first) for (const [n, t] of a ?? []) answers.set(n, t);

  let items: RewriteItem[] = buildItems(flagged, answers, known);
  // One more try for the sentences whose suggestion was refused, telling the model why.
  const redo = new Map(items.filter((i) => i.rewrite === null && i.kept).map((i) => [i.n, i.kept as string]));
  if (redo.size && Date.now() - started < RETRY_BEFORE_MS) {
    const again = await askBatch(flagged.filter((s) => redo.has(s.n)), result, model, redo);
    if (again) {
      for (const [n, t] of again) answers.set(n, t);
      items = buildItems(flagged, answers, known);
    }
  }
  return { version: 1, model, createdAt: new Date().toISOString(), items };
}

/** `onItem`: see generateRewrite (the suggestions are only saved and charged for once all are in). */
export async function makeRewrite(orderId: string, who: { userId: string; admin: boolean }, onItem?: (item: RewriteItem) => void): Promise<RewriteOutcome> {
  const db = createAdminClient();
  const { data: report } = await db.from("auto_reports").select("status,result,rewrite").eq("order_id", orderId).maybeSingle<{ status: string; result: AutoReportResult | null; rewrite: ReportRewrite | null }>();
  if (!report || report.status !== "done" || !report.result) return { ok: false, reason: "no_report" };
  if (report.rewrite) return { ok: true, rewrite: report.rewrite };
  const flagged = pickFlagged(report.result);
  if (!flagged.length) return { ok: false, reason: "nothing_flagged" };
  if (!deepseekEnabled()) return { ok: false, reason: "unavailable" };
  if (await rewriteLimitReached()) return { ok: false, reason: "daily_limit" };

  // What it costs, and whether the account can pay, before any model call. An admin's own test is free.
  const { data: order } = await db.from("orders").select("price,source_text").eq("id", orderId).maybeSingle<{ price: number; source_text: string | null }>();
  if (!order) return { ok: false, reason: "no_report" };
  const credits = who.admin ? 0 : rewriteCredits(order, report.result);
  if (credits > 0) {
    const { data: account } = await db.from("credit_accounts").select("balance").eq("user_id", who.userId).maybeSingle<{ balance: number }>();
    const balance = account?.balance ?? 0;
    if (balance < credits) return { ok: false, reason: "insufficient", credits, balance };
  }

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

  const release = () => db.from("auto_reports").update({ rewrite_lease: null }).eq("order_id", orderId);
  try {
    const rewrite = await generateRewrite(report.result, flagged, onItem);
    if (!rewrite) {
      await release();
      return { ok: false, reason: "unavailable" };
    }
    // Nothing usable came back: nothing is charged, and the customer can try again.
    if (!rewrite.items.some((i) => i.rewrite)) {
      await release();
      return { ok: false, reason: "no_suggestions" };
    }
    // Charged only now that there is something to deliver. If the balance changed meanwhile, nothing is delivered.
    const note = `Writing Refinement for report ${shortId(orderId)}`;
    if (credits > 0) {
      const { data: spent } = await db.rpc("credit_spend", { p_user: who.userId, p_amount: credits, p_order: orderId, p_note: note });
      if (!spent) {
        await release();
        const { data: account } = await db.from("credit_accounts").select("balance").eq("user_id", who.userId).maybeSingle<{ balance: number }>();
        return { ok: false, reason: "insufficient", credits, balance: account?.balance ?? 0 };
      }
    }
    const saved: ReportRewrite = { ...rewrite, credits };
    const { data: stored } = await db.from("auto_reports").update({ rewrite: saved, rewrite_lease: null }).eq("order_id", orderId).is("rewrite", null).select("order_id");
    if (!stored?.length) {
      // Another request finished first: give this charge back and show theirs.
      if (credits > 0) await db.rpc("credit_add", { p_user: who.userId, p_amount: credits, p_kind: "refund", p_order: orderId, p_topup: null, p_note: `Refund: ${note}` });
      const again = await savedRewrite(orderId);
      return again ? { ok: true, rewrite: again } : { ok: false, reason: "busy" };
    }
    await audit("report_rewrite_made", { orderId, actorId: who.userId, detail: { flagged: flagged.length, suggested: saved.items.filter((i) => i.rewrite).length, credits } });
    return { ok: true, rewrite: saved };
  } catch (e) {
    await release();
    console.error("report rewrite failed", e instanceof Error ? e.name : "error");
    return { ok: false, reason: "unavailable" };
  }
}
