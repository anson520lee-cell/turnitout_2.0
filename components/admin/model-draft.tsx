"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Cpu, RotateCcw, Sparkles } from "lucide-react";
import { requestRefinementDraft } from "@/app/actions/admin";
import type { DraftJob, WorkerStatus } from "@/lib/local-model/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { formatDateTime } from "@/lib/utils";

/**
 * Where the local model's first draft of a refinement order stands. The draft
 * itself is loaded into the revision editor (RefinementResultForm); nothing
 * reaches the customer until the admin saves and completes the order.
 */
export function ModelDraftStatus({
  orderId,
  draft,
  worker,
  canRequest,
}: {
  orderId: string;
  draft: DraftJob | null;
  worker: WorkerStatus;
  canRequest: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const waiting = draft?.status === "queued" || draft?.status === "running";

  // Pick up the worker's progress without a manual reload.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [waiting, router]);

  const request = () =>
    start(async () => {
      setError(null);
      const res = await requestRefinementDraft(orderId);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });

  const workerLine = worker.online
    ? `Your computer is online${worker.model ? ` (${worker.model})` : ""}.`
    : worker.lastSeenAt
      ? `Your computer was last seen ${formatDateTime(worker.lastSeenAt)}. The draft starts when the worker is running again.`
      : "The worker on your computer hasn't connected yet. See README > Local writing model.";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Cpu className="size-4 text-[#c7b8ff]" aria-hidden /> Model draft
        </h2>
        {!draft ? (
          <Badge>None yet</Badge>
        ) : draft.status === "queued" ? (
          <Badge tone="warn" dot>Waiting for your computer</Badge>
        ) : draft.status === "running" ? (
          <Badge tone="progress" dot>Being written</Badge>
        ) : draft.status === "done" ? (
          <Badge tone="success" dot>Ready to review</Badge>
        ) : (
          <Badge tone="danger" dot>Failed</Badge>
        )}
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
        {!draft && "Your local model can write a first draft for you to review and edit."}
        {draft?.status === "queued" && workerLine}
        {draft?.status === "running" && `Started ${formatDateTime(draft.created_at)}${draft.attempts > 1 ? ` (try ${draft.attempts})` : ""}. Long texts are written section by section.`}
        {draft?.status === "done" &&
          `${(draft.output_text?.length ?? 0).toLocaleString("en-HK")} characters${draft.model ? ` from ${draft.model}` : ""}, ${formatDateTime(draft.finished_at)}. Load it into the editor below and check every change before saving.`}
        {draft?.status === "failed" && (draft.error ?? "The model couldn't write this draft.")}
      </p>

      {canRequest && !waiting && (
        <Button size="sm" variant="secondary" className="mt-3" loading={pending} onClick={request}>
          {draft ? <RotateCcw className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {draft ? "Ask for a new draft" : "Ask the model for a draft"}
        </Button>
      )}
      {error && (
        <div className="mt-3">
          <FormMessage>{error}</FormMessage>
        </div>
      )}
    </Card>
  );
}
