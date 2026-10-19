import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { ChunkPanel, type SampleView } from "@/components/admin/chunk-panel";
import { ChunkResults } from "@/components/admin/chunk-results";
import { chunkText } from "@/lib/chunking";
import { summarize, type Origin, type Sample, type Trial } from "@/lib/chunk-eval";
import type { TruthSentence } from "@/lib/eval";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Piece size" };
export const maxDuration = 120;

export const SIZES = [750, 1000, 1500, 2000, 3000, 4000] as const;

type SampleRow = { id: string; name: string; origin: Origin; body: string; sentences: TruthSentence[]; note: string | null; created_at: string };
type TrialRow = {
  sample_id: string; batch: string; size: number; idx: number; first_sentence: number; chunk: string; model: string; effort: string;
  report: string; ok: boolean; truncated: boolean; ms: number; tokens: number;
};

/** Reads every row, a page at a time (the database returns at most 1,000 rows per request). */
async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await read(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export default async function AdminChunking({ searchParams }: PageProps<"/admin/chunking">) {
  await assertAdmin();
  const sp = await searchParams;
  const minRaw = Number(Array.isArray(sp.min) ? sp.min[0] : sp.min);
  const minChars = Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : 3000;

  const db = createAdminClient();
  const [samples, trials] = await Promise.all([
    readAll<SampleRow>((a, b) => db.from("chunk_samples").select("id,name,origin,body,sentences,note,created_at").order("created_at").range(a, b)),
    readAll<TrialRow>((a, b) => db.from("chunk_trials").select("sample_id,batch,size,idx,first_sentence,chunk,model,effort,report,ok,truncated,ms,tokens").order("id").range(a, b)),
  ]);

  const views: SampleView[] = samples.map((s) => ({
    id: s.id,
    name: s.name,
    origin: s.origin,
    chars: s.body.length,
    sentences: s.sentences.length,
    flagged: s.sentences.filter((x) => x.flagged).length,
    note: s.note,
    pieces: Object.fromEntries(SIZES.map((size) => [size, chunkText(s.body, size).length])),
  }));
  const done = trials.filter((t) => t.ok).map((t) => `${t.batch}|${t.sample_id}|${t.size}|${t.idx}`);

  const eligible = new Map<string, Sample>(
    samples.filter((s) => s.body.length >= minChars).map((s) => [s.id, { id: s.id, origin: s.origin, body: s.body, sentences: s.sentences }]),
  );
  const scored: Trial[] = trials
    .filter((t) => eligible.has(t.sample_id))
    .map((t) => ({
      sampleId: t.sample_id, size: t.size, model: t.model, effort: t.effort, batch: t.batch, first: t.first_sentence,
      chunk: t.chunk, report: t.report, ok: t.ok, truncated: t.truncated, ms: t.ms, tokens: t.tokens,
    }));
  const rows = summarize(scored, eligible);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Piece size</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
        Finds the best length for each piece when a long text is cut up and checked piece by piece. The same texts are cut at several lengths, each piece goes through the reviewer
        (the prompt, model and reasoning you have saved), and the answers are compared with what we already know about every sentence.
      </p>
      <Card className="mt-6 p-5">
        <ChunkResults rows={rows} minChars={minChars} eligible={eligible.size} total={samples.length} />
      </Card>
      <Card className="mt-6 p-5">
        <ChunkPanel samples={views} done={done} sizes={[...SIZES]} minChars={minChars} />
      </Card>
    </>
  );
}
