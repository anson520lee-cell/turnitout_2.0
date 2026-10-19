"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import {
  addChunkSample,
  addChunkSamplesBulk,
  createMixedSample,
  deleteChunkSample,
  importEvalCases,
  loadStarterSamples,
} from "@/app/actions/admin-chunking";
import { ORIGIN_LABEL } from "@/lib/chunk-samples";
import type { Origin } from "@/lib/chunk-eval";

export interface SampleView {
  id: string;
  name: string;
  origin: Origin;
  chars: number;
  sentences: number;
  flagged: number;
  note: string | null;
  /** Number of pieces at each tested size. */
  pieces: Record<number, number>;
}

type Msg = { tone: "error" | "success" | "info"; text: string } | null;
const CONCURRENCY = 4;
/** Rough cost of one piece in US dollars, from the usage log (about 2,300 tokens in, 5,800 out at the peak-hour price). */
const USD_PER_PIECE = 0.008;

function RunBox({ samples, done, sizes, minChars }: { samples: SampleView[]; done: string[]; sizes: number[]; minChars: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([1000, 2000, 3000]);
  const [effort, setEffort] = useState<"saved" | "off" | "low">("saved");
  const [label, setLabel] = useState(() => `run-${new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "")}`);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stop = useRef(false);

  const doneSet = new Set(done);
  const usable = samples.filter((s) => s.chars >= minChars);
  const jobs = usable.flatMap((s) =>
    picked.flatMap((size) =>
      Array.from({ length: s.pieces[size] ?? 0 }, (_, idx) => ({ sampleId: s.id, size, idx })).filter((j) => !doneSet.has(`${label}|${j.sampleId}|${j.size}|${j.idx}`)),
    ),
  );
  const hkd = Math.round(jobs.length * USD_PER_PIECE * 7.8);

  async function start() {
    stop.current = false;
    setRunning(true);
    setMessage(null);
    let finished = 0;
    let failed = 0;
    const queue = [...jobs];
    setProgress({ done: 0, total: queue.length, failed: 0 });
    const worker = async () => {
      while (!stop.current) {
        const job = queue.shift();
        if (!job) return;
        try {
          const res = await fetch("/api/admin/chunk-run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...job, batch: label, ...(effort === "saved" ? {} : { effort }) }),
          });
          const data = (await res.json()) as { ok: boolean; message?: string };
          if (!data.ok) {
            failed += 1;
            setMessage(data.message ?? "A piece failed.");
          }
        } catch {
          failed += 1;
        }
        finished += 1;
        setProgress({ done: finished, total: jobs.length, failed });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold">Run the test</h3>
      <p className="mt-1 text-[12.5px] text-fg-muted">
        Every sample of at least {minChars.toLocaleString("en-HK")} characters is cut at each piece size you tick, and every piece is checked. Keep this page open while it runs;
        finished pieces are saved, so you can stop and start again with the same run name to continue.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {sizes.map((s) => (
          <label key={s} className="flex items-center gap-2 text-[13px] text-fg-muted">
            <input type="checkbox" disabled={running} checked={picked.includes(s)} onChange={(e) => setPicked(e.target.checked ? [...picked, s].sort((a, b) => a - b) : picked.filter((x) => x !== s))} />
            {s.toLocaleString("en-HK")} characters
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <Field label="Run name" htmlFor="chunk-label" hint="Same name = continue; new name = a fresh repeat.">
          <Input id="chunk-label" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 60))} disabled={running} className="w-44" />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-[12.5px] text-fg-muted">
          Reasoning
          <select value={effort} disabled={running} onChange={(e) => setEffort(e.target.value as typeof effort)} className="h-9 rounded-lg border border-[var(--line)] bg-ink-900/70 px-2 text-[13px] text-fg">
            <option value="saved">as saved</option>
            <option value="off">off (faster)</option>
            <option value="low">low</option>
          </select>
        </label>
        {running ? (
          <Button type="button" variant="secondary" onClick={() => (stop.current = true)}><Square className="size-3.5" /> Stop</Button>
        ) : (
          <Button type="button" disabled={jobs.length === 0 || picked.length === 0} onClick={start}>
            <FlaskConical className="size-3.5" /> Start ({jobs.length} pieces, about HK${hkd})
          </Button>
        )}
      </div>
      {progress && (
        <p className="mt-3 text-[12.5px] text-fg-muted">
          {progress.done} of {progress.total} pieces done{progress.failed ? `, ${progress.failed} failed` : ""}{running ? "…" : ". Finished: results are above."}
        </p>
      )}
      {message && <div className="mt-3"><FormMessage tone="error">{message}</FormMessage></div>}
    </section>
  );
}

function AddBox() {
  const router = useRouter();
  const [mode, setMode] = useState<"one" | "bulk" | null>(null);
  const [origin, setOrigin] = useState<"human" | "ai" | "turnitin">("human");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [flagged, setFlagged] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setMode("one")}>Add one text</Button>
        <Button type="button" variant="secondary" onClick={() => setMode("bulk")}>Add many texts at once</Button>
      </div>
    );
  }
  const save = () =>
    start(async () => {
      setMsg(null);
      if (mode === "one") {
        const res = await addChunkSample({ name, origin, body, flagged, note });
        if (!res.ok) return setMsg({ tone: "error", text: res.message });
        setMsg({
          tone: res.unmatched.length ? "info" : "success",
          text: `Saved: ${res.sentences} sentences${origin === "turnitin" ? `, ${res.flagged} marked as flagged` : ""}.${res.unmatched.length ? ` ${res.unmatched.length} pasted line(s) matched nothing.` : ""}`,
        });
      } else {
        const res = await addChunkSamplesBulk({ origin: origin === "ai" ? "ai" : "human", namePrefix: name || "Text", text: body });
        if (!res.ok) return setMsg({ tone: "error", text: res.message });
        setMsg({ tone: "success", text: `Saved ${res.added} texts${res.skipped ? `; ${res.skipped} skipped (under 500 or over 30,000 characters)` : ""}.` });
      }
      setName("");
      setBody("");
      setFlagged("");
      setNote("");
      router.refresh();
    });
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold">{mode === "one" ? "Add one text" : "Add many texts"}</h3>
      <div className="mt-4 space-y-4">
        <Field label="Who wrote it" htmlFor="chunk-origin">
          <select id="chunk-origin" value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} className="h-10 rounded-lg border border-[var(--line)] bg-ink-900/70 px-2 text-[13px] text-fg">
            <option value="human">A person (every sentence is human)</option>
            <option value="ai">An AI (every sentence is AI)</option>
            {mode === "one" && <option value="turnitin">Marked by Turnitin (I will paste the flagged sentences)</option>}
          </select>
        </Field>
        <Field label={mode === "one" ? "Name" : "Name prefix"} htmlFor="chunk-name">
          <Input id="chunk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "one" ? "e.g. Friend's essay, Gemini essay on tourism" : "e.g. ChatGPT essay"} />
        </Field>
        <Field label="Text" htmlFor="chunk-body" hint={mode === "one" ? "500 to 30,000 characters. Blank lines separate paragraphs." : "Separate texts with a line of =====. Each 500 to 30,000 characters."}>
          <Textarea id="chunk-body" value={body} onChange={(e) => setBody(e.target.value)} className="h-48 resize-y text-[13px]" />
        </Field>
        {mode === "one" && origin === "turnitin" && (
          <Field label="Sentences Turnitin flagged" htmlFor="chunk-flagged" hint="One per line, copied from the Turnitin report.">
            <Textarea id="chunk-flagged" value={flagged} onChange={(e) => setFlagged(e.target.value)} className="h-32 resize-y text-[13px]" />
          </Field>
        )}
        {mode === "one" && (
          <Field label="Note (optional)" htmlFor="chunk-note">
            <Input id="chunk-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setMode(null); setMsg(null); }}>Close</Button>
        <Button type="button" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {msg && <div className="mt-3"><FormMessage tone={msg.tone}>{msg.text}</FormMessage></div>}
    </section>
  );
}

function MixBox({ samples }: { samples: SampleView[] }) {
  const router = useRouter();
  const humans = samples.filter((s) => s.origin === "human");
  const ais = samples.filter((s) => s.origin === "ai");
  const [h, setH] = useState("");
  const [a, setA] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  if (humans.length === 0 || ais.length === 0) return null;
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold">Make a mixed text</h3>
      <p className="mt-1 text-[12.5px] text-fg-muted">Joins a human text and an AI text, two paragraphs at a time. We know which paragraphs are which, so it tests whether a piece that contains both is judged correctly.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select value={h} onChange={(e) => setH(e.target.value)} className="h-10 max-w-[260px] rounded-lg border border-[var(--line)] bg-ink-900/70 px-2 text-[13px] text-fg">
          <option value="">Human text…</option>
          {humans.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={a} onChange={(e) => setA(e.target.value)} className="h-10 max-w-[260px] rounded-lg border border-[var(--line)] bg-ink-900/70 px-2 text-[13px] text-fg">
          <option value="">AI text…</option>
          {ais.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !h || !a}
          onClick={() =>
            start(async () => {
              const hn = humans.find((s) => s.id === h)?.name ?? "human";
              const an = ais.find((s) => s.id === a)?.name ?? "AI";
              const res = await createMixedSample({ humanId: h, aiId: a, name: `Mixed: ${hn} + ${an}`.slice(0, 120) });
              if (!res.ok) return setMsg({ tone: "error", text: res.message });
              setMsg({ tone: "success", text: "Mixed text saved." });
              router.refresh();
            })
          }
        >
          Make it
        </Button>
      </div>
      {msg && <div className="mt-3"><FormMessage tone={msg.tone}>{msg.text}</FormMessage></div>}
    </section>
  );
}

export function ChunkPanel({ samples, done, sizes, minChars }: { samples: SampleView[]; done: string[]; sizes: number[]; minChars: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();
  const counts = (o: Origin) => samples.filter((s) => s.origin === o).length;

  return (
    <div className="space-y-5">
      <RunBox samples={samples} done={done} sizes={sizes} minChars={minChars} />

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold">Sample texts ({samples.length})</h3>
            <p className="text-[12.5px] text-fg-muted">
              {counts("human")} human · {counts("ai")} AI · {counts("turnitin")} Turnitin-marked · {counts("mixed")} mixed
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => {
              const res = await loadStarterSamples();
              setMsg(res.ok ? { tone: "success", text: res.added ? `Loaded ${res.added} starter texts.` : "The starter set is already loaded." } : { tone: "error", text: res.message });
              router.refresh();
            })}>Load starter set</Button>
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => {
              const res = await importEvalCases();
              setMsg(res.ok ? { tone: "success", text: res.added ? `Copied ${res.added} Turnitin case(s) from the Accuracy page.` : "Nothing new to copy." } : { tone: "error", text: res.message });
              router.refresh();
            })}>Copy Turnitin cases</Button>
          </div>
        </div>
        {msg && <div className="mt-3"><FormMessage tone={msg.tone}>{msg.text}</FormMessage></div>}
        {samples.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px] tabular-nums">
              <thead className="text-fg-subtle">
                <tr className="border-b border-[var(--line)]">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 font-medium">Characters</th>
                  <th className="py-2 pr-3 font-medium">Sentences (flagged)</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-fg-muted">
                {samples.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3 text-fg">{s.name}</td>
                    <td className="py-2 pr-3"><Badge>{ORIGIN_LABEL[s.origin]}</Badge></td>
                    <td className="py-2 pr-3">{s.chars.toLocaleString("en-HK")}</td>
                    <td className="py-2 pr-3">{s.sentences} ({s.flagged})</td>
                    <td className="py-2 text-right">
                      <Button type="button" variant="ghost" size="sm" disabled={deleting} aria-label={`Delete ${s.name}`} onClick={() => {
                        if (!window.confirm(`Delete "${s.name}" and its results?`)) return;
                        startDelete(async () => {
                          const res = await deleteChunkSample(s.id);
                          if (!res.ok) setMsg({ tone: "error", text: res.message });
                          else router.refresh();
                        });
                      }}><Trash2 className="size-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddBox />
      <MixBox samples={samples} />
    </div>
  );
}
