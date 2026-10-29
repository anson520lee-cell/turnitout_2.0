/**
 * Backtest of Writing Refinement against the live detector prompt, straight from DeepSeek (no database, no credits).
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx --conditions=react-server tools/refine-backtest/run.ts [--only a,b] [--out dir]
 *     [--concurrency 6] [--rounds 3] [--rescore N] [--prompt-file path] [--label name]
 *
 * For each essay: score it with the site's detector (WORD_1, pieces of PIECE_SIZE, same stitching and score curve),
 * rewrite the flagged sentences with REWRITE_PROMPT exactly as rewrite-run.ts does (batches, checkRewrite, one retry of
 * refused ones), re-check the revised text, and run later rounds on the sentences still counted (up to MAX_ROUNDS, stop
 * under TARGET_SCORE), keeping the lowest-scoring round. Everything per round is written to <out>/<essay>.json.
 * `--rescore N` scores the original and the kept text N more times to show the detector's own variance.
 * `--prompt-file` replaces REWRITE_PROMPT for quick prompt iterations without editing rewrite.ts.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chunkText } from "@/lib/chunking";
import { deepseekRun, type ReasoningEffort } from "@/lib/deepseek";
import { DRAFT_GUARD } from "@/lib/local-model/prompts";
import { WORD_1 } from "@/lib/chunk-prompts";
import { STARTER_SAMPLES } from "@/lib/starter-samples";
import { splitSentences } from "@/lib/recheck";
import { PIECE_SIZE, reportScore, stitchReport, type AutoReportResult, type PieceAnswer, type ReportSentence } from "@/lib/auto-report/stitch";
import {
  MAX_ROUNDS,
  REWRITE_BATCH,
  REWRITE_PROMPT,
  TARGET_SCORE,
  acceptAll,
  buildItems,
  checkOutcome,
  currentResult,
  knownNames,
  mergeRound,
  parseRewrites,
  pickFlagged,
  rewriteInput,
  reviseText,
  roundTargets,
  type ReportRewrite,
  type RewriteItem,
} from "@/lib/auto-report/rewrite";

process.env.DEEPSEEK_API_KEY ||= "proxy-injected";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const EFFORT = (process.env.DEEPSEEK_REASONING_EFFORT || "low") as ReasoningEffort;
const OUT = opt("out") ?? join(import.meta.dirname ?? __dirname, "results", opt("label") ?? "run");
const RW_MODEL = process.env.RW_MODEL || MODEL;
const RW_EFFORT = (process.env.RW_EFFORT || EFFORT) as ReasoningEffort;
const CONCURRENCY = Number(opt("concurrency") ?? 6);
/** Extra independent detector runs on the original and on the kept text (the detector is noisy: one run is not a measurement). */
const RESCORE = Number(opt("rescore") ?? (flag("repeat-detect") ? 1 : 0));
const ROUNDS = Number(opt("rounds") ?? MAX_ROUNDS);
const PROMPT = opt("prompt-file") ? readFileSync(opt("prompt-file") as string, "utf8").trim() : REWRITE_PROMPT;
const DETECTOR = process.env.DETECTOR_PROMPT_FILE ? readFileSync(process.env.DETECTOR_PROMPT_FILE, "utf8") : WORD_1;

let calls = 0;
let tokensIn = 0;
let tokensOut = 0;

/** The writer may run on another model than the detector (RW_MODEL / RW_EFFORT) to see what a stronger writer buys. */
async function ask(system: string, user: string, maxTokens: number, timeoutMs: number, writer = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await deepseekRun({ system: [system, DRAFT_GUARD].join("\n\n"), user, maxTokens, model: writer ? RW_MODEL : MODEL, effort: writer ? RW_EFFORT : EFFORT, timeoutMs });
      calls++;
      tokensIn += res.usage.promptTokens;
      tokensOut += res.usage.completionTokens;
      if (!res.truncated) return res.text;
    } catch (e) {
      console.error("model call failed", (e as { reason?: string }).reason ?? e);
    }
  }
  return null;
}

/** The site's detector on a text: pieces reviewed with the live prompt, stitched and scored as a report. */
async function detect(text: string): Promise<{ result: AutoReportResult; score: number } | null> {
  const chunks = chunkText(text, PIECE_SIZE);
  const reports = await Promise.all(chunks.map((c) => ask(DETECTOR, ["<draft>", c.text, "</draft>"].join("\n"), 24_000, 95_000)));
  const answers: PieceAnswer[] = reports.flatMap((report, idx) => (report === null ? [] : [{ idx, report, ok: true, truncated: false }]));
  if (answers.length < chunks.length) return null;
  const result = stitchReport(text, answers, PIECE_SIZE);
  return { result, score: reportScore(result.summary) };
}

async function askBatch(batch: ReportSentence[], result: AutoReportResult, redo?: Map<number, string>, round = 1) {
  const text = await ask(PROMPT, rewriteInput(batch, result, redo, round), 12_000, 50_000, true);
  return text === null ? null : parseRewrites(text);
}

/** generateRewrite of rewrite-run.ts without the database: batches, checks, one retry for refused ones. */
async function firstRewrite(result: AutoReportResult, flagged: ReportSentence[]): Promise<ReportRewrite | null> {
  const known = knownNames(result);
  const batches: ReportSentence[][] = [];
  for (let i = 0; i < flagged.length; i += REWRITE_BATCH) batches.push(flagged.slice(i, i + REWRITE_BATCH));
  const first = await Promise.all(batches.map((b) => askBatch(b, result)));
  if (first.every((a) => a === null)) return null;
  const answers = new Map<number, string>();
  for (const a of first) for (const [n, t] of a ?? []) answers.set(n, t);
  let items = buildItems(flagged, answers, known);
  const redo = new Map(items.filter((i) => i.rewrite === null && i.kept).map((i) => [i.n, i.kept as string]));
  if (redo.size) {
    const again = await askBatch(flagged.filter((s) => redo.has(s.n)), result, redo);
    if (again) {
      for (const [n, t] of again) answers.set(n, t);
      items = buildItems(flagged, answers, known);
    }
  }
  return { version: 1, model: MODEL, createdAt: new Date().toISOString(), items };
}

/** makeRound of rewrite-run.ts without the database. */
async function nextRound(result: AutoReportResult, rewrite: ReportRewrite, round: number): Promise<{ items: RewriteItem[]; targets: number; fresh: RewriteItem[] } | null> {
  const targets = roundTargets(result, rewrite);
  if (!targets.length) return null;
  const context = currentResult(result, rewrite.items);
  const known = knownNames(result);
  const batches: ReportSentence[][] = [];
  for (let i = 0; i < targets.length; i += REWRITE_BATCH) batches.push(targets.slice(i, i + REWRITE_BATCH));
  const answers = new Map<number, string>();
  for (const a of await Promise.all(batches.map((b) => askBatch(b, context, undefined, round)))) for (const [n, t] of a ?? []) answers.set(n, t);
  const students = new Map(result.paragraphs.flatMap((p) => p.sentences).map((s) => [s.n, s.text]));
  let fresh = buildItems(targets, answers, known, students);
  const redo = new Map(fresh.filter((i) => i.rewrite === null && i.kept && answers.has(i.n)).map((i) => [i.n, i.kept as string]));
  if (redo.size) {
    const again = await askBatch(targets.filter((s) => redo.has(s.n)), context, redo, round);
    for (const [n, t] of again ?? []) answers.set(n, t);
    fresh = buildItems(targets, answers, known, students);
  }
  if (!fresh.some((i) => i.rewrite)) return null;
  return { items: mergeRound(rewrite.items, fresh, result), targets: targets.length, fresh };
}

const words = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

/** Signal numbers cited by the counted sentences' reasons ("Signal 3, 8: ..."), and what the text looks like. */
function describe(result: AutoReportResult, text: string) {
  const signals: Record<string, number> = {};
  const counted = result.paragraphs.flatMap((p) => p.sentences).filter((s) => s.counts);
  for (const s of counted) {
    const m = /^\s*signals?\b([^:|]*)/i.exec(s.why ?? "");
    for (const n of m?.[1].match(/\d/g) ?? []) signals[n] = (signals[n] ?? 0) + 1;
  }
  const sentences = splitSentences(text).map((s) => words(s.text));
  return {
    counted: counted.length,
    sentences: sentences.length,
    countedShare: +(result.summary.countedShare ?? 0).toFixed(3),
    high: result.summary.high,
    medium: result.summary.medium,
    signals,
    avgWords: +(sentences.reduce((a, b) => a + b, 0) / Math.max(1, sentences.length)).toFixed(1),
    shortShare: +(sentences.filter((n) => n < 12).length / Math.max(1, sentences.length)).toFixed(2),
    reasons: counted.map((s) => ({ n: s.n, risk: s.risk, text: s.text, why: s.why })),
  };
}

interface Essay {
  name: string;
  kind: "ai" | "human";
  text: string;
}

function loadEssays(): Essay[] {
  const dir = join(import.meta.dirname ?? __dirname, "essays");
  const ai = readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => ({ name: f.replace(/\.txt$/, ""), kind: "ai" as const, text: readFileSync(join(dir, f), "utf8").trim() }));
  // Human controls: published prose by people (Brown corpus), cut at a paragraph end near 500 words.
  const human = STARTER_SAMPLES.filter((s) => s.origin === "human")
    .slice(0, 4)
    .map((s) => {
      const out: string[] = [];
      let n = 0;
      for (const para of s.body.split(/\n\n+/)) {
        if (n >= 450) break;
        out.push(para);
        n += words(para);
      }
      return { name: `human-${s.name.replace(/\W+/g, "-").toLowerCase()}`, kind: "human" as const, text: out.join("\n\n") };
    });
  const only = opt("only")?.split(",");
  return [...ai, ...(flag("human") ? human : [])].filter((e) => !only || only.some((o) => e.name.includes(o)));
}

async function runEssay(e: Essay) {
  const t0 = Date.now();
  const rec: Record<string, unknown> = { name: e.name, kind: e.kind, words: words(e.text) };
  const before = await detect(e.text);
  if (!before) return { ...rec, error: "detector failed on original" };
  rec.before = { score: before.score, ...describe(before.result, e.text) };
  if (RESCORE) {
    const again = await Promise.all(Array.from({ length: RESCORE }, () => detect(e.text)));
    rec.beforeAgain = again.map((a) => a?.score);
  }
  const flagged = pickFlagged(before.result);
  rec.flagged = flagged.length;
  if (!flagged.length) return { ...rec, rounds: [], finalScore: before.score, note: "nothing flagged" };

  let rewrite = await firstRewrite(before.result, flagged);
  if (!rewrite || !rewrite.items.some((i) => i.rewrite)) return { ...rec, error: "no suggestions", kept: rewrite?.items.map((i) => i.kept) };
  const rounds: Record<string, unknown>[] = [];
  let best = { score: before.score, text: e.text, round: 0 };
  let bestRewrite: ReportRewrite | null = null;
  let round = 1;
  let items = rewrite.items;
  for (;;) {
    const trial: ReportRewrite = { ...rewrite, items };
    const text = reviseText(e.text, before.result, trial, acceptAll(trial));
    const after = await detect(text);
    if (!after) {
      rounds.push({ round, error: "detector failed" });
      break;
    }
    const out = checkOutcome(trial, after.result);
    const kept = after.score < (bestRewrite ? (rewrite.check?.score ?? 1) : 2);
    rounds.push({
      round,
      score: after.score,
      suggested: items.filter((i) => i.rewrite).length,
      refused: items.filter((i) => i.rewrite === null && i.kept).map((i) => i.kept),
      stillCounted: out.stillCounted.length,
      cleared: out.cleared.length,
      kept,
      ...describe(after.result, text),
      text,
      rewrites: items.filter((i) => i.rewrite).map((i) => ({ n: i.n, from: i.original, to: i.rewrite })),
    });
    if (after.score < best.score || round === 1) best = { score: after.score, text, round };
    if (kept || !bestRewrite) {
      bestRewrite = trial;
      rewrite = { ...trial, check: { checkedAt: "", score: after.score, ...out, result: after.result }, round };
    } else rewrite = { ...rewrite, round };
    if (after.score < TARGET_SCORE || round >= ROUNDS) break;
    round += 1;
    const next = await nextRound(before.result, rewrite, round);
    if (!next) break;
    items = next.items;
  }
  const result: Record<string, unknown> = { ...rec, rounds, finalScore: Math.min(...rounds.map((r) => (r.score as number) ?? 2)), bestRound: best.round, secs: Math.round((Date.now() - t0) / 1000) };
  if (RESCORE) {
    const again = await Promise.all(Array.from({ length: RESCORE }, () => detect(best.text)));
    result.finalScores = again.map((a) => a?.score);
  }
  result.finalWords = words(best.text);
  result.finalText = best.text;
  return result;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const essays = loadEssays();
  console.log(`${essays.length} essays, model ${MODEL}/${EFFORT}, concurrency ${CONCURRENCY}, out ${OUT}`);
  const queue = [...essays];
  const all: Record<string, unknown>[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          const r = await runEssay(e);
          writeFileSync(join(OUT, `${e.name}.json`), JSON.stringify(r, null, 1));
          all.push(r);
          const rr = (r.rounds as { score?: number }[] | undefined) ?? [];
          console.log(`${e.name.padEnd(34)} before ${Math.round(((r.before as { score: number })?.score ?? NaN) * 100)}  rounds ${rr.map((x) => Math.round((x.score ?? NaN) * 100)).join("/")}  ${r.error ?? ""}`);
        } catch (err) {
          console.error(e.name, "crashed", err);
        }
      }
    }),
  );
  console.log(`done: ${calls} model calls, ${tokensIn} in / ${tokensOut} out tokens`);
  writeFileSync(join(OUT, "_summary.json"), JSON.stringify({ calls, tokensIn, tokensOut, model: MODEL, effort: EFFORT }, null, 1));
}

main();
