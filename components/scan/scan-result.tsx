"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Info, ArrowRight, Download } from "lucide-react";
import type { AnalysisResult, RiskLevel, Signal } from "@/lib/scanning/types";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { RiskGauge } from "./risk-gauge";
import { SignalRadar } from "./signal-radar";
import { SentenceHighlights } from "./sentence-highlights";
import { ReadabilityCard } from "./readability-card";
import { brand } from "@/config/app";
import { disclaimers } from "@/config/services";
import { formatHKD, screeningPrices } from "@/config/pricing";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const levelTone: Record<RiskLevel, Tone> = { low: "success", moderate: "warn", elevated: "danger" };
const levelLabel: Record<RiskLevel, string> = { low: "Low", moderate: "Moderate", elevated: "Elevated" };

function SignalRow({ s, i }: { s: Signal; i: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-[var(--line)] last:border-0">
      <button
        type="button"
        data-press
        className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-xl px-3 py-4 text-left hover:bg-white/[0.03]"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium">{s.label}</span>
            {s.level ? <Badge tone={levelTone[s.level]}>{levelLabel[s.level]}</Badge> : <Badge>Not measured</Badge>}
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className={cn(
                "h-full rounded-full",
                s.level === "elevated" ? "bg-gradient-to-r from-violet to-risk" : s.level === "moderate" ? "bg-gradient-to-r from-accent to-warn" : "bg-gradient-to-r from-cyan to-ok",
              )}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(3, s.score ?? 0)}%` }}
              transition={{ duration: 1.1, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-2 text-[12.5px] text-fg-subtle">{s.measurement}</p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <p className="pb-4 pr-8 text-[13px] leading-relaxed text-fg-muted">{s.explanation}</p>}
    </li>
  );
}

export function ScanResult({ result, createdAt }: { result: AnalysisResult; createdAt?: string }) {
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
        <Badge>Website-generated · not a Turnitin result</Badge>
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
          <RiskGauge level={result.overallRisk} />
          <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center">
            {[
              ["Words", result.metadata.words],
              ["Sentences", result.metadata.sentences],
              ["Paragraphs", result.metadata.paragraphs],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-[var(--line)] bg-ink-900/50 py-2.5">
                <p className="text-[15px] font-semibold">{v}</p>
                <p className="text-[11px] text-fg-subtle">{k}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card tilt={5} className="p-5">
          <SignalRadar signals={result.signals} />
        </Card>
      </div>

      {result.readability && <ReadabilityCard r={result.readability} />}

      {result.sentences && result.sentences.length > 0 && <SentenceHighlights sentences={result.sentences} />}

      <Card className="px-5 sm:px-6">
        <h2 className="pt-5 text-[15px] font-semibold">Writing signals</h2>
        <ul>{result.signals.map((s, i) => <SignalRow key={s.id} s={s} i={i} />)}</ul>
      </Card>

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
                  {p.notes.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.notes.map((n) => (
                        <li key={n} className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11.5px] text-fg-muted">{n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold">Observations</h2>
        <ul className="mt-3 space-y-2">
          {result.recommendations.map((r) => (
            <li key={r} className="flex gap-2.5 text-[13.5px] text-fg-muted">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-5 flex gap-2 border-t border-[var(--line)] pt-4 text-[12.5px] leading-relaxed text-fg-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {disclaimers.freeScan}
        </p>
      </Card>

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
      <h2 className="relative mt-2 text-xl font-semibold tracking-tight">Need the actual screening result?</h2>
      <p className="relative mt-1.5 max-w-xl text-[13.5px] text-fg-muted">
        This scan is our estimate. A report runs your text through Turnitin, processed by a person, and delivers the result it returned.
      </p>
      <div className="relative mt-5 flex flex-wrap gap-2">
        <Link
          href="/services/screening"
          onClick={() => track("screening_service_clicked", { from: "scan_result" })}
          className={buttonClasses("primary", "md")}
        >
          Get AI &amp; similarity report · {formatHKD(screeningPrices.combined_screening)}
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/services/refinement" onClick={() => track("refinement_service_clicked", { from: "scan_result" })} className={buttonClasses("ghost", "md")}>
          Writing refinement
        </Link>
      </div>
    </div>
  );
}
