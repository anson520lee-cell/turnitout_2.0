"use client";
import { Download, ShieldCheck } from "lucide-react";
import { RiskGauge } from "@/components/scan/risk-gauge";
import { riskPrintClass, riskStyle } from "@/components/scan/report-view";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/app";
import { headlineScore, overallForScore, type AutoReportResult, type Level, type Overall, type ReportParagraph } from "@/lib/auto-report/stitch";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const overallText: Record<Overall, { title: string; line: string }> = {
  low: { title: "Low", line: "Most of this text reads like natural writing. A few places are worth a second look." },
  moderate: { title: "Moderate", line: "Several stretches read like standard model-essay writing. Rewrite those in your own words first." },
  elevated: { title: "Elevated", line: "Large parts of this text read like standard model-essay writing. Start with the red paragraphs." },
};

const mark: Record<Level, string> = {
  high: "bg-risk/20 decoration-risk/70 underline decoration-2 underline-offset-[3px] print:bg-[#d6e3ff]",
  medium: "bg-warn/20 decoration-warn/70 underline decoration-1 underline-offset-[3px] print:bg-[#e8f0ff]",
  uncertain: "decoration-fg-subtle underline decoration-dotted underline-offset-[3px]",
  low: "",
};

const rail: Record<Level, string> = { high: "bg-risk", medium: "bg-warn", uncertain: "bg-fg-subtle", low: "bg-ok" };
// Charts use only blue and grey: high = strong blue, medium = light blue, the rest grey.
const chartBar: Record<Level, string> = { high: "bg-chart-high", medium: "bg-chart-mid", uncertain: "bg-chart-low", low: "bg-chart-low/35" };
const label: Record<Level, string> = { high: "High", medium: "Medium", uncertain: "Uncertain", low: "Low" };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const isFlagged = (r: Level) => r === "high" || r === "medium";
/** Share of a paragraph's sentences rated High or Medium, in whole percent. */
const paragraphShare = (p: ReportParagraph) => pct(p.sentences.filter((s) => isFlagged(s.risk)).length, p.sentences.length);

function Stat({ title, value, of, sub }: { title: string; value: string; of?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-ink-900/40 p-4">
      <p className="text-[12px] text-fg-subtle">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {value}
        {of && <span className="ml-1 text-[13px] font-normal text-fg-subtle">{of}</span>}
      </p>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

function ParagraphCard({ para }: { para: ReportParagraph }) {
  const flagged = para.sentences.filter((s) => s.risk !== "low");
  const share = paragraphShare(para);
  return (
    <Card id={`para-${para.p}`} className="relative scroll-mt-24 overflow-hidden p-5 sm:p-6 print:break-inside-avoid">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] opacity-80", rail[para.risk])} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">Paragraph {para.p}</span>
        <Badge tone={riskStyle[para.risk].tone} className={riskPrintClass[riskStyle[para.risk].tone]}>
          {label[para.risk]} risk
        </Badge>
        <span className="text-[12px] text-fg-subtle">
          <span className="font-mono font-medium text-fg-muted">{share}%</span> of sentences flagged
          {flagged.length > 0 && <> · {flagged.length} of {para.sentences.length} marked</>}
        </span>
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
              <p className="mt-1.5 border-l-2 border-[var(--line)] pl-3 text-fg">{s.text}</p>
              {s.why && <p className="mt-1.5 text-fg-muted">{s.why}</p>}
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
  const flaggedPct = Math.round(summary.flaggedShare * 100);
  const score = headlineScore(summary);
  const scorePct = Math.round(score * 100);
  const clear = Math.max(0, summary.sentences - flagged);
  const lowOnly = Math.max(0, summary.sentences - flagged - summary.uncertain);
  const overall = overallForScore(score);
  const dense = paragraphs.length > 14;
  const first = paragraphs.filter((p) => p.risk === "high").slice(0, 5);
  const text = overallText[overall];
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
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ok print:text-[#4a5266]">
              <ShieldCheck className="size-4" /> Report complete
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight print:text-[#10131c]">{title}</p>
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
            <RiskGauge level={overall} score={score} />
          </div>
          <div>
            <p className="text-[15px] leading-relaxed text-fg">
              <span className="font-semibold">AI score {scorePct}%</span>. {flaggedPct}% of sentences were flagged ({flagged} of {summary.sentences}), so the overall band is{" "}
              <span className="font-semibold">{text.title}</span>. {text.line}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat title="Flagged sentences" value={String(flagged)} of={`of ${summary.sentences}`} sub={`${flaggedPct}%`} />
              <Stat title="High risk" value={String(summary.high)} sub={`${pct(summary.high, summary.sentences)}% of text`} />
              <Stat title="Medium risk" value={String(summary.medium)} sub={`${pct(summary.medium, summary.sentences)}% of text`} />
              <Stat title="Not flagged" value={String(clear)} sub={`${pct(clear, summary.sentences)}% of text`} />
              <Stat title="Risky paragraphs" value={String(summary.riskyParagraphs)} of={`of ${summary.paragraphs}`} sub={`${pct(summary.riskyParagraphs, summary.paragraphs)}% of paragraphs`} />
              <Stat title="Words" value={summary.words.toLocaleString("en-HK")} />
              <Stat title="Avg. sentence" value={summary.sentences ? String(Math.round(summary.words / summary.sentences)) : "0"} of="words" />
              <Stat title="Sections read" value={String(pieces.reviewed)} of={`of ${pieces.total}`} sub={`${pct(pieces.reviewed, pieces.total)}% covered`} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-fg-subtle">
              The AI score comes from the share of sentences marked High or Medium, on a curve: below 60% of the sentences flagged it leans toward 0%, above 60% toward 100%. It is not the chance that AI wrote your text, and it is not a Turnitin score. Formal, tidy writing such as exam essays and academic prose can score high even when a person wrote every word, so a high score is a reason to check your own sentences, not proof that AI was used.
            </p>
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
          <h3 className="text-[15px] font-semibold tracking-tight">Sentence breakdown</h3>
          <div className="flex flex-wrap gap-3 text-[11.5px] text-fg-subtle">
            {([["high", summary.high], ["medium", summary.medium], ["uncertain", summary.uncertain], ["low", lowOnly]] as const).map(([l, n]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", chartBar[l])} />
                {label[l]} <span className="font-mono text-fg-muted">{n} · {pct(n, summary.sentences)}%</span>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-ink-900/60" role="img" aria-label={`${flaggedPct}% of sentences flagged`}>
          {([["high", summary.high], ["medium", summary.medium], ["uncertain", summary.uncertain], ["low", lowOnly]] as const).map(([l, n]) =>
            n > 0 ? <span key={l} className={cn("h-full", chartBar[l])} style={{ width: `${(n / Math.max(1, summary.sentences)) * 100}%` }} /> : null,
          )}
        </div>
      </Card>

      <Card className="p-5 sm:p-6 print:break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight">Risk by paragraph</h3>
          <div className="flex flex-wrap gap-3 text-[11.5px] text-fg-subtle">
            {(["high", "medium", "low"] as const).map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", chartBar[l])} />{label[l]}</span>
            ))}
          </div>
        </div>
        <div className="relative mt-5 h-40" role="list" aria-label="Share of flagged sentences in each paragraph, in order">
          {[0, 50, 100].map((g) => (
            <span key={g} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[var(--line)]" style={{ bottom: `${g}%` }}>
              <span className="absolute -top-2 left-0 pr-1 font-mono text-[10px] text-fg-subtle">{g}%</span>
            </span>
          ))}
          <div className="absolute inset-y-0 left-8 right-0 flex items-end gap-[3px]">
            {paragraphs.map((p) => {
              const share = paragraphShare(p);
              return (
                <a
                  key={p.p}
                  role="listitem"
                  href={`#para-${p.p}`}
                  title={`Paragraph ${p.p}: ${share}% of sentences flagged (${label[p.risk]} risk)`}
                  className="group relative flex h-full min-w-[6px] flex-1 items-end"
                >
                  {!dense && <span className="absolute inset-x-0 text-center font-mono text-[10.5px] text-fg-muted" style={{ bottom: `calc(${Math.max(share, 3)}% + 4px)` }}>{share}%</span>}
                  <span className={cn("block w-full rounded-t-[4px] opacity-90 transition group-hover:opacity-100 group-hover:brightness-125", chartBar[p.risk])} style={{ height: `${Math.max(share, 3)}%` }} />
                </a>
              );
            })}
          </div>
        </div>
        {!dense && (
          <div className="ml-8 mt-1.5 flex gap-[3px] font-mono text-[10px] text-fg-subtle" aria-hidden>
            {paragraphs.map((p) => <span key={p.p} className="min-w-[6px] flex-1 text-center">P{p.p}</span>)}
          </div>
        )}
        <p className="mt-3 text-[12px] text-fg-subtle">
          Each bar is the share of that paragraph&rsquo;s sentences that were flagged; the colour is the paragraph&rsquo;s risk level. Tall dark-blue bars are the places that read most like AI writing. That is the risk to fix, not a mistake in your text, and not a sign of who wrote it.
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
                {p.sentences.filter((s) => isFlagged(s.risk)).length} of {p.sentences.length} sentences flagged ({paragraphShare(p)}%)
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-fg-subtle">Rewrite them in your everyday words, the way you would explain the idea to a classmate.</p>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="px-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#b4bccf] print:text-[#3a4258]">Paragraph by paragraph</h3>
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
    </div>
  );
}
