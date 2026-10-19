"use client";
import { Download, Info, ShieldCheck } from "lucide-react";
import { RiskGauge } from "@/components/scan/risk-gauge";
import { riskPrintClass, riskStyle } from "@/components/scan/report-view";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/app";
import { disclaimers } from "@/config/services";
import type { AutoReportResult, Level, Overall, ReportParagraph } from "@/lib/auto-report/stitch";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const overallText: Record<Overall, { title: string; line: string }> = {
  low: { title: "Low", line: "Most of this text reads like natural writing. A few places are worth a second look." },
  moderate: { title: "Moderate", line: "Several stretches read like standard model-essay writing. Rewrite those in your own words first." },
  elevated: { title: "Elevated", line: "Large parts of this text read like standard model-essay writing. Start with the red paragraphs." },
};

const mark: Record<Level, string> = {
  high: "bg-risk/20 decoration-risk/70 underline decoration-2 underline-offset-[3px] print:bg-[#ffd9de]",
  medium: "bg-warn/20 decoration-warn/70 underline decoration-1 underline-offset-[3px] print:bg-[#ffecc0]",
  uncertain: "decoration-fg-subtle underline decoration-dotted underline-offset-[3px]",
  low: "",
};

const rail: Record<Level, string> = { high: "bg-risk", medium: "bg-warn", uncertain: "bg-fg-subtle", low: "bg-ok" };
const label: Record<Level, string> = { high: "High", medium: "Medium", uncertain: "Uncertain", low: "Low" };

function Stat({ title, value, of }: { title: string; value: string; of?: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-ink-900/40 p-4">
      <p className="text-[12px] text-fg-subtle">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {value}
        {of && <span className="ml-1 text-[13px] font-normal text-fg-subtle">{of}</span>}
      </p>
    </div>
  );
}

function ParagraphCard({ para }: { para: ReportParagraph }) {
  const flagged = para.sentences.filter((s) => s.risk !== "low");
  return (
    <Card id={`para-${para.p}`} className="relative scroll-mt-24 overflow-hidden p-5 sm:p-6 print:break-inside-avoid">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] opacity-80", rail[para.risk])} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">Paragraph {para.p}</span>
        <Badge tone={riskStyle[para.risk].tone} className={riskPrintClass[riskStyle[para.risk].tone]}>
          {label[para.risk]} risk
        </Badge>
        {flagged.length > 0 && <span className="text-[12px] text-fg-subtle">{flagged.length} of {para.sentences.length} sentences marked</span>}
      </div>
      <p className="mt-3 text-[14.5px] leading-[1.75] text-fg-muted">
        {para.sentences.map((s) => (
          <span key={s.n}>
            <span className={cn("rounded-[3px] px-0.5", mark[s.risk])} title={s.risk === "low" ? undefined : `${label[s.risk]} risk`}>{s.text}</span>{" "}
          </span>
        ))}
      </p>
      {para.note && <p className="mt-3 text-[12.5px] text-fg-subtle">{para.note}</p>}
      {flagged.length > 0 && (
        <ul className="mt-4 space-y-2.5 border-t border-[var(--line)] pt-4">
          {flagged.map((s) => (
            <li key={s.n} className="text-[13px] leading-relaxed">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-fg-subtle">Sentence {s.n}</span>
                <Badge tone={riskStyle[s.risk].tone} className={riskPrintClass[riskStyle[s.risk].tone]}>{label[s.risk]}</Badge>
              </div>
              {s.why && <p className="mt-1 text-fg-muted">{s.why}</p>}
              {s.ask && (
                <p className="mt-1 text-[#a9c1ff] print:text-[#2b3a8f]">
                  <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">Ask yourself</span>
                  {s.ask}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The finished automatic report: overall level, a map of every paragraph, then each paragraph with its marked sentences. */
export function AutoReportView({ title, finishedAt, result }: { title: string; finishedAt: string; result: AutoReportResult }) {
  const { summary, paragraphs, grammar, pieces } = result;
  const flagged = summary.high + summary.medium;
  const first = paragraphs.filter((p) => p.risk === "high").slice(0, 5);
  const text = overallText[summary.overall];
  const partial = pieces.reviewed < pieces.total;
  return (
    <div className="space-y-5">
      <div className="hidden print:block">
        <p className="text-[20px] font-semibold">{brand.name} · AI-writing risk report</p>
        <p className="text-[12px] text-fg-subtle">{title} · {finishedAt}</p>
      </div>

      <Card strong className="noise relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_90%_0%,rgb(91_140_255/0.14),transparent_70%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ok">
              <ShieldCheck className="size-4" /> Report complete
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-[13px] text-fg-muted">AI-writing risk, sentence by sentence · {finishedAt}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              track("report_downloaded");
              window.print();
            }}
            className={buttonClasses("primary", "md", "print:hidden")}
          >
            <Download className="size-4" /> Download PDF
          </button>
        </div>

        <div className="relative mt-6 grid items-center gap-6 border-t border-[var(--line)] pt-6 lg:grid-cols-[minmax(0,260px)_1fr]">
          <div>
            <RiskGauge level={summary.overall} />
            <p className="mt-2 text-center text-[13px] font-medium">{text.title} overall</p>
          </div>
          <div>
            <p className="text-[15px] leading-relaxed text-fg">{text.line}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat title="Sentences marked" value={String(flagged)} of={`of ${summary.sentences}`} />
              <Stat title="Paragraphs at risk" value={String(summary.riskyParagraphs)} of={`of ${summary.paragraphs}`} />
              <Stat title="Words" value={summary.words.toLocaleString("en-HK")} />
              <Stat title="Sections read" value={String(pieces.reviewed)} of={`of ${pieces.total}`} />
            </div>
          </div>
        </div>
      </Card>

      {partial && (
        <p className="rounded-2xl border border-warn/30 bg-warn/10 p-4 text-[13px] text-warn">
          Only {pieces.reviewed} of {pieces.total} sections could be read, so the totals cover part of your text.
        </p>
      )}

      <Card className="p-5 sm:p-6 print:break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight">Map of your text</h3>
          <div className="flex flex-wrap gap-3 text-[11.5px] text-fg-subtle">
            {(["high", "medium", "low"] as const).map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", rail[l])} />{label[l]}</span>
            ))}
          </div>
        </div>
        <div className="mt-4 flex h-9 gap-[3px]" role="list" aria-label="Risk of each paragraph, in order">
          {paragraphs.map((p) => (
            <a
              key={p.p}
              role="listitem"
              href={`#para-${p.p}`}
              title={`Paragraph ${p.p}: ${label[p.risk]} risk`}
              className={cn("min-w-[6px] flex-1 rounded-[4px] opacity-90 transition hover:opacity-100 hover:brightness-125", rail[p.risk])}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-fg-subtle">
          Red marks the places that read most like AI writing. That is the risk to fix, not a mistake in your text, and not a sign of who wrote it.
        </p>
      </Card>

      {first.length > 0 && (
        <Card className="p-5 sm:p-6 print:break-inside-avoid">
          <h3 className="text-[15px] font-semibold tracking-tight">Rewrite these first</h3>
          <ul className="mt-3 space-y-2 text-[13.5px] text-fg-muted">
            {first.map((p) => (
              <li key={p.p}>
                <a href={`#para-${p.p}`} className="font-medium text-fg underline-offset-2 hover:underline">Paragraph {p.p}</a>
                {": "}
                {p.sentences.filter((s) => s.risk === "high" || s.risk === "medium").length} marked sentences close together
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-fg-subtle">Rewrite them in your everyday words, the way you would explain the idea to a classmate.</p>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="px-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#c7b8ff] print:text-[#4b3a9a]">Paragraph by paragraph</h3>
        {paragraphs.map((p) => <ParagraphCard key={p.p} para={p} />)}
      </div>

      {grammar.length > 0 && (
        <Card className="p-5 sm:p-6 print:break-inside-avoid">
          <h3 className="text-[15px] font-semibold tracking-tight">Grammar to check</h3>
          <p className="mt-1 text-[12.5px] text-fg-subtle">Where and what kind only. The fix is yours to make.</p>
          <ul className="mt-3 space-y-2 text-[13.5px] text-fg-muted">
            {grammar.map((g, i) => (
              <li key={i}><span className="font-mono text-[11px] text-fg-subtle">Sentence {g.n}</span> · {g.issue}</li>
            ))}
          </ul>
        </Card>
      )}

      <p className="flex gap-2 rounded-2xl border border-[var(--line)] bg-ink-900/40 p-4 text-[12.5px] leading-relaxed text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          {disclaimers.freeScan} Ratings are guidance from an automated reviewer and can be wrong in both directions. {disclaimers.noGuarantee}
        </span>
      </p>
    </div>
  );
}
