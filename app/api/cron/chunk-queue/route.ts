import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunking";
import { runChunkPiece } from "@/lib/chunk-run";
import { deepseekEnabled, REASONING_EFFORTS, type ReasoningEffort } from "@/lib/deepseek";
import { CANDIDATE_PROMPTS } from "@/lib/chunk-prompts";
import { CANDIDATE_PROMPT_NAMES, type CandidatePromptName } from "@/lib/chunk-candidate-names";
import { pieceBudget } from "@/lib/chunk-queue";
import { advanceIdleReport } from "@/lib/auto-report/sweep";

/**
 * Background runner for customers' unwatched reports (lib/auto-report/sweep.ts) and the prompt backtest. The database scheduler (pg_cron) calls this every minute with a key
 * whose hash is stored in site_settings (chunk_queue_key_hash); the key itself lives only in the scheduler job.
 * Each call claims one queued run (a lease stops two calls working on the same run), runs a batch of its missing
 * pieces and records the progress. A run stops at its own cap, and all runs together stop at the daily cap
 * (lib/chunk-queue.ts). Switched off (404) while no key hash is stored; rows can only be added with the service key.
 */

export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };
const CONCURRENCY = 12;
const START_BEFORE_MS = 28_000;
const LEASE_MS = 100_000;

type Run = {
  id: string; batch: string; prompt_name: string; effort: string | null; sizes: number[]; min_chars: number;
  max_pieces: number; attempted: number; ok_pieces: number; status: string;
};

const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function POST(request: NextRequest) {
  const db = createAdminClient();
  const { data: setting } = await db.from("site_settings").select("value").eq("key", "chunk_queue_key_hash").maybeSingle<{ value: string }>();
  if (!setting?.value) return new NextResponse("Not found", { status: 404 });
  const given = createHash("sha256").update(request.headers.get("x-queue-key") ?? "").digest("hex");
  if (!same(given, setting.value.trim())) return new NextResponse("Unauthorized", { status: 401 });
  if (!deepseekEnabled()) return NextResponse.json({ ok: false, message: "No model key." }, { headers: noStore });
  // Customers' paid reports come first: one that nobody is watching is moved on here, and the backtest waits a minute.
  const report = await advanceIdleReport();
  if (report) return NextResponse.json({ ok: true, report }, { headers: noStore });

  const now = new Date();
  const { data: candidates } = await db
    .from("chunk_queue").select("*").in("status", ["queued", "running"]).or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .order("created_at").limit(1).returns<Run[]>();
  const run = candidates?.[0];
  if (!run) return NextResponse.json({ ok: true, idle: true }, { headers: noStore });

  // Claim it; if another call got there first, the update matches nothing.
  const lease = new Date(now.getTime() + LEASE_MS).toISOString();
  const { data: claimed } = await db.from("chunk_queue").update({ status: "running", lease_until: lease, updated_at: now.toISOString() })
    .eq("id", run.id).or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`).select("id");
  if (!claimed?.length) return NextResponse.json({ ok: true, busy: true }, { headers: noStore });

  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  // The daily cap is for this runner only (runs started by hand on /admin/chunking are not counted).
  const { data: recent } = await db.from("chunk_queue").select("attempted").gte("created_at", since).returns<{ attempted: number }[]>();
  const used = (recent ?? []).reduce((sum, r) => sum + r.attempted, 0);
  const budget = pieceBudget({ maxPieces: run.max_pieces, attempted: run.attempted, usedLast24h: used });
  const release = (patch: Record<string, unknown>) => db.from("chunk_queue").update({ lease_until: null, updated_at: new Date().toISOString(), ...patch }).eq("id", run.id);

  if (budget === 0) {
    const atRunCap = run.attempted >= run.max_pieces;
    // At the daily cap the run waits for tomorrow; at its own cap it stops.
    await release(atRunCap ? { status: "stopped", note: "Reached the cap for this run." } : { status: "queued", note: "Waiting: daily cap reached." });
    return NextResponse.json({ ok: true, budget: 0 }, { headers: noStore });
  }

  const name = run.prompt_name as CandidatePromptName;
  if (!CANDIDATE_PROMPT_NAMES.includes(name)) {
    await release({ status: "stopped", note: "Unknown prompt." });
    return NextResponse.json({ ok: false, message: "Unknown prompt." }, { headers: noStore });
  }
  const effort = REASONING_EFFORTS.includes(run.effort as ReasoningEffort) ? (run.effort as ReasoningEffort) : undefined;

  const { data: samples } = await db.from("chunk_samples").select("id,body").order("created_at").limit(1000).returns<{ id: string; body: string }[]>();
  const { data: doneRows } = await db.from("chunk_trials").select("sample_id,size,idx").eq("batch", run.batch).eq("ok", true).limit(10_000);
  const done = new Set((doneRows ?? []).map((r: { sample_id: string; size: number; idx: number }) => `${r.sample_id}|${r.size}|${r.idx}`));
  const todo: { sampleId: string; size: number; idx: number }[] = [];
  for (const size of run.sizes) {
    for (const s of (samples ?? []).filter((x) => x.body.length >= run.min_chars)) {
      const n = chunkText(s.body, size).length;
      for (let idx = 0; idx < n; idx++) if (!done.has(`${s.id}|${size}|${idx}`)) todo.push({ sampleId: s.id, size, idx });
    }
  }
  if (todo.length === 0) {
    await release({ status: "done", note: null });
    return NextResponse.json({ ok: true, done: true }, { headers: noStore });
  }

  const started = Date.now();
  const limit = Math.min(budget, todo.length);
  let next = 0;
  let tried = 0;
  let ok = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < limit && Date.now() - started < START_BEFORE_MS) {
        const job = todo[next++];
        tried++;
        const r = await runChunkPiece({ ...job, batch: run.batch, effort, prompt: CANDIDATE_PROMPTS[name] });
        if (r.ok) ok++;
      }
    }),
  );
  await release({ status: "queued", attempted: run.attempted + tried, ok_pieces: run.ok_pieces + ok });
  return NextResponse.json({ ok: true, ran: ok, tried, remaining: todo.length - ok }, { headers: noStore });
}
