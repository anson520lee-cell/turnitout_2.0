import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deepseekEnabled } from "@/lib/deepseek";
import { paidPieceLimitReached } from "@/lib/model-usage";
import { scoreText } from "./rewrite-check";
import { acceptAll, pickFlagged, probeMarks, reviseText, type ReportRewrite, type RewriteItem } from "./rewrite";
import type { AutoReportResult } from "./stitch";

/**
 * Real scores while the suggestions are still being written (Neo, 2026-10-31: the purple rate sat on the report's
 * score until the whole text had been re-checked; he wants it to move as sentences are rewritten, every figure a real
 * detector score). As the live rewrite hands over suggestions, the text with the ones so far in place is scored by the
 * same detector as a report, a few times (probeMarks: a quarter, half and three quarters of the sentences), all at once and without waiting for the
 * writer. Each score is handed to `emit` as it lands. Nothing is saved or charged: the re-check of the whole rewrite
 * (rewrite-check.ts) stays the score of record, and these only show the way to it. A score that lands after a later
 * one (fewer suggestions in) is dropped, and the figures are only as quick as one review of the text (about a minute).
 */

/** The route's 120 s, less what it needs to save the rewrite and say goodbye. */
const BUDGET_MS = 112_000;
/** A review that cannot finish in this long is not started. */
const MIN_REVIEW_MS = 35_000;
const REVIEW_MS = 95_000;

export interface Probe {
  /** Suggestions in the text that was scored. */
  k: number;
  /** All the sentences being rewritten. */
  of: number;
  score: number;
}

export interface Probes {
  /** Call with each suggestion as it comes in. */
  add(item: RewriteItem): void;
  /** Resolves when the scores still running have landed or timed out. */
  finish(): Promise<void>;
}

export function createProbes(orderId: string, emit: (probe: Probe) => void): Probes {
  const started = Date.now();
  const have: RewriteItem[] = [];
  const running: Promise<void>[] = [];
  let launched = 0;
  let landed = 0;

  const context = (async () => {
    if (!deepseekEnabled() || (await paidPieceLimitReached())) return null;
    const db = createAdminClient();
    const [{ data: report }, { data: order }] = await Promise.all([
      db.from("auto_reports").select("result").eq("order_id", orderId).maybeSingle<{ result: AutoReportResult | null }>(),
      db.from("orders").select("source_text").eq("id", orderId).maybeSingle<{ source_text: string | null }>(),
    ]);
    if (!report?.result) return null;
    return { result: report.result, source: order?.source_text ?? null, of: pickFlagged(report.result).length };
  })().catch(() => null);

  const marks = context.then((c) => (c ? probeMarks(c.of) : []));

  async function launch(items: RewriteItem[]) {
    const c = await context;
    if (!c) return;
    const left = BUDGET_MS - (Date.now() - started);
    if (left < MIN_REVIEW_MS) return;
    const trial: ReportRewrite = { version: 1, model: "", createdAt: new Date(started).toISOString(), items };
    const text = reviseText(c.source, c.result, trial, acceptAll(trial));
    try {
      const score = await scoreText(text, Math.min(REVIEW_MS, left - 3_000));
      if (score === null || items.length <= landed) return;
      landed = items.length;
      emit({ k: items.length, of: c.of, score });
    } catch {
      // A score that could not be had is simply not shown.
    }
  }

  return {
    add(item) {
      if (!item.rewrite) return;
      have.push(item);
      const snapshot = have.slice();
      running.push(
        marks.then((at) => {
          // Only the mark this suggestion reaches: one score per mark.
          if (at.length > launched && snapshot.length >= at[launched]) {
            launched += 1;
            return launch(snapshot);
          }
        }),
      );
    },
    async finish() {
      await Promise.allSettled(running);
    },
  };
}
