"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Lock } from "lucide-react";
import type { AnalysisResult, RiskLevel } from "@/lib/scanning/types";
import { freeRange } from "@/lib/scanning/free-range";
import { Card } from "@/components/ui/card";
import { HudCorners, HudLabel, Tile } from "@/components/ui/hud";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { RiskGauge } from "./risk-gauge";
import { SentenceHighlights } from "./sentence-highlights";
import { ReadabilityCard } from "./readability-card";
import { ModelFeedback } from "./model-feedback";
import { riskStyle } from "./report-view";
import { higherLevel, verdictLevel, type Risk } from "@/lib/report-format";
import { raiseScanLevel } from "@/app/actions/scan-report";
import { brand, freeScan } from "@/config/app";
import { reportPricing } from "@/config/pricing";
import { reportFromLabel } from "@/config/services";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const levelTone: Record<RiskLevel, Tone> = { low: "success", moderate: "warn", elevated: "danger" };
const levelLabel: Record<RiskLevel, string> = { low: "Low", moderate: "Moderate", elevated: "Elevated" };
const levelRank: Record<RiskLevel, number> = { low: 0, moderate: 1, elevated: 2 };

export function ScanResult({
  result,
  createdAt,
  feedback,
  storedLevel,
  verdictHint = null,
  shareHint = null,
}: {
  result: AnalysisResult;
  createdAt?: string;
  /** Saved scans: the level kept in the history, which may already include the review's reading. */
  storedLevel?: RiskLevel;
  /** Live scans only: the local model's written feedback, fetched as it arrives. */
  feedback?: { ticket: string; text: string; previousText?: string; scanId?: string | null } | null;
  /** The reviewer's verdict when it is already known (the live scan waited for it), so the dial never changes after it appears. */
  verdictHint?: Risk | null;
  /** The share of sentences the reviewer marked, when already known (same reason as `verdictHint`). */
  shareHint?: number | null;
}) {
  // The reviewer's overall verdict, shown next to the dial because the two can disagree.
  const [verdict, setVerdict] = useState<Risk | null>(verdictHint);
  // The share of sentences the reviewer marked: the range follows it, like the paid report's score does.
  const [reviewShare, setReviewShare] = useState<number | null>(shareHint);
  const onVerdict = useCallback((risk: Risk | null, share: number | null) => {
    setVerdict(risk);
    setReviewShare(share);
  }, []);
  const reviewLevel = verdict ? verdictLevel[verdict] : undefined;
  // The dial shows the highest reading: statistics, the review, and what the history already holds.
  const dialLevel: RiskLevel = higherLevel(higherLevel(result.overallRisk, reviewLevel), storedLevel);
  // Keep the history in step with the dial (once per scan, only when the review raised it).
  const scanId = feedback?.scanId ?? null;
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!scanId || !reviewLevel || synced.current === `${scanId}:${dialLevel}`) return;
    if (levelRank[dialLevel] <= levelRank[result.overallRisk]) return;
    synced.current = `${scanId}:${dialLevel}`;
    void raiseScanLevel(scanId, dialLevel);
  }, [scanId, reviewLevel, dialLevel, result.overallRisk]);
  // The free scan shows a 20-point range, never the exact score (that is the paid report's).
  const range = freeRange(reviewShare ?? result.standoutShare, dialLevel);
  if (result.metadata.isMock) {
    return <p className="text-risk">Development mock output is not shown as analysis.</p>;
  }
  return (
    <div className="space-y-5">
      <div className="hidden print:block">
        <p className="text-[20px] font-semibold">{brand.name} · Preliminary scan report</p>
        <p className="text-[12px] text-fg-subtle" suppressHydrationWarning>{createdAt ?? new Date().toLocaleString()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent" dot>Preliminary risk estimate</Badge>
        {createdAt && <span className="text-[12px] text-fg-subtle print:hidden">{createdAt}</span>}
        <button
          type="button"
          onClick={() => {
            track("scan_report_downloaded");
            window.print();
          }}
          className={buttonClasses("secondary", "sm", "ml-auto print:hidden")}
        >
          <Download className="size-3.5" /> Download report (PDF)
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <Card strong tilt={5} className="flex flex-col items-center justify-center p-6">
          <HudCorners />
          <HudLabel className="mb-3 self-start">AI score range</HudLabel>
          <RiskGauge level={dialLevel} range={range} />
          {verdict && (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-center text-[12.5px] text-fg-muted">
              Detailed review:
              <Badge tone={riskStyle[verdict].tone}>{riskStyle[verdict].label} risk</Badge>
            </p>
          )}
          <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center">
            {[
              ["Words", result.metadata.words],
              ["Sentences", result.metadata.sentences],
              ["Paragraphs", result.metadata.paragraphs],
            ].map(([k, v]) => (
              <Tile key={k} className="py-2.5">
                <p className="tile-num text-[18px] font-semibold">{v}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">{k}</p>
              </Tile>
            ))}
          </div>
        </Card>
        <LockedReport range={range} />
      </div>

      {feedback && <ModelFeedback ticket={feedback.ticket} text={feedback.text} previousText={feedback.previousText} scanId={feedback.scanId} sentences={result.metadata.sentences} onVerdict={onVerdict} />}

      {result.readability && <ReadabilityCard r={result.readability} />}

      {result.sentences && result.sentences.length > 0 && <SentenceHighlights sentences={result.sentences} />}

      {result.paragraphs.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Paragraph indicators</h2>
          <ol className="mt-4 space-y-2.5">
            {result.paragraphs.map((p) => (
              <li key={p.index} className="flex gap-3 rounded-xl border border-[var(--line)] bg-ink-900/40 p-3.5">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 w-1 shrink-0 self-stretch rounded-full",
                    p.level === "elevated" ? "bg-risk" : p.level === "moderate" ? "bg-warn" : "bg-ok",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-fg-subtle">¶ {p.index + 1} · {p.words} words</span>
                    <Badge tone={levelTone[p.level]}>{levelLabel[p.level]}</Badge>
                  </div>
                  {p.excerpt && <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{p.excerpt}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="print:hidden">
        <NextStep />
      </div>
    </div>
  );
}

function NextStep() {
  return (
    <div className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8">
      <div aria-hidden className="absolute -right-16 -top-16 size-56 rounded-full bg-accent/20 blur-3xl" />
      <p className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Optional next step</p>
      <h2 className="relative mt-2 text-xl font-semibold tracking-tight">Want the full picture?</h2>
      <p className="relative mt-1.5 max-w-xl text-[13.5px] text-fg-muted">
        This scan is a quick estimate. The report reads your whole text sentence by sentence and shows, paragraph by paragraph, where it could be misread as AI-written, with a PDF to download.
      </p>
      <div className="relative mt-5 flex flex-wrap gap-2">
        <Link
          href="/services/screening"
          onClick={() => track("screening_service_clicked", { from: "scan_result" })}
          className={buttonClasses("primary", "md")}
        >
          Get AI-writing risk report · {reportFromLabel}
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/services/refinement" onClick={() => track("refinement_service_clicked", { from: "scan_result" })} className={buttonClasses("ghost", "md")}>
          Writing refinement
        </Link>
      </div>
    </div>
  );
}

const LOCKED = [
  ["Exact AI score", "the precise percentage, not a range"],
  ["Every sentence rated", "High, Medium, Uncertain or Low, with the reason"],
  ["Paragraph breakdown", "where in your text the risk sits"],
  [`Up to ${reportPricing.maxChars.toLocaleString("en-US")} characters`, `the whole essay, not ${freeScan.maxChars.toLocaleString("en-US")}`],
] as const;

/** What the free scan leaves out, shown next to the range: the paid report's extras, locked. */
function LockedReport({ range }: { range: { lo: number; hi: number } }) {
  return (
    <Card tilt={5} className="relative overflow-hidden p-5 sm:p-6 print:hidden">
      <HudCorners />
      <div aria-hidden className="absolute -right-20 -top-20 size-56 rounded-full bg-accent/15 blur-3xl" />
      <HudLabel className="relative mb-1">Full report</HudLabel>
      <h2 className="relative text-[17px] font-semibold tracking-tight">
        Your score is somewhere between {range.lo}% and {range.hi}%.
      </h2>
      <p className="relative mt-1 text-[13px] text-fg-muted">The quick scan stops at a range. The full report reads every sentence and shows:</p>
      <ul className="relative mt-4 space-y-2">
        {LOCKED.map(([k, v]) => (
          <li key={k} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-ink-900/50 px-3.5 py-2.5">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 text-[13px]">
              <span className="font-medium text-fg">{k}</span>
              <span className="text-fg-subtle"> · {v}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/services/screening"
        onClick={() => track("screening_service_clicked", { from: "scan_locked" })}
        className={buttonClasses("primary", "md", "relative mt-5 w-full justify-center")}
      >
        Unlock the exact score · {reportFromLabel}
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}
