"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { deleteScanReport } from "@/app/actions/scan-report";
import { retention } from "@/config/app";
import { overallRisk, parseReport } from "@/lib/report-format";
import { formatDateTime } from "@/lib/utils";
import { ReportView, riskPrintClass, riskStyle } from "./report-view";

/** A written report the user saved with a scan, shown on the saved-scan page. */
export function SavedReport({ scanId, report, savedAt }: { scanId: string; report: string; savedAt: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  const blocks = parseReport(report);
  const overall = overallRisk(blocks);
  const verdict = overall ? riskStyle[overall] : null;

  if (gone) return null;
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-violet/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-violet/15 text-[#b4bccf]">
            <MessageSquareText className="size-3.5" />
          </span>
          Self-check report
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {verdict && <Badge tone={verdict.tone} className={riskPrintClass[verdict.tone]}>Review: {verdict.label} risk</Badge>}
          <Badge tone="progress" className="print:border-[#3a4258] print:bg-transparent print:text-[#3a4258]">Written by our language model</Badge>
        </div>
      </div>
      <ReportView blocks={blocks} />
      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3 print:hidden">
        <p className="text-[12px] leading-relaxed text-fg-subtle">
          {savedAt ? `Saved ${formatDateTime(savedAt)}. ` : ""}Only you and authorised staff can see it. It is deleted {retention.savedReportDays} days after saving, or sooner if you delete it.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Delete this saved report? The scan's scores stay.")) return;
            start(async () => {
              const res = await deleteScanReport(scanId);
              if (!res.ok) setError(res.message);
              else {
                setGone(true);
                router.refresh();
              }
            });
          }}
        >
          <Trash2 className="size-3.5" /> Delete report
        </Button>
      </div>
      {error && <div className="relative mt-3"><FormMessage>{error}</FormMessage></div>}
    </Card>
  );
}
