import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { EvalPanel, type EvalCaseView } from "@/components/admin/eval-panel";
import type { EvalRunSummary } from "@/app/actions/admin-eval";
import type { Metrics, TruthSentence } from "@/lib/eval";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Accuracy" };
// Running a case waits for the model.
export const maxDuration = 120;

type CaseRow = { id: string; name: string; note: string | null; sentences: TruthSentence[]; created_at: string };
type RunRow = {
  id: number;
  case_id: string;
  created_at: string;
  model: string;
  effort: string;
  prompt_label: string;
  prompt_chars: number;
  metrics: Metrics;
  ms: number;
  tokens: number;
};

export default async function AdminEval() {
  await assertAdmin();
  const db = createAdminClient();
  const [{ data: cases }, { data: runs }] = await Promise.all([
    db.from("eval_cases").select("id,name,note,sentences,created_at").order("created_at", { ascending: false }),
    db.from("eval_runs").select("id,case_id,created_at,model,effort,prompt_label,prompt_chars,metrics,ms,tokens").order("created_at", { ascending: false }).limit(200),
  ]);
  const runsByCase = new Map<string, EvalRunSummary[]>();
  for (const r of (runs ?? []) as RunRow[]) {
    const list = runsByCase.get(r.case_id) ?? [];
    list.push({ id: r.id, createdAt: r.created_at, model: r.model, effort: r.effort, promptLabel: r.prompt_label, promptChars: r.prompt_chars, metrics: r.metrics, ms: r.ms, tokens: r.tokens });
    runsByCase.set(r.case_id, list);
  }
  const views: EvalCaseView[] = ((cases ?? []) as CaseRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    note: c.note,
    sentences: c.sentences.length,
    flagged: c.sentences.filter((s) => s.flagged).length,
    createdAt: c.created_at,
    runs: runsByCase.get(c.id) ?? [],
  }));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Accuracy</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
        How well the self-check report matches what Turnitin really flagged. Each test case is an essay with its known Turnitin result; run the reviewer on it
        (with the prompt, model and reasoning you have set) and compare. Use it after you change the prompt or the model, to see if it got better or worse.
      </p>
      <Card className="mt-6 p-5">
        <EvalPanel cases={views} />
        <div className="mt-6 space-y-1.5 border-t border-[var(--line)] pt-4 text-[12px] leading-relaxed text-fg-subtle">
          <p>How to read it:</p>
          <p>· <strong className="text-fg-muted">Precision</strong>: of the sentences the reviewer marked, how many Turnitin really flagged. Low precision means false alarms.</p>
          <p>· <strong className="text-fg-muted">Recall</strong>: of the sentences Turnitin flagged, how many the reviewer found. Low recall means it missed some.</p>
          <p>· Each run costs a few cents. One essay is a small sample: look at the trend over several cases and runs, not one number.</p>
          <p>· The text and flags you add are stored in your database, visible only to admin accounts.</p>
        </div>
      </Card>
    </>
  );
}
