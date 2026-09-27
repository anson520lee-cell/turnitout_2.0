"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import {
  updateOrderStatus,
  saveChecklist,
  saveScreeningResult,
  getReportUploadUrl,
  saveRefinementResult,
  addAdminNote,
  setWordCount,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { FileDrop, UploadProgress } from "@/components/orders/file-drop";
import { nextStatuses, statusMeta, type OrderStatus } from "@/lib/orders/status";
import { uploadWithProgress } from "@/lib/upload-client";
import type { AdminChecklist, ScreeningResultRow } from "@/types/domain";
import type { ServiceType } from "@/config/pricing";

type Msg = { ok: boolean; message: string } | null;

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, success = "Saved.") =>
    start(async () => {
      setMsg(null);
      try {
        const r = await fn();
        setMsg(r.ok ? { ok: true, message: success } : { ok: false, message: r.message });
        if (r.ok) router.refresh();
      } catch (e) {
        setMsg({ ok: false, message: e instanceof Error ? e.message : "Request failed." });
      }
    });
  return { msg, pending, run };
}

export function StatusControls({ orderId, type, status }: { orderId: string; type: ServiceType; status: OrderStatus }) {
  const { msg, pending, run } = useAction();
  const options = nextStatuses(type, status);
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold">Status</h2>
      <p className="mt-1 text-[12.5px] text-fg-muted">Current: {statusMeta[status].label}. {status === "awaiting_payment" && "Moves to Paid automatically when Stripe confirms payment."}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === "cancelled" ? "danger" : "primary"}
            disabled={pending}
            onClick={() => {
              if (s === "cancelled" && !confirm("Cancel this order? Refund any payment in Stripe separately.")) return;
              if (s === "completed" && !confirm("Release the result to the customer?")) return;
              run(() => updateOrderStatus(orderId, s), `Moved to ${statusMeta[s].label}.`);
            }}
          >
            {s === "completed" ? "Complete & release to customer" : `Move to ${statusMeta[s].label}`}
          </Button>
        ))}
        {!options.length && <p className="text-[12.5px] text-fg-subtle">No further transitions.</p>}
      </div>
      {msg && <div className="mt-3"><FormMessage tone={msg.ok ? "success" : "error"}>{msg.message}</FormMessage></div>}
    </Card>
  );
}

export function ChecklistControls({ orderId, checklist }: { orderId: string; checklist: AdminChecklist }) {
  const { msg, pending, run } = useAction();
  const [noRepo, setNoRepo] = useState(!!checklist.no_repository_confirmed);
  const [removed, setRemoved] = useState(!!checklist.external_copy_removed);
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold">Processing checklist</h2>
      <div className="mt-3 flex gap-2 rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-[12.5px] leading-relaxed text-[#f7d9a0]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        Submit through an assignment set to <strong>&nbsp;no repository / do not store&nbsp;</strong>. A stored copy will match the customer&rsquo;s real submission later at close to 100%.
      </div>
      <div className="mt-4 space-y-3">
        <Checkbox id="norepo" checked={noRepo} onChange={setNoRepo} disabled={pending}>
          Screening assignment is set to <strong className="text-fg">no repository</strong> (required before Screening)
        </Checkbox>
        <Checkbox id="removed" checked={removed} onChange={setRemoved} disabled={pending}>
          Submission removed from the external workspace after screening
        </Checkbox>
      </div>
      <Button size="sm" variant="secondary" className="mt-4" loading={pending} onClick={() => run(() => saveChecklist({ orderId, no_repository_confirmed: noRepo, external_copy_removed: removed }))}>
        Save checklist
      </Button>
      {checklist.no_repository_confirmed_at && <p className="mt-2 text-[11.5px] text-fg-subtle">Confirmed {new Date(checklist.no_repository_confirmed_at).toLocaleString("en-HK", { timeZone: "Asia/Hong_Kong" })}</p>}
      {msg && <div className="mt-3"><FormMessage tone={msg.ok ? "success" : "error"}>{msg.message}</FormMessage></div>}
    </Card>
  );
}

function toLocalInput(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function ScreeningResultForm({ orderId, type, existing, closed }: { orderId: string; type: ServiceType; existing: ScreeningResultRow | null; closed: boolean }) {
  const { msg, pending, run } = useAction();
  const wantsAi = type !== "similarity_screening";
  const wantsSim = type !== "ai_screening";
  const [ai, setAi] = useState(existing?.ai_indicator?.toString() ?? "");
  const [aiNote, setAiNote] = useState(existing?.ai_indicator_note ?? "");
  const [sim, setSim] = useState(existing?.similarity_percentage?.toString() ?? "");
  const [when, setWhen] = useState(toLocalInput(existing?.screening_completed_at));
  const [notes, setNotes] = useState(existing?.admin_notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold">Screening result</h2>
      <p className="mt-1 text-[12.5px] text-fg-muted">Enter exactly what the screening returned. Leave a value blank if it wasn&rsquo;t returned; never estimate.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {wantsAi && (
          <Field label="AI-writing indicator (%)" htmlFor="ai" hint="Blank if not returned">
            <Input id="ai" inputMode="decimal" value={ai} onChange={(e) => setAi(e.target.value)} disabled={closed} />
          </Field>
        )}
        {wantsSim && (
          <Field label="Similarity (%)" htmlFor="sim" hint="Blank if not returned">
            <Input id="sim" inputMode="decimal" value={sim} onChange={(e) => setSim(e.target.value)} disabled={closed} />
          </Field>
        )}
        {wantsAi && (
          <Field label="If AI indicator not returned, why?" htmlFor="ainote" className="sm:col-span-2" hint="Shown to the customer, e.g. “Document below the minimum length for AI-writing detection.”">
            <Input id="ainote" value={aiNote} onChange={(e) => setAiNote(e.target.value)} maxLength={300} disabled={closed} />
          </Field>
        )}
        <Field label="Screening performed at" htmlFor="when">
          <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={closed} />
        </Field>
      </div>
      <div className="mt-4">
        <p className="mb-1.5 text-[13px] font-medium">Report file {existing?.report_file_name && <span className="font-normal text-fg-subtle">· current: {existing.report_file_name}</span>}</p>
        <FileDrop id="report" file={file} onFile={setFile} disabled={closed || pending} accept=".pdf,.docx" label="PDF or DOCX" />
        {progress !== null && <div className="mt-3"><UploadProgress value={progress} /></div>}
      </div>
      <Field label="Internal result notes" htmlFor="rnotes" className="mt-4" hint="Not shown to the customer">
        <Textarea id="rnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={closed} />
      </Field>
      {!closed && (
        <Button
          className="mt-4"
          loading={pending}
          onClick={() =>
            run(async () => {
              let report: { path: string; fileName: string } | undefined;
              if (file) {
                const u = await getReportUploadUrl(orderId, file.name);
                if (!u.ok) return u;
                setProgress(0);
                await uploadWithProgress(u.uploadUrl, file, setProgress);
                report = { path: u.path, fileName: file.name };
              }
              const r = await saveScreeningResult(
                {
                  orderId,
                  aiIndicator: ai.trim(),
                  aiIndicatorNote: aiNote,
                  similarityPercentage: sim.trim(),
                  screeningCompletedAt: new Date(when).toISOString(),
                  adminNotes: notes,
                },
                report,
              );
              setProgress(null);
              if (r.ok) setFile(null);
              return r;
            }, "Result saved. Move the order to Report Ready, then Complete to release it.")
          }
        >
          Save result
        </Button>
      )}
      {msg && <div className="mt-3"><FormMessage tone={msg.ok ? "success" : "error"}>{msg.message}</FormMessage></div>}
    </Card>
  );
}

export function RefinementResultForm({ orderId, revised, reviewerNotes, closed }: { orderId: string; revised: string; reviewerNotes: string; closed: boolean }) {
  const { msg, pending, run } = useAction();
  const [text, setText] = useState(revised);
  const [notes, setNotes] = useState(reviewerNotes);
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold">Revised text</h2>
      <p className="mt-1 text-[12.5px] text-fg-muted">Keep citations exactly as submitted unless the customer asked otherwise. Never add sources.</p>
      <Field label="Revision" htmlFor="rev" className="mt-4">
        <Textarea id="rev" rows={14} className="font-serif" value={text} onChange={(e) => setText(e.target.value)} disabled={closed} />
      </Field>
      <Field label="Reviewer notes (shown to customer)" htmlFor="revnotes" className="mt-4">
        <Textarea id="revnotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={closed} />
      </Field>
      {!closed && <Button className="mt-4" loading={pending} onClick={() => run(() => saveRefinementResult({ orderId, revisedText: text, reviewerNotes: notes }))}>Save revision</Button>}
      {msg && <div className="mt-3"><FormMessage tone={msg.ok ? "success" : "error"}>{msg.message}</FormMessage></div>}
    </Card>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const { msg, pending, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <div>
      <label htmlFor="note" className="sr-only">Add internal note</label>
      <Textarea id="note" rows={2} placeholder="Add an internal note" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button size="sm" variant="secondary" className="mt-2" loading={pending} disabled={!body.trim()} onClick={() => run(async () => { const r = await addAdminNote(orderId, body); if (r.ok) setBody(""); return r; }, "Note added.")}>
        Add note
      </Button>
      {msg && !msg.ok && <div className="mt-2"><FormMessage>{msg.message}</FormMessage></div>}
    </div>
  );
}

export function WordCountForm({ orderId, value }: { orderId: string; value: number | null }) {
  const { msg, pending, run } = useAction();
  const [v, setV] = useState(value?.toString() ?? "");
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="wc" className="sr-only">Word count</label>
      <Input id="wc" inputMode="numeric" className="h-9 w-28" value={v} onChange={(e) => setV(e.target.value)} />
      <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setWordCount(orderId, Number(v)))}>Set</Button>
      {msg && !msg.ok && <span className="text-[12px] text-risk">{msg.message}</span>}
    </div>
  );
}
