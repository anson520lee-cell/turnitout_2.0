"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { createScreeningOrder, confirmUpload } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { FileDrop, UploadProgress, validateFile } from "./file-drop";
import { formatHKD, screeningPrices, type ScreeningServiceType } from "@/config/pricing";
import { serviceLabels, disclaimers } from "@/config/services";
import { uploadWithProgress } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const OPTIONS: { id: ScreeningServiceType; desc: string }[] = [
  { id: "ai_screening", desc: "Turnitin AI-writing indicator" },
  { id: "similarity_screening", desc: "Turnitin similarity percentage and report" },
  { id: "combined_screening", desc: "Both, from one screening run" },
];

export function ScreeningForm({ initialType }: { initialType: ScreeningServiceType }) {
  const router = useRouter();
  const [type, setType] = useState<ScreeningServiceType>(initialType);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "creating" | "uploading" | "verifying">("idle");
  const [progress, setProgress] = useState(0);
  const busy = stage !== "idle";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Enter a document title.");
    if (!file) return setFileError("Choose a PDF or DOCX file.");
    const fe = validateFile(file);
    if (fe) return setFileError(fe);
    if (!integrity) return setError("Please confirm you are authorised to submit this document.");

    setStage("creating");
    const res = await createScreeningOrder({
      title,
      serviceType: type,
      notes,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      integrity: true,
    }).catch(() => ({ ok: false as const, message: "Network error. Please check your connection." }));
    if (!res.ok) {
      setStage("idle");
      return setError(res.message);
    }
    track("order_created", { service: type });

    setStage("uploading");
    try {
      await uploadWithProgress(res.uploadUrl, file, setProgress);
    } catch {
      setStage("idle");
      return setError("The upload didn't complete. Check your connection and try again. You won't be charged.");
    }

    setStage("verifying");
    const ok = await confirmUpload(res.orderId).catch(() => ({ ok: false as const, message: "Network error while checking the file." }));
    if (!ok.ok) {
      setStage("idle");
      return setError(ok.message);
    }
    router.push(`/orders/${res.orderId}?created=1`);
  };

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]" noValidate>
      <div className="space-y-5">
        <Card className="p-5 sm:p-6">
          <fieldset>
            <legend className="text-[13px] font-medium">Screening type</legend>
            <div className="mt-3 grid gap-2.5">
              {OPTIONS.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition",
                    type === o.id ? "border-accent/50 bg-accent/[0.07] shadow-[0_0_0_1px_rgb(91_140_255/0.2)]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
                  )}
                >
                  <input type="radio" name="type" value={o.id} checked={type === o.id} onChange={() => setType(o.id)} className="sr-only" disabled={busy} />
                  <span className={cn("grid size-5 place-items-center rounded-full border", type === o.id ? "border-accent bg-accent" : "border-[var(--line-strong)]")}>
                    {type === o.id && <Check className="size-3 text-white" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium">{serviceLabels[o.id]}</span>
                    <span className="block text-[12.5px] text-fg-muted">{o.desc}</span>
                  </span>
                  <span className="text-[14px] font-semibold">{formatHKD(screeningPrices[o.id])}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
        <Card className="space-y-5 p-5 sm:p-6">
          <Field label="Document title" htmlFor="title" hint="For your reference, e.g. “SOCI2001 Essay – final”.">
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} required />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Document</p>
            <FileDrop
              file={file}
              disabled={busy}
              error={fileError}
              onFile={(f) => {
                setFileError(f ? validateFile(f) : null);
                setFile(f);
              }}
            />
          </div>
          <Field label="Notes (optional)" htmlFor="notes" hint="Anything the reviewer should know, e.g. exclude the bibliography.">
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} disabled={busy} />
          </Field>
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        <Card strong className="p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Order summary</p>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[14px]">{serviceLabels[type]}</span>
            <span className="text-2xl font-semibold">{formatHKD(screeningPrices[type])}</span>
          </div>
          <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-4 text-[12.5px] text-fg-muted">
            <li>Processed by a person using Turnitin</li>
            <li>Run with repository storage off</li>
            <li>Result and report delivered to your dashboard</li>
            <li>Values shown only if the screening returned them</li>
          </ul>
          <div className="mt-5">
            <Checkbox id="integrity" checked={integrity} onChange={setIntegrity} disabled={busy}>
              I wrote this document myself, or I am otherwise authorised to submit it.
            </Checkbox>
          </div>
          {stage === "uploading" && <div className="mt-5"><UploadProgress value={progress} /></div>}
          <div className="mt-5"><FormMessage>{error}</FormMessage></div>
          <Button type="submit" size="lg" className="mt-3 w-full" loading={busy}>
            {stage === "creating" ? "Creating order" : stage === "uploading" ? "Uploading" : stage === "verifying" ? "Checking file" : "Continue to payment"}
          </Button>
          <p className="mt-3 text-center text-[11.5px] text-fg-subtle">You&rsquo;ll review the order before paying.</p>
        </Card>
        <p className="px-1 text-[11.5px] leading-relaxed text-fg-subtle">{disclaimers.turnitin} {disclaimers.noGuarantee}</p>
      </div>
    </form>
  );
}
