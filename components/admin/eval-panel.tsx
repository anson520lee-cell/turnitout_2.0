"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { addEvalCase, deleteEvalCase, runEvalCase, type EvalRunSummary } from "@/app/actions/admin-eval";
import type { Confusion, Metrics } from "@/lib/eval";
import { formatDateTime } from "@/lib/utils";

export interface EvalCaseView {
  id: string;
  name: string;
  note: string | null;
  sentences: number;
  flagged: number;
  createdAt: string;
  runs: EvalRunSummary[];
}

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

interface Group {
  label: string;
  runs: EvalRunSummary[];
}

/** Complete runs grouped by model, reasoning and prompt, so the same settings can be averaged. */
function groupRuns(runs: EvalRunSummary[]): Group[] {
  const groups = new Map<string, EvalRunSummary[]>();
  for (const r of runs) {
    if (r.metrics.truncated) continue;
    const label = `${r.model} · reasoning ${r.effort} · ${r.promptLabel}`;
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups.entries()].map(([label, rs]) => ({ label, runs: rs }));
}

function Averages({ runs }: { runs: EvalRunSummary[] }) {
  const groups = groupRuns(runs);
  if (groups.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <p className="mb-1 text-[12.5px] font-medium text-fg">Average by setting</p>
      <table className="w-full min-w-[620px] text-left text-[12.5px] tabular-nums">
        <thead className="text-fg-subtle">
          <tr className="border-b border-[var(--line)]">
            <th className="py-2 pr-3 font-medium">Setting</th>
            <th className="py-2 pr-3 font-medium">Runs</th>
            <th className="py-2 pr-3 font-medium">High: precision / recall</th>
            <th className="py-2 pr-3 font-medium">High+Med: precision / recall</th>
            <th className="py-2 pr-3 font-medium">Paragraphs right (High)</th>
            <th className="py-2 font-medium">Avg time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)] text-fg-muted">
          {groups.map((g) => (
            <tr key={g.label}>
              <td className="py-2 pr-3 text-fg">{g.label}</td>
              <td className="py-2 pr-3">{g.runs.length}</td>
              <td className="py-2 pr-3">{pct(mean(g.runs.map((r) => r.metrics.high.precision)))} / {pct(mean(g.runs.map((r) => r.metrics.high.recall)))}</td>
              <td className="py-2 pr-3">{pct(mean(g.runs.map((r) => r.metrics.highMedium.precision)))} / {pct(mean(g.runs.map((r) => r.metrics.highMedium.recall)))}</td>
              <td className="py-2 pr-3">{pct(mean(g.runs.map((r) => r.metrics.paragraphAccuracyStrict)))}</td>
              <td className="py-2">{Math.round(mean(g.runs.map((r) => r.ms / 1000)) ?? 0)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[12px] text-fg-subtle">The model answers a little differently each time, so compare averages over several runs, not one.</p>
    </div>
  );
}

function ConfusionRow({ label, c }: { label: string; c: Confusion }) {
  return (
    <tr>
      <td className="py-2 pr-3 text-fg">{label}</td>
      <td className="py-2 pr-3">{c.called}</td>
      <td className="py-2 pr-3">{c.hit}</td>
      <td className="py-2 pr-3">{c.falseAlarm ? <span className="text-warn">{c.falseAlarm}</span> : 0}</td>
      <td className="py-2 pr-3">{c.missed}</td>
      <td className="py-2 pr-3">{pct(c.precision)}</td>
      <td className="py-2">{pct(c.recall)}</td>
    </tr>
  );
}

const riskWord = (r: string | null) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : "–");

function RunDetail({ m }: { m: Metrics }) {
  return (
    <div className="mt-3 space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[12.5px] tabular-nums">
          <thead className="text-fg-subtle">
            <tr className="border-b border-[var(--line)]">
              <th className="py-2 pr-3 font-medium">Sentences counted as risky</th>
              <th className="py-2 pr-3 font-medium">Marked</th>
              <th className="py-2 pr-3 font-medium">Right</th>
              <th className="py-2 pr-3 font-medium">False alarm</th>
              <th className="py-2 pr-3 font-medium">Missed</th>
              <th className="py-2 pr-3 font-medium">Precision</th>
              <th className="py-2 font-medium">Recall</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-fg-muted">
            <ConfusionRow label="High only" c={m.high} />
            <ConfusionRow label="High + Medium" c={m.highMedium} />
            <ConfusionRow label="High + Medium + Uncertain" c={m.anyFlag} />
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-[12.5px] tabular-nums">
          <thead className="text-fg-subtle">
            <tr className="border-b border-[var(--line)]">
              <th className="py-2 pr-3 font-medium">Paragraph</th>
              <th className="py-2 pr-3 font-medium">Turnitin flagged</th>
              <th className="py-2 pr-3 font-medium">Reviewer said</th>
              <th className="py-2 font-medium">Agree (High = risky)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-fg-muted">
            {m.paragraphs.map((p) => (
              <tr key={p.p}>
                <td className="py-2 pr-3 text-fg">P{p.p}</td>
                <td className="py-2 pr-3">{p.flagged}/{p.total}</td>
                <td className="py-2 pr-3">{riskWord(p.ai)}</td>
                <td className="py-2">{p.agreesStrict === null ? "–" : p.agreesStrict ? "Yes" : <span className="text-warn">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-fg-subtle">
          Paragraphs right: {pct(m.paragraphAccuracyStrict)} counting only High as risky, {pct(m.paragraphAccuracyLoose)} counting High and Medium. Overall verdict: {riskWord(m.overall)}.
        </p>
      </div>
    </div>
  );
}

function CaseCard({ c }: { c: EvalCaseView }) {
  const router = useRouter();
  const [effort, setEffort] = useState<"saved" | "off" | "low" | "high" | "max">("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [latest, setLatest] = useState<EvalRunSummary | null>(c.runs[0] ?? null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold">{c.name}</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            {c.sentences} sentences, {c.flagged} flagged by Turnitin · added {formatDateTime(c.createdAt)}
          </p>
          {c.note && <p className="mt-0.5 text-[12px] text-fg-subtle">{c.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Reasoning
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as typeof effort)}
              className="h-9 rounded-lg border border-[var(--line)] bg-ink-900/70 px-2 text-[13px] text-fg"
            >
              <option value="saved">as saved</option>
              <option value="off">off</option>
              <option value="low">low</option>
              <option value="high">high</option>
              <option value="max">max</option>
            </select>
          </label>
          {[1, 3].map((times) => (
            <Button
              key={times}
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setMessage(null);
                  for (let i = 1; i <= times; i++) {
                    setProgress(times > 1 ? `Run ${i} of ${times}…` : "Running…");
                    const res = await runEvalCase({ caseId: c.id, ...(effort === "saved" ? {} : { effort }) });
                    if (!res.ok) {
                      setMessage(res.message);
                      break;
                    }
                    setLatest(res.run);
                  }
                  setProgress(null);
                  router.refresh();
                })
              }
            >
              <FlaskConical className="size-3.5" /> {pending && progress ? progress : times === 1 ? "Run on this case" : "Run 3 times"}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={deleting}
            onClick={() => {
              if (!window.confirm(`Delete "${c.name}" and all its runs?`)) return;
              startDelete(async () => {
                const res = await deleteEvalCase(c.id);
                if (!res.ok) setMessage(res.message);
                else router.refresh();
              });
            }}
            aria-label={`Delete ${c.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {message && <div className="mt-3"><FormMessage>{message}</FormMessage></div>}

      {latest ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
            <span className="text-fg">Latest run</span>
            <Badge tone="progress">{latest.model}</Badge>
            <Badge>reasoning {latest.effort}</Badge>
            <Badge>{latest.promptLabel}</Badge>
            <span>{formatDateTime(latest.createdAt)} · {Math.round(latest.ms / 100) / 10}s · {latest.tokens.toLocaleString("en-HK")} tokens</span>
          </div>
          {latest.metrics.truncated && (
            <div className="mt-3">
              <FormMessage tone="info">This run ran out of output budget and the report ends mid-way, so these scores are unreliable. Run it again.</FormMessage>
            </div>
          )}
          <RunDetail m={latest.metrics} />
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-fg-subtle">Not run yet.</p>
      )}

      <Averages runs={c.runs} />

      {c.runs.length > 1 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12.5px] text-fg-muted">Earlier runs ({c.runs.length - 1})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12.5px] tabular-nums">
              <thead className="text-fg-subtle">
                <tr className="border-b border-[var(--line)]">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Model / reasoning</th>
                  <th className="py-2 pr-3 font-medium">Prompt</th>
                  <th className="py-2 pr-3 font-medium">High: precision</th>
                  <th className="py-2 pr-3 font-medium">High+Med: precision / recall</th>
                  <th className="py-2 font-medium">Paragraphs right</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-fg-muted">
                {c.runs.slice(1).map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-fg">{formatDateTime(r.createdAt)}</td>
                    <td className="py-2 pr-3">{r.model} · {r.effort}</td>
                    <td className="py-2 pr-3">{r.promptLabel} ({r.promptChars.toLocaleString("en-HK")})</td>
                    <td className="py-2 pr-3">{pct(r.metrics.high.precision)}</td>
                    <td className="py-2 pr-3">{pct(r.metrics.highMedium.precision)} / {pct(r.metrics.highMedium.recall)}</td>
                    <td className="py-2">{pct(r.metrics.paragraphAccuracyStrict)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function AddCase() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [flagged, setFlagged] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Add a test case
      </Button>
    );
  }
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold">New test case</h3>
      <p className="mt-1 text-[12.5px] text-fg-muted">
        An essay and the sentences Turnitin flagged in it. Use the essay body only (no title or references), the same text you would paste into the scan.
      </p>
      <div className="mt-4 space-y-4">
        <Field label="Name" htmlFor="eval-name">
          <Input id="eval-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AFIC 1005 essay 1 (59% version)" />
        </Field>
        <Field label="Essay text" htmlFor="eval-body" hint="Up to 8,000 characters. Blank lines separate paragraphs.">
          <Textarea id="eval-body" value={body} onChange={(e) => setBody(e.target.value)} className="h-48 resize-y text-[13px]" />
        </Field>
        <Field label="Sentences Turnitin flagged" htmlFor="eval-flagged" hint="One sentence per line, copied from the Turnitin report's highlighted text. A fragment of a sentence is enough.">
          <Textarea id="eval-flagged" value={flagged} onChange={(e) => setFlagged(e.target.value)} className="h-40 resize-y text-[13px]" />
        </Field>
        <Field label="Note (optional)" htmlFor="eval-note">
          <Input id="eval-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Turnitin AI score 59%, Sept 2026" />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMessage(null);
              const res = await addEvalCase({ name, body, flagged, note });
              if (!res.ok) return setMessage({ tone: "error", text: res.message });
              setMessage({
                tone: res.unmatched.length ? "info" : "success",
                text: `Saved: ${res.flagged} of ${res.sentences} sentences marked as flagged.${res.unmatched.length ? ` ${res.unmatched.length} pasted line(s) matched nothing: ${res.unmatched.map((u) => `“${u.slice(0, 50)}…”`).join(", ")}` : ""}`,
              });
              setName("");
              setBody("");
              setFlagged("");
              setNote("");
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save case"}
        </Button>
      </div>
      {message && <div className="mt-3"><FormMessage tone={message.tone}>{message.text}</FormMessage></div>}
    </section>
  );
}

export function EvalPanel({ cases }: { cases: EvalCaseView[] }) {
  return (
    <div className="space-y-5">
      {cases.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No test cases yet. Add an essay with its Turnitin result to start measuring accuracy.</p>
      ) : (
        cases.map((c) => <CaseCard key={c.id} c={c} />)
      )}
      <AddCase />
    </div>
  );
}
