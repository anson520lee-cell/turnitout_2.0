import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunking";
import { scoreTrial, summarize, type Origin, type Sample, type Trial } from "@/lib/chunk-eval";
import { truthFor } from "@/lib/chunk-samples";
import type { TruthSentence } from "@/lib/eval";
import { REASONING_EFFORTS, deepseekEnabled } from "@/lib/deepseek";
import { runChunkPiece } from "@/lib/chunk-run";
import { CANDIDATE_PROMPTS, type CandidatePromptName } from "@/lib/chunk-prompts";

/**
 * Runs the piece-size experiment without a signed-in browser: the owner (or
 * Claude, on request) calls this with CHUNK_AUTO_TOKEN. The DeepSeek key never
 * leaves the server. Switched off (404) whenever CHUNK_AUTO_TOKEN is unset, so
 * deleting that variable in Vercel closes it.
 *   setup  loads the starter set and copies the Turnitin cases once
 *   work   runs the pieces that have no answer yet for this batch (about 55 s per call)
 *   report scores everything done so far
 *   pieces one line per piece (origin, size, sentences, called High+Medium, called High) for piece-level analysis
 */

export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };
const SIZES = [1000, 1500, 2000, 3000, 4000];
const CONCURRENCY = 12;
const START_BEFORE_MS = 28_000;

const body = z.object({
  action: z.enum(["setup", "work", "report", "pieces", "auc"]),
  batch: z.string().min(1).max(60).default("auto"),
  sizes: z.array(z.number().int().min(300).max(20_000)).max(8).optional(),
  effort: z.enum(REASONING_EFFORTS).optional(),
  minChars: z.number().int().min(0).max(30_000).default(3000),
  level: z.enum(["high", "highMedium"]).default("highMedium"),
  /** Candidate reviewer prompt to try instead of the saved one (the saved prompt is never changed). */
  promptName: z.enum(Object.keys(CANDIDATE_PROMPTS) as [CandidatePromptName, ...CandidatePromptName[]]).optional(),
});

const same = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

type SampleRow = { id: string; name: string; origin: Origin; body: string; sentences: TruthSentence[] };

async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await read(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function POST(request: NextRequest) {
  const token = process.env.CHUNK_AUTO_TOKEN;
  if (!token) return new NextResponse("Not found", { status: 404 });
  if (!same(request.headers.get("x-run-token") ?? "", token)) return new NextResponse("Unauthorized", { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400, headers: noStore });
  const { action, batch, effort, minChars, level } = parsed.data;
  const prompt = parsed.data.promptName ? CANDIDATE_PROMPTS[parsed.data.promptName] : undefined;
  const sizes = parsed.data.sizes ?? SIZES;
  const db = createAdminClient();

  if (action === "setup") {
    const { STARTER_SAMPLES } = await import("@/lib/starter-samples");
    const [{ data: have }, { data: cases }] = await Promise.all([
      db.from("chunk_samples").select("name"),
      db.from("eval_cases").select("name,body,sentences,note"),
    ]);
    const names = new Set((have ?? []).map((r: { name: string }) => r.name));
    const starter = STARTER_SAMPLES.filter((s) => !names.has(s.name)).map((s) => ({
      name: s.name, origin: s.origin, body: s.body, sentences: truthFor(s.origin, s.body, "").truth, note: s.note,
    }));
    const turnitin = ((cases ?? []) as { name: string; body: string; sentences: TruthSentence[]; note: string | null }[])
      .filter((c) => !names.has(c.name))
      .map((c) => ({ name: c.name, origin: "turnitin", body: c.body, sentences: c.sentences, note: c.note }));
    const rows = [...starter, ...turnitin];
    if (rows.length) {
      const { error } = await db.from("chunk_samples").insert(rows);
      if (error) return NextResponse.json({ ok: false, message: "Couldn't save the samples." }, { headers: noStore });
    }
    return NextResponse.json({ ok: true, starter: starter.length, turnitin: turnitin.length }, { headers: noStore });
  }

  const samples = await readAll<SampleRow>((a, b) => db.from("chunk_samples").select("id,name,origin,body,sentences").order("created_at").range(a, b));
  const eligible = samples.filter((s) => s.body.length >= minChars);

  if (action === "report" || action === "pieces" || action === "auc") {
    const trials = await readAll<{
      sample_id: string; batch: string; size: number; first_sentence: number; chunk: string; model: string; effort: string; report: string; ok: boolean; truncated: boolean; ms: number; tokens: number;
    }>((a, b) => db.from("chunk_trials").select("sample_id,batch,size,first_sentence,chunk,model,effort,report,ok,truncated,ms,tokens").eq("batch", batch).order("id").range(a, b));
    const map = new Map<string, Sample>(eligible.map((s) => [s.id, { id: s.id, origin: s.origin, body: s.body, sentences: s.sentences }]));
    const scored: Trial[] = trials
      .filter((t) => map.has(t.sample_id))
      .map((t) => ({ sampleId: t.sample_id, size: t.size, model: t.model, effort: t.effort, batch: t.batch, first: t.first_sentence, chunk: t.chunk, report: t.report, ok: t.ok, truncated: t.truncated, ms: t.ms, tokens: t.tokens }));
    if (action === "auc") {
      // Does a whole piece's share of flagged sentences tell AI pieces from human pieces better than single sentences do?
      type P = { origin: Origin; size: number; hm: number; hi: number };
      const ps: P[] = scored.flatMap((t) => {
        const sample = map.get(t.sampleId);
        const hm = sample && scoreTrial(t, sample, "highMedium");
        const hi = sample && scoreTrial(t, sample, "high");
        return sample && hm && hi && hm.sentences > 0 ? [{ origin: sample.origin, size: t.size, hm: hm.called / hm.sentences, hi: hi.called / hi.sentences }] : [];
      });
      const auc = (pos: number[], neg: number[]) => {
        if (!pos.length || !neg.length) return null;
        let w = 0;
        for (const a of pos) for (const b of neg) w += a > b ? 1 : a === b ? 0.5 : 0;
        return w / (pos.length * neg.length);
      };
      const out = [...new Set(ps.map((p) => p.size))].sort((a, b) => a - b).map((size) => {
        const at = ps.filter((p) => p.size === size);
        const ai = at.filter((p) => p.origin === "ai");
        const human = at.filter((p) => p.origin === "human");
        const roc = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((th) => ({
          th,
          aiCaught: ai.length ? ai.filter((p) => p.hm >= th).length / ai.length : null,
          humanFlagged: human.length ? human.filter((p) => p.hm >= th).length / human.length : null,
        }));
        return { size, ai: ai.length, human: human.length, aucHighMedium: auc(ai.map((p) => p.hm), human.map((p) => p.hm)), aucHigh: auc(ai.map((p) => p.hi), human.map((p) => p.hi)), roc };
      });
      return NextResponse.json({ ok: true, rows: out }, { headers: noStore });
    }
    if (action === "pieces") {
      const rows = scored.flatMap((t) => {
        const sample = map.get(t.sampleId);
        const hm = sample && scoreTrial(t, sample, "highMedium");
        const hi = sample && scoreTrial(t, sample, "high");
        return sample && hm && hi ? [[sample.origin, t.size, hm.sentences, hm.called, hi.called, hm.positives]] : [];
      });
      return NextResponse.json({ ok: true, columns: ["origin", "size", "sentences", "calledHighMedium", "calledHigh", "positives"], rows }, { headers: noStore });
    }
    return NextResponse.json({ ok: true, samples: eligible.length, rows: summarize(scored, map, level) }, { headers: noStore });
  }

  if (!deepseekEnabled()) return NextResponse.json({ ok: false, message: "DEEPSEEK_API_KEY isn't set in Vercel." }, { headers: noStore });
  const { data: doneRows } = await db.from("chunk_trials").select("sample_id,size,idx").eq("batch", batch).eq("ok", true).limit(10_000);
  const done = new Set((doneRows ?? []).map((r: { sample_id: string; size: number; idx: number }) => `${r.sample_id}|${r.size}|${r.idx}`));
  const todo: { sampleId: string; size: number; idx: number }[] = [];
  for (const size of sizes) {
    for (const s of eligible) {
      const n = chunkText(s.body, size).length;
      for (let idx = 0; idx < n; idx++) if (!done.has(`${s.id}|${size}|${idx}`)) todo.push({ sampleId: s.id, size, idx });
    }
  }
  const total = todo.length;
  const started = Date.now();
  let next = 0;
  let ok = 0;
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < todo.length && Date.now() - started < START_BEFORE_MS) {
        const job = todo[next++];
        const r = await runChunkPiece({ ...job, batch, effort, prompt });
        if (r.ok) ok++;
        else failed.push(r.message);
      }
    }),
  );
  return NextResponse.json({ ok: true, ran: ok, failed: failed.length, firstFailure: failed[0] ?? null, remaining: Math.max(0, total - ok - failed.length) }, { headers: noStore });
}
