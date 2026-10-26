import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunking";
import { PIECE_SIZE, stitchReport, type PieceAnswer } from "@/lib/auto-report/stitch";
import { pickFlagged, reviseText, type ReportRewrite } from "@/lib/auto-report/rewrite";
import { generateRewrite } from "@/lib/auto-report/rewrite-run";

/**
 * Backtest of the report rewrite with the real rewriter (queue rows with batch RW_MAKE_BATCH, run by the chunk-queue cron).
 * For each essay behind the earlier Claude-written "RW-A" test samples it takes the flags of one earlier review run,
 * has the model rewrite the flagged sentences exactly as the site does, applies every suggestion that passed the checks
 * and stores the result as a new sample "RW-D <name>". The ordinary queue then scores those samples like any other, so
 * the effect is read from the same numbers as the first backtest. Admin tooling only: nothing here is reachable by customers.
 */

export const RW_MAKE_BATCH = "rw-d-make";
/** The review run whose flags are rewritten. */
const FLAGS_BATCH = "var1-word1-r1";
/** The queue only runs samples at least this long (see the scoring rows), so a rewrite must not shrink below it. */
const MIN_LENGTH = 4250;

type Sample = { id: string; name: string; origin: string | null; body: string; sentences: number | null };

/** Makes the next sample that is still missing. Returns false when every essay has one. */
export async function makeNextRewriteSample(): Promise<boolean> {
  const db = createAdminClient();
  const { data: aRows } = await db.from("chunk_samples").select("note").like("name", "RW-A %").returns<{ note: string }[]>();
  const sources = new Set((aRows ?? []).map((r) => /src=([0-9a-f-]{36})/.exec(r.note)?.[1]).filter((x): x is string => Boolean(x)));
  const { data: dRows } = await db.from("chunk_samples").select("note").like("name", "RW-D %").returns<{ note: string }[]>();
  for (const r of dRows ?? []) {
    const id = /src=([0-9a-f-]{36})/.exec(r.note)?.[1];
    if (id) sources.delete(id);
  }
  // The first essay that has a complete earlier review run to take flags from (the others are skipped, not retried).
  let src: Sample | null = null;
  let trials: PieceAnswer[] = [];
  for (const id of sources) {
    const { data: row } = await db.from("chunk_samples").select("id,name,origin,body,sentences").eq("id", id).maybeSingle<Sample>();
    const { data: t } = await db.from("chunk_trials").select("idx,report,ok,truncated").eq("sample_id", id).eq("batch", FLAGS_BATCH).eq("size", PIECE_SIZE).returns<PieceAnswer[]>();
    if (row && t && t.filter((x) => x.ok && !x.truncated).length >= chunkText(row.body, PIECE_SIZE).length) {
      src = row;
      trials = t;
      break;
    }
  }
  if (!src) return false;

  const result = stitchReport(src.body, trials, PIECE_SIZE);
  const flagged = pickFlagged(result, 1000);
  const rewrite = await generateRewrite(result, flagged);
  if (!rewrite) return true;

  const accepted = rewrite.items.filter((i) => i.rewrite);
  const all = (items: ReportRewrite["items"]) => Object.fromEntries(items.map((i) => [i.n, "accept" as const]));
  let used: ReportRewrite = rewrite;
  let body = reviseText(src.body, result, used, all(accepted));
  // Keep the sample long enough for the queue: give back the suggestions that shorten the text most.
  const byShrink = [...accepted].sort((a, b) => b.original.length - (b.rewrite?.length ?? 0) - (a.original.length - (a.rewrite?.length ?? 0)));
  let dropped = 0;
  while (body.length < MIN_LENGTH && byShrink.length) {
    const drop = byShrink.shift()!;
    dropped++;
    used = { ...used, items: used.items.map((i) => (i.n === drop.n ? { ...i, rewrite: null, kept: "given back to keep the sample long enough" } : i)) };
    body = reviseText(src.body, result, used, all(used.items.filter((i) => i.rewrite)));
  }
  const refused: Record<string, number> = {};
  for (const i of rewrite.items) if (!i.rewrite && i.kept) refused[i.kept.replace(/"[^"]*"|\d+/g, "#")] = (refused[i.kept.replace(/"[^"]*"|\d+/g, "#")] ?? 0) + 1;
  const note = `rewrite test 2026-10-27; variant=D (site rewriter, ${rewrite.model}); src=${src.id}; flags=${FLAGS_BATCH}; flagged=${flagged.length}; rewritten=${used.items.filter((i) => i.rewrite).map((i) => i.n).join(",")}; refused=${JSON.stringify(refused)}; givenBack=${dropped}`;
  await db.from("chunk_samples").insert({ name: `RW-D ${src.name}`.slice(0, 200), origin: src.origin, body, sentences: src.sentences, note });
  return true;
}
